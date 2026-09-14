// ---------------------------------------------------------------------------
// Pipeline de génération de site en un clic depuis la fiche client :
//
//   analyse IA → génération → déploiement test → email de validation
//     → boucle de retouches ciblées → mise en production automatisée
//       → devis puis facture déclenchés automatiquement.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { alerter } from '@/lib/integrations/alertes';
import { genererSite, genererSiteDemo, type BriefSite, type SiteGenere } from '@/lib/integrations/claude';
import { creerCname, statutSsl } from '@/lib/integrations/cloudflare';
import { envoyerEmail, gabaritValidation } from '@/lib/integrations/email';
import { ajouterDomaine, creerProjet, deployer, type FichierDeploiement } from '@/lib/integrations/vercel';
import { creerDevisDepuisSite, facturerDevis } from './facturation';
import type { Client, Devis, Facture, HostingInstance, Site, SiteVersion, ValidationClient } from '@/lib/types';

function slugifier(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/** Les pages générées deviennent des fichiers statiques déployables. */
function versFichiers(genere: SiteGenere, mentionsLegales: string): FichierDeploiement[] {
  const fichiers = genere.pages.map((page) => ({
    chemin: page.slug === 'accueil' ? 'index.html' : `${page.slug}.html`,
    contenu: page.html,
  }));
  // La mise en production exige des mentions légales : elles sont ajoutées ici,
  // jamais laissées à la génération IA.
  fichiers.push({ chemin: 'mentions-legales.html', contenu: mentionsLegales });
  return fichiers;
}

function pageMentionsLegales(client: Client): string {
  const e = config.entreprise;
  return [
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Mentions légales</title></head><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6">',
    '<h1>Mentions légales</h1>',
    `<h2>Éditeur du site</h2><p>${client.raison_sociale}`,
    client.siret ? `<br>SIRET : ${client.siret}` : '',
    client.adresse ? `<br>${client.adresse}` : '',
    client.code_postal || client.ville ? `<br>${[client.code_postal, client.ville].filter(Boolean).join(' ')}` : '',
    `<br>Email : ${client.email}`,
    client.telephone ? `<br>Téléphone : ${client.telephone}` : '',
    '</p>',
    `<h2>Conception et hébergement</h2><p>${e.nom} — ${e.exploitant}, microentreprise, SIREN ${e.siren}, ${e.adresse}.`,
    '<br>Hébergement : Vercel Inc. et Cloudflare Inc.</p>',
    '<h2>Données personnelles</h2><p>Les informations transmises via le formulaire de contact sont utilisées uniquement pour répondre à votre demande. ',
    'Conformément au RGPD, vous disposez d\'un droit d\'accès, de rectification et de suppression en écrivant à ',
    `${client.email}.</p>`,
    '</body></html>',
  ].join('');
}

function briefDepuis(client: Client, site: Site, retours: string | null): BriefSite {
  return {
    raisonSociale: client.raison_sociale,
    secteur: site.secteur ?? client.secteur ?? 'artisan',
    ville: client.ville,
    telephone: client.telephone,
    email: client.email,
    adresse: client.adresse,
    options: site.options_actives ?? [],
    nbPages: site.nb_pages,
    retours,
  };
}

export interface ResultatGeneration {
  site: Site;
  version: SiteVersion;
  validation: ValidationClient;
  urlTest: string;
  coutIa: number;
}

/**
 * Génération en un clic. Si `siteId` est absent, un site est créé pour le
 * client ; sinon une nouvelle version est produite (boucle de retouches).
 */
export async function genererEtDeployerTest(params: {
  clientId: string;
  siteId?: string | null;
  retours?: string | null;
  nbPages?: number;
  options?: string[];
}): Promise<ResultatGeneration> {
  const client = await db.get<Client>('clients', params.clientId);
  if (!client) throw new Error('Client introuvable.');

  let site = params.siteId ? await db.get<Site>('sites', params.siteId) : null;
  if (!site) {
    site = await db.insert<Site>('sites', {
      client_id: client.id,
      nom: client.raison_sociale,
      secteur: client.secteur,
      statut: 'brouillon',
      url_test: null,
      url_production: null,
      version_actuelle: 0,
      nb_pages: params.nbPages ?? 5,
      options_actives: params.options ?? [],
      cout_generation_ia: 0,
      derniere_generation: null,
      mise_en_production_le: null,
    });
  }

  const genere = config.demo
    ? genererSiteDemo(briefDepuis(client, site, params.retours ?? null))
    : await genererSite(briefDepuis(client, site, params.retours ?? null));

  const fichiers = versFichiers(genere, pageMentionsLegales(client));
  const nomProjet = slugifier(`${client.raison_sociale}-${site.id.slice(0, 6)}`);

  let urlTest: string;
  if (config.demo) {
    urlTest = `https://${nomProjet}-test.vercel.app`;
  } else {
    const hebergement = await db.findOne<HostingInstance>('hosting_instances', { site_id: site.id });
    let projetId = hebergement?.projet_externe_id ?? null;
    if (!projetId) {
      projetId = (await creerProjet(nomProjet)).id;
    }
    urlTest = (await deployer(nomProjet, fichiers, 'preview')).url;

    if (hebergement) {
      await db.update('hosting_instances', hebergement.id, {
        projet_externe_id: projetId,
        derniere_verification: new Date().toISOString(),
      });
    } else {
      await db.insert('hosting_instances', {
        site_id: site.id,
        plateforme: 'vercel',
        projet_externe_id: projetId,
        domaine: null,
        sous_domaine: `${nomProjet}.${config.cloudflare.rootDomain}`,
        statut_ssl: 'en_attente',
        dns_configure: false,
        cout_mensuel_reel: 0.45,
        prix_facture_mensuel: 0,
      });
    }
  }

  const numeroVersion = site.version_actuelle + 1;
  const version = await db.insert<SiteVersion>('site_versions', {
    site_id: site.id,
    version: numeroVersion,
    libelle: params.retours ? 'Retouches client' : 'Génération initiale',
    contenu: { pages: genere.pages, palette: genere.palette, meta: genere.meta },
    prompt_utilise: `${genere.nom} — ${site.secteur ?? ''}`,
    modele_ia: genere.modele,
    cout_ia: genere.coutEuros,
    deploy_url: urlTest,
    cree_par: 'ia',
  });

  site = (await db.update<Site>('sites', site.id, {
    statut: 'test',
    url_test: urlTest,
    version_actuelle: numeroVersion,
    cout_generation_ia: Number((site.cout_generation_ia + genere.coutEuros).toFixed(4)),
    derniere_generation: new Date().toISOString(),
  }))!;

  // Email de validation avec boutons « j'approuve » / « je souhaite des modifications ».
  const token = randomUUID();
  const validation = await db.insert<ValidationClient>('validations_client', {
    site_id: site.id,
    version: numeroVersion,
    token,
    statut: 'envoyee',
    commentaire: null,
    envoye_le: new Date().toISOString(),
    repondu_le: null,
    expire_le: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });

  const gabarit = gabaritValidation({ raisonSociale: client.raison_sociale, urlTest, token });
  await envoyerEmail({
    destinataire: client.email,
    sujet: gabarit.sujet,
    html: gabarit.html,
    gabarit: 'validation_site',
    clientId: client.id,
  });

  return { site, version, validation, urlTest, coutIa: genere.coutEuros };
}

export interface ResultatProduction {
  site: Site;
  urlProduction: string;
  devis: Devis;
  facture: Facture;
}

/**
 * Mise en production automatisée après approbation du client :
 * déploiement production, DNS et SSL, puis déclenchement du devis et de la
 * facture selon les options réellement livrées.
 */
export async function mettreEnProduction(siteId: string, domaine?: string): Promise<ResultatProduction> {
  const site = await db.get<Site>('sites', siteId);
  if (!site) throw new Error('Site introuvable.');
  const client = await db.get<Client>('clients', site.client_id);
  if (!client) throw new Error('Client introuvable.');

  const version = await db.findOne<SiteVersion>('site_versions', {
    site_id: site.id,
    version: site.version_actuelle,
  });
  if (!version) throw new Error('Aucune version générée pour ce site.');

  const nomProjet = slugifier(`${client.raison_sociale}-${site.id.slice(0, 6)}`);
  const sousDomaine = `${slugifier(client.raison_sociale)}.${config.cloudflare.rootDomain}`;
  const domaineFinal = domaine ?? sousDomaine;

  let urlProduction: string;
  let ssl = 'actif';

  if (config.demo) {
    urlProduction = `https://${domaineFinal}`;
  } else {
    const contenu = version.contenu as { pages?: { slug: string; html: string }[] };
    const fichiers: FichierDeploiement[] = (contenu.pages ?? []).map((page) => ({
      chemin: page.slug === 'accueil' ? 'index.html' : `${page.slug}.html`,
      contenu: page.html,
    }));
    fichiers.push({ chemin: 'mentions-legales.html', contenu: pageMentionsLegales(client) });

    const deploiement = await deployer(nomProjet, fichiers, 'production');
    urlProduction = `https://${domaineFinal}`;

    const hebergement = await db.findOne<HostingInstance>('hosting_instances', { site_id: site.id });
    if (hebergement?.projet_externe_id) {
      await ajouterDomaine(hebergement.projet_externe_id, domaineFinal);
    }
    await creerCname(domaineFinal, new URL(deploiement.url).hostname);
    ssl = await statutSsl();
  }

  const hebergement = await db.findOne<HostingInstance>('hosting_instances', { site_id: site.id });
  if (hebergement) {
    await db.update('hosting_instances', hebergement.id, {
      domaine: domaineFinal,
      sous_domaine: sousDomaine,
      statut_ssl: ssl,
      dns_configure: true,
      prix_facture_mensuel: 19,
      derniere_verification: new Date().toISOString(),
    });
  } else {
    await db.insert('hosting_instances', {
      site_id: site.id,
      plateforme: 'vercel',
      projet_externe_id: null,
      domaine: domaineFinal,
      sous_domaine: sousDomaine,
      statut_ssl: ssl,
      dns_configure: true,
      cout_mensuel_reel: 0.45,
      prix_facture_mensuel: 19,
      derniere_verification: new Date().toISOString(),
    });
  }

  const siteMisAJour = (await db.update<Site>('sites', site.id, {
    statut: 'production',
    url_production: urlProduction,
    mise_en_production_le: new Date().toISOString(),
  }))!;

  // Déclenchement automatique du devis puis de la facture.
  const { devis } = await creerDevisDepuisSite(site.id);
  const { facture } = await facturerDevis(devis.id);

  await alerter(`✅ ${client.raison_sociale} est en production : ${urlProduction} (facture ${facture.numero}).`);

  return { site: siteMisAJour, urlProduction, devis, facture };
}

/** Réponse du client à l'email de validation. */
export async function enregistrerValidation(
  token: string,
  reponse: 'approuve' | 'modifications',
  commentaire?: string,
): Promise<{ validation: ValidationClient; production: ResultatProduction | null }> {
  const validation = await db.findOne<ValidationClient>('validations_client', { token });
  if (!validation) throw new Error('Lien de validation inconnu.');
  if (new Date(validation.expire_le) < new Date()) {
    await db.update('validations_client', validation.id, { statut: 'expiree' });
    throw new Error('Ce lien de validation a expiré.');
  }

  const misAJour = (await db.update<ValidationClient>('validations_client', validation.id, {
    statut: reponse === 'approuve' ? 'approuvee' : 'modifications_demandees',
    commentaire: commentaire ?? null,
    repondu_le: new Date().toISOString(),
  }))!;

  if (reponse !== 'approuve') {
    await alerter(`✏️ Retouches demandées sur le site ${validation.site_id} : ${commentaire ?? 'sans détail'}`);
    return { validation: misAJour, production: null };
  }

  return { validation: misAJour, production: await mettreEnProduction(validation.site_id) };
}

/** Rollback : remet en ligne une version antérieure du site. */
export async function revenirVersion(siteId: string, version: number): Promise<Site> {
  const cible = await db.findOne<SiteVersion>('site_versions', { site_id: siteId, version });
  if (!cible) throw new Error(`Version ${version} introuvable pour ce site.`);

  const site = await db.get<Site>('sites', siteId);
  if (!site) throw new Error('Site introuvable.');

  // La version redevient courante sans être dupliquée : l'historique reste lisible.
  return (await db.update<Site>('sites', siteId, {
    version_actuelle: version,
    url_test: cible.deploy_url ?? site.url_test,
  }))!;
}
