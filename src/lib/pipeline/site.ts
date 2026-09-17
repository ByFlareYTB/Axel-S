// ---------------------------------------------------------------------------
// Pipeline de génération de site en un clic depuis la fiche client :
//
//   analyse IA → génération → déploiement test → email de validation
//     → boucle de retouches ciblées → mise en production automatisée
//       → devis puis facture déclenchés automatiquement.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { applicationLocaleUniquement, config } from '@/lib/config';
import { db } from '@/lib/db';
import { alerter } from '@/lib/integrations/alertes';
import { genererSite, genererSiteDemo, type BriefSite, type SiteGenere } from '@/lib/integrations/claude';
import { creerCname, statutSsl } from '@/lib/integrations/cloudflare';
import { envoyerEmail, gabaritValidation } from '@/lib/integrations/email';
import { estDisponible, exigerCapacite } from '@/lib/integrations/prerequis';
import { ajouterDomaine, creerProjet, deployer, type FichierDeploiement } from '@/lib/integrations/vercel';
import { notifier } from '@/lib/notifications';
import { creerDevisDepuisSite, facturerDevis } from './facturation';
import { enregistrerVersion, restaurerSauvegarde } from './sauvegarde';
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

/**
 * Déploie une version en preview, si et seulement si l'hébergement est
 * configuré. Renvoie l'URL publique, ou null quand il ne l'est pas : le site
 * reste alors consultable en aperçu local.
 */
async function deployerPreview(
  site: Site,
  nomProjet: string,
  fichiers: FichierDeploiement[],
): Promise<string | null> {
  if (config.demo) return `https://${nomProjet}-test.vercel.app`;
  if (!estDisponible('hebergement')) return null;

  const hebergement = await db.findOne<HostingInstance>('hosting_instances', { site_id: site.id });
  const projetId = hebergement?.projet_externe_id ?? (await creerProjet(nomProjet)).id;
  const urlTest = (await deployer(nomProjet, fichiers, 'preview')).url;

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

  return urlTest;
}

export interface DemandeValidation {
  validation: ValidationClient;
  /** Page que le client doit ouvrir pour répondre. */
  lien: string;
  emailEnvoye: boolean;
  /**
   * Pourquoi l'email n'est pas parti, quand il n'est pas parti.
   *
   * Un envoi silencieusement raté est pire qu'un envoi raté : sans cette
   * raison, on croit l'emailing mal configuré alors qu'il refuse simplement
   * le destinataire.
   */
  raisonNonEnvoye: string | null;
}

/**
 * Crée la demande de validation et l'envoie au client.
 *
 * Sans fournisseur d'emailing, la demande est tout de même enregistrée et son
 * lien renvoyé : vous le transmettez alors vous-même. Refuser de créer la
 * demande obligerait à tout recommencer une fois Resend configuré.
 */
async function demanderValidation(
  site: Site,
  client: Client,
  version: number,
  urlTest: string,
): Promise<DemandeValidation> {
  const token = randomUUID();
  const validation = await db.insert<ValidationClient>('validations_client', {
    site_id: site.id,
    version,
    token,
    statut: 'envoyee',
    commentaire: null,
    envoye_le: new Date().toISOString(),
    repondu_le: null,
    expire_le: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });

  const lien = `${config.appBaseUrl}/validation/${token}`;
  if (!config.demo && !estDisponible('emailing')) {
    return {
      validation,
      lien,
      emailEnvoye: false,
      raisonNonEnvoye:
        "Aucun fournisseur d'emailing configuré (RESEND_API_KEY absente).",
    };
  }

  // L'envoi peut échouer pour mille raisons hors de notre contrôle. La demande
  // reste valable : son lien est renvoyé pour être transmis à la main, et la
  // raison remonte telle quelle — c'est elle qui dit quoi corriger.
  try {
    const gabarit = gabaritValidation({ raisonSociale: client.raison_sociale, urlTest, token });
    await envoyerEmail({
      destinataire: client.email,
      sujet: gabarit.sujet,
      html: gabarit.html,
      gabarit: 'validation_site',
      clientId: client.id,
    });
    return { validation, lien, emailEnvoye: true, raisonNonEnvoye: null };
  } catch (err) {
    console.warn('[validation] envoi impossible :', err);
    return { validation, lien, emailEnvoye: false, raisonNonEnvoye: message(err) };
  }
}

export interface ResultatGeneration {
  site: Site;
  version: SiteVersion;
  /** Null tant qu'aucune URL publique n'existe : rien n'est envoyé au client. */
  validation: ValidationClient | null;
  /** Lien à transmettre au client si l'emailing n'est pas configuré. */
  lienValidation: string | null;
  emailEnvoye: boolean;
  /** URL de test publique, ou null si l'hébergement n'est pas configuré. */
  urlTest: string | null;
  /** Aperçu local, toujours disponible. */
  apercu: string;
  deploye: boolean;
  coutIa: number;
  /** Défauts constatés sur le site généré. Vide s'il est livrable tel quel. */
  avertissements: string[];
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
  // Seule la génération est indispensable. L'hébergement est une étape
  // distincte : voir ce que l'IA a produit ne doit pas exiger un compte Vercel.
  exigerCapacite('generation_ia');

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
      version_sauvegarde: null,
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

  // ENREGISTREMENT IMMÉDIAT. La génération vient d'être payée : elle est
  // persistée avant toute étape qui peut échouer. Déployer ou prévenir le
  // client sont des suites souhaitables, jamais des conditions de survie du
  // travail produit.
  const { version, sauvegardee } = await enregistrerVersion(site, {
    libelle: params.retours ? 'Retouches client' : 'Génération initiale',
    contenu: { pages: genere.pages, palette: genere.palette, meta: genere.meta },
    promptUtilise: `${genere.nom} — ${site.secteur ?? ''}`,
    modeleIa: genere.modele,
    coutIa: genere.coutEuros,
    deployUrl: null,
  });

  site = (await db.update<Site>('sites', site.id, {
    statut: 'test',
    version_actuelle: version.version,
    version_sauvegarde: sauvegardee,
    cout_generation_ia: Number((site.cout_generation_ia + genere.coutEuros).toFixed(4)),
    derniere_generation: new Date().toISOString(),
  }))!;

  const avertissements = [...genere.avertissements];

  // Déploiement : une panne de l'hébergeur ne doit pas emporter la génération.
  const fichiers = versFichiers(genere, pageMentionsLegales(client));
  const nomProjet = slugifier(`${client.raison_sociale}-${site.id.slice(0, 6)}`);

  let urlTest: string | null = null;
  try {
    urlTest = await deployerPreview(site, nomProjet, fichiers);
  } catch (err) {
    avertissements.push(
      `Site généré et conservé, mais la mise en ligne a échoué : ${message(err)} ` +
        'Consultez l’aperçu, puis réessayez avec « Déployer en test » — sans nouvelle génération.',
    );
  }

  if (urlTest) {
    site = (await db.update<Site>('sites', site.id, { url_test: urlTest }))!;
    await db.update('site_versions', version.id, { deploy_url: urlTest });
  }

  // La demande de validation n'a de sens que si le client peut ouvrir le site.
  let demande: DemandeValidation | null = null;
  if (urlTest) {
    try {
      demande = await demanderValidation(site, client, version.version, urlTest);
      if (demande.emailEnvoye && applicationLocaleUniquement()) {
        avertissements.push(avertissementLocalhost(client.email));
      }
      if (demande.raisonNonEnvoye) {
        avertissements.push(
          `L’email de validation n’est pas parti : ${demande.raisonNonEnvoye} ` +
            `Transmettez ce lien au client : ${demande.lien}`,
        );
      }
    } catch (err) {
      avertissements.push(
        `Site en ligne, mais la demande de validation n’a pas pu être créée : ${message(err)}`,
      );
    }
  }

  return {
    site,
    version,
    validation: demande?.validation ?? null,
    lienValidation: demande?.lien ?? null,
    emailEnvoye: demande?.emailEnvoye ?? false,
    urlTest,
    apercu: `/apercu/${site.id}`,
    deploye: Boolean(urlTest),
    coutIa: genere.coutEuros,
    avertissements,
  };
}

/** Message lisible d'une exception, pour l'insérer dans un avertissement. */
function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Un email parti avec des liens en localhost est pire qu'un email non parti :
 * le client le reçoit, clique, et tombe sur rien — sans que rien ne signale
 * l'anomalie de votre côté.
 */
function avertissementLocalhost(destinataire: string): string {
  return (
    `Email envoyé à ${destinataire}, mais les boutons de validation pointent vers ` +
    `${config.appBaseUrl} — une adresse qui n'existe que sur votre machine. ` +
    'Pour un vrai client, hébergez l’application et renseignez APP_BASE_URL avec son adresse publique.'
  );
}


export interface ResultatDeploiement {
  site: Site;
  urlTest: string;
  validation: ValidationClient | null;
  lienValidation: string | null;
  emailEnvoye: boolean;
  /** Pourquoi l'email n'est pas parti, quand il n'est pas parti. */
  raisonNonEnvoye: string | null;
}

/**
 * Déploie en test la version déjà générée d'un site, sans rappeler l'IA.
 *
 * Indispensable dès lors que génération et hébergement sont découplés : un
 * site produit avant que Vercel ne soit configuré doit pouvoir être mis en
 * ligne sans être régénéré — donc sans être repayé.
 */
export async function deployerEnTest(siteId: string): Promise<ResultatDeploiement> {
  exigerCapacite('hebergement');

  const site = await db.get<Site>('sites', siteId);
  if (!site) throw new Error('Site introuvable.');

  const client = await db.get<Client>('clients', site.client_id);
  if (!client) throw new Error('Client introuvable.');

  const version = await db.findOne<SiteVersion>('site_versions', {
    site_id: site.id,
    version: site.version_actuelle,
  });
  if (!version) {
    throw new Error("Ce site n'a aucune version générée. Lancez d'abord une génération.");
  }

  const contenu = version.contenu as { pages?: { slug: string; html: string }[] };
  const pages = contenu.pages ?? [];
  if (pages.length === 0) {
    throw new Error('La version courante ne contient aucune page.');
  }

  const fichiers: FichierDeploiement[] = pages.map((page) => ({
    chemin: page.slug === 'accueil' ? 'index.html' : `${page.slug}.html`,
    contenu: page.html,
  }));
  fichiers.push({ chemin: 'mentions-legales.html', contenu: pageMentionsLegales(client) });

  const nomProjet = slugifier(`${client.raison_sociale}-${site.id.slice(0, 6)}`);
  const urlTest = await deployerPreview(site, nomProjet, fichiers);
  if (!urlTest) throw new Error("Le déploiement n'a renvoyé aucune URL.");

  const misAJour = (await db.update<Site>('sites', site.id, {
    statut: 'test',
    url_test: urlTest,
  }))!;

  await db.update('site_versions', version.id, { deploy_url: urlTest });

  const demande = await demanderValidation(misAJour, client, version.version, urlTest);

  await notifier({
    type: 'site_en_production',
    titre: `${misAJour.nom} déployé en test`,
    message: demande.emailEnvoye
      ? `Version ${version.version} en ligne sur ${urlTest}. Demande de validation envoyée à ${client.email}.`
      : `Version ${version.version} en ligne sur ${urlTest}. Email non parti (${demande.raisonNonEnvoye}) : transmettez vous-même le lien de validation.`,
    lien: `/clients/${client.id}`,
    clientId: client.id,
    siteId: site.id,
  });

  return {
    site: misAJour,
    urlTest,
    validation: demande.validation,
    lienValidation: demande.lien,
    emailEnvoye: demande.emailEnvoye,
    raisonNonEnvoye: demande.raisonNonEnvoye,
  };
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
  exigerCapacite('hebergement');

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

    const hebergement = await db.findOne<HostingInstance>('hosting_instances', { site_id: site.id });

    // Sans Cloudflare, le site reste en ligne sur son URL Vercel : on ne
    // prétend pas avoir configuré un domaine qui ne l'est pas.
    if (estDisponible('dns_ssl')) {
      if (hebergement?.projet_externe_id) {
        await ajouterDomaine(hebergement.projet_externe_id, domaineFinal);
      }
      await creerCname(domaineFinal, new URL(deploiement.url).hostname);
      ssl = await statutSsl();
      urlProduction = `https://${domaineFinal}`;
    } else {
      ssl = 'non_configure';
      urlProduction = deploiement.url;
    }
  }

  const hebergement = await db.findOne<HostingInstance>('hosting_instances', { site_id: site.id });
  if (hebergement) {
    await db.update('hosting_instances', hebergement.id, {
      domaine: domaineFinal,
      sous_domaine: sousDomaine,
      statut_ssl: ssl,
      dns_configure: ssl !== 'non_configure',
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
      dns_configure: ssl !== 'non_configure',
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

  await notifier({
    type: 'site_en_production',
    titre: `${client.raison_sociale} est en ligne`,
    message: `Site publié sur ${urlProduction}. Devis ${devis.numero} et facture ${facture.numero} générés automatiquement.`,
    lien: `/clients/${client.id}`,
    clientId: client.id,
    siteId: site.id,
    urgent: true,
  });

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

  const site = await db.get<Site>('sites', validation.site_id);
  const nomSite = site?.nom ?? 'Site';

  if (reponse !== 'approuve') {
    await notifier({
      type: 'modifications_demandees',
      titre: `${nomSite} : retouches demandées`,
      message: commentaire?.trim()
        ? commentaire
        : 'Le client demande des modifications, sans précision. Relancez-le pour obtenir le détail.',
      lien: site ? `/clients/${site.client_id}` : '/sites',
      clientId: site?.client_id ?? null,
      siteId: validation.site_id,
      urgent: true,
    });
    return { validation: misAJour, production: null };
  }

  await notifier({
    type: 'site_approuve',
    titre: `${nomSite} approuvé par le client`,
    message: 'Mise en production automatique lancée : déploiement, domaine, SSL, puis devis et facture.',
    lien: site ? `/clients/${site.client_id}` : '/sites',
    clientId: site?.client_id ?? null,
    siteId: validation.site_id,
  });

  return { validation: misAJour, production: await mettreEnProduction(validation.site_id) };
}

/**
 * Restaure la sauvegarde d'un site : elle redevient la production, et l'état
 * qu'elle remplace devient la nouvelle sauvegarde. Opération réversible.
 */
export async function restaurer(siteId: string): Promise<Site> {
  const { site, restauree, remplacee } = await restaurerSauvegarde(siteId);

  await notifier({
    type: 'site_en_production',
    titre: `${site.nom} : sauvegarde restaurée`,
    message: `La version ${restauree} redevient la production. La version ${remplacee} est conservée comme sauvegarde.`,
    lien: `/clients/${site.client_id}`,
    clientId: site.client_id,
    siteId: site.id,
  });

  return site;
}
