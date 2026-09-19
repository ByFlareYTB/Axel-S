// ---------------------------------------------------------------------------
// Pipeline de prospection : SIRENE donne l'identité légale et le SIRET,
// Perplexity l'empreinte web. Le croisement des deux produit les prospects,
// dédupliqués par SIRET via prospects_history.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { enrichirProspects, veilleTarifaire } from '@/lib/integrations/perplexity';
import { rechercherEntreprises } from '@/lib/integrations/sirene';
import { notifier } from '@/lib/notifications';
import { estDisponible } from '@/lib/integrations/prerequis';
import { siretDejaDemarche } from '@/lib/repositories';
import type { Prospect } from '@/lib/types';

export interface CriteresRecherche {
  secteur: string;
  codePostal?: string;
  departement?: string;
  limite?: number;
}

export interface ResultatRecherche {
  prospects: Prospect[];
  ignoresDoublons: number;
  coutRecherche: number;
  source: 'perplexity+sirene' | 'demo';
}

/** Score simple : plus un prospect est mal équipé, plus il est prioritaire. */
function scorer(sansSite: boolean, obsolete: boolean, aEmail: boolean): number {
  let score = 40;
  if (sansSite) score += 35;
  else if (obsolete) score += 25;
  if (aEmail) score += 15;
  return Math.min(100, score);
}

export async function rechercherProspects(criteres: CriteresRecherche): Promise<ResultatRecherche> {
  if (config.demo) return rechercheDemo(criteres);

  const entreprises = await rechercherEntreprises({
    secteur: criteres.secteur,
    codePostal: criteres.codePostal,
    departement: criteres.departement,
    limite: criteres.limite ?? 20,
  });

  // Déduplication avant enrichissement : on ne paie pas Perplexity pour des
  // entreprises déjà démarchées.
  const nouvelles: typeof entreprises = [];
  let ignoresDoublons = 0;
  for (const entreprise of entreprises) {
    if (entreprise.siret && (await siretDejaDemarche(entreprise.siret))) {
      ignoresDoublons++;
      continue;
    }
    nouvelles.push(entreprise);
  }

  if (nouvelles.length === 0) {
    return { prospects: [], ignoresDoublons, coutRecherche: 0, source: 'perplexity+sirene' };
  }

  const zone = criteres.codePostal ?? criteres.departement ?? 'Indre-et-Loire';

  // Perplexity enrichit les résultats SIRENE, il ne les conditionne pas :
  // sans clé, on livre quand même les entreprises trouvées, sans l'empreinte
  // web ni la veille tarifaire.
  const avecPerplexity = estDisponible('recherche_web');

  let enrichissement: Awaited<ReturnType<typeof enrichirProspects>> | null = null;
  let concurrence: Awaited<ReturnType<typeof veilleTarifaire>> | null = null;

  if (avecPerplexity) {
    try {
      enrichissement = await enrichirProspects(
        nouvelles.map((e) => ({ raison_sociale: e.raison_sociale, ville: e.ville })),
        criteres.secteur,
      );
    } catch (err) {
      console.warn('[prospection] enrichissement web indisponible :', err);
    }
    try {
      concurrence = await veilleTarifaire(zone);
    } catch (err) {
      // La veille tarifaire est un bonus commercial : son échec ne doit pas
      // faire perdre les prospects déjà trouvés.
      console.warn('[prospection] veille tarifaire indisponible :', err);
    }
  }

  const coutRecherche = (enrichissement?.coutEstime ?? 0) + (concurrence?.coutEstime ?? 0);

  await db.insert('recherches_perplexity', {
    requete: `${criteres.secteur} — ${zone}`,
    secteur: criteres.secteur,
    zone,
    modele: enrichissement?.modele ?? 'sirene_seul',
    nb_resultats: nouvelles.length,
    cout_estime: coutRecherche,
    reponse_brute: null,
    created_at: new Date().toISOString(),
  });

  const prospects: Prospect[] = [];
  for (const [index, entreprise] of nouvelles.entries()) {
    const infos = enrichissement?.donnees[index] ?? null;
    const sansSite = !infos?.site_web;
    const obsolete = Boolean(infos?.site_obsolete);

    const prospect = await db.insert<Prospect>('prospects', {
      raison_sociale: entreprise.raison_sociale,
      siret: entreprise.siret,
      siren: entreprise.siren,
      secteur: criteres.secteur,
      code_naf: entreprise.code_naf,
      adresse: entreprise.adresse,
      code_postal: entreprise.code_postal,
      ville: entreprise.ville,
      departement: entreprise.departement,
      email: infos?.email ?? null,
      telephone: infos?.telephone ?? null,
      site_web_existant: infos?.site_web ?? null,
      site_obsolete: obsolete,
      score: scorer(sansSite, obsolete, Boolean(infos?.email)),
      statut: 'non_vu',
      prix_concurrence_min: concurrence?.donnees.prix_min ?? null,
      prix_concurrence_max: concurrence?.donnees.prix_max ?? null,
      source_concurrence: concurrence?.donnees.source ?? null,
      source: 'perplexity+sirene',
      notes_ia: infos?.commentaire ?? null,
    });

    if (entreprise.siret) {
      await db.insert('prospects_history', {
        siret: entreprise.siret,
        raison_sociale: entreprise.raison_sociale,
        canal: 'recherche',
        dernier_statut: 'non_vu',
        premier_contact: new Date().toISOString(),
        dernier_contact: new Date().toISOString(),
        nb_contacts: 1,
      });
    }

    prospects.push(prospect);
  }

  if (prospects.length > 0) {
    await notifier({
      type: 'prospects_trouves',
      titre: `${prospects.length} prospect(s) ajouté(s)`,
      message:
        `${criteres.secteur} — ${zone}` +
        (ignoresDoublons ? ` · ${ignoresDoublons} doublon(s) SIRET ignoré(s)` : '') +
        (avecPerplexity ? '' : ' · enrichissement web désactivé (clé Perplexity absente)'),
      lien: '/prospection',
    });
  }

  return { prospects, ignoresDoublons, coutRecherche, source: 'perplexity+sirene' };
}

/** Recherche simulée : produit des prospects plausibles, sans appel réseau. */
async function rechercheDemo(criteres: CriteresRecherche): Promise<ResultatRecherche> {
  const villes: [string, string][] = [
    ['Monts', '37260'],
    ['Montbazon', '37250'],
    ['Veigné', '37250'],
    ['Esvres', '37320'],
    ['Saint-Branchs', '37320'],
    ['Artannes-sur-Indre', '37260'],
  ];
  const noms = ['Dubreuil', 'Fontaine', 'Marchand', 'Leclercq', 'Vasseur', 'Aubert', 'Perrot', 'Nicolas'];
  const limite = Math.min(criteres.limite ?? 8, 12);

  const prospects: Prospect[] = [];
  let ignoresDoublons = 0;

  for (let i = 0; i < limite; i++) {
    const [ville, cp] = villes[i % villes.length];
    const siret = `${Date.now()}${i}`.slice(0, 14);
    if (await siretDejaDemarche(siret)) {
      ignoresDoublons++;
      continue;
    }
    const sansSite = i % 3 === 0;
    const obsolete = !sansSite && i % 2 === 0;

    const prospect = await db.insert<Prospect>('prospects', {
      raison_sociale: `${criteres.secteur} ${noms[i % noms.length]}`,
      siret,
      siren: siret.slice(0, 9),
      secteur: criteres.secteur,
      code_naf: '4321A',
      adresse: `${3 + i} rue des Artisans`,
      code_postal: criteres.codePostal ?? cp,
      ville,
      departement: '37',
      email: `contact@${noms[i % noms.length].toLowerCase()}-${cp}.fr`,
      telephone: `02 47 ${20 + i} ${30 + i} ${40 + i}`,
      site_web_existant: sansSite ? null : `http://www.${noms[i % noms.length].toLowerCase()}.fr`,
      site_obsolete: obsolete,
      score: scorer(sansSite, obsolete, true),
      statut: 'non_vu',
      prix_concurrence_min: 1200,
      prix_concurrence_max: 3500,
      source_concurrence: 'Veille simulée (mode démo)',
      source: 'perplexity+sirene',
      notes_ia: sansSite
        ? 'Aucune présence web hors fiche Google Business.'
        : 'Site existant non responsive, argument de refonte fort.',
    });

    await db.insert('prospects_history', {
      siret,
      raison_sociale: prospect.raison_sociale,
      canal: 'recherche',
      dernier_statut: 'non_vu',
      premier_contact: new Date().toISOString(),
      dernier_contact: new Date().toISOString(),
      nb_contacts: 1,
    });

    prospects.push(prospect);
  }

  await db.insert('recherches_perplexity', {
    requete: `${criteres.secteur} — ${criteres.codePostal ?? criteres.departement ?? '37'}`,
    secteur: criteres.secteur,
    zone: criteres.codePostal ?? criteres.departement ?? '37',
    modele: 'demo',
    nb_resultats: prospects.length,
    cout_estime: 0,
    reponse_brute: null,
    created_at: new Date().toISOString(),
  });

  return { prospects, ignoresDoublons, coutRecherche: 0, source: 'demo' };
}

/** Conversion d'un prospect en client : statut ✅ + création de la fiche CRM. */
export async function convertirEnClient(prospectId: string): Promise<{ clientId: string }> {
  const prospect = await db.get<Prospect>('prospects', prospectId);
  if (!prospect) throw new Error('Prospect introuvable.');

  const existant = prospect.siret
    ? await db.findOne<{ id: string }>('clients', { siret: prospect.siret })
    : null;
  if (existant) {
    await db.update('prospects', prospectId, { statut: 'client' });
    return { clientId: existant.id };
  }

  const client = await db.insert<{ id: string }>('clients', {
    prospect_id: prospect.id,
    raison_sociale: prospect.raison_sociale,
    contact_nom: null,
    email: prospect.email ?? `contact+${prospect.id.slice(0, 8)}@exemple.fr`,
    telephone: prospect.telephone,
    siret: prospect.siret,
    secteur: prospect.secteur,
    adresse: prospect.adresse,
    code_postal: prospect.code_postal,
    ville: prospect.ville,
    stripe_customer_id: null,
  });

  await db.update('prospects', prospectId, { statut: 'client' });

  await notifier({
    type: 'client_confirme',
    titre: `Nouveau client : ${prospect.raison_sociale}`,
    message: `Fiche CRM créée${prospect.ville ? ` (${prospect.ville})` : ''}. Vous pouvez lancer la génération du site.`,
    lien: `/clients/${client.id}`,
    clientId: client.id,
    urgent: true,
  });

  return { clientId: client.id };
}
