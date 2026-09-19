// ---------------------------------------------------------------------------
// Requêtes métier réutilisables. Tout ce qui est plus riche qu'un simple
// `select *` vit ici, au-dessus de l'adaptateur de données.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db';
import type {
  Abonnement,
  CampagneAds,
  Client,
  Devis,
  EmailEnvoye,
  Facture,
  HostingInstance,
  Note,
  OffrePromo,
  Parametre,
  PricingRule,
  Prospect,
  ProspectStatut,
  RecherchePerplexity,
  Site,
  SiteVersion,
  ValidationClient,
} from '@/lib/types';

// --- Tarification -----------------------------------------------------------

export async function getPricingRules(actifsSeulement = true): Promise<PricingRule[]> {
  const rules = await db.list<PricingRule>('pricing_rules', {}, { orderBy: 'ordre' });
  return actifsSeulement ? rules.filter((r) => r.actif) : rules;
}

export async function getOffresPromo(activesSeulement = false): Promise<OffrePromo[]> {
  const offres = await db.list<OffrePromo>('offres_promo', {}, { orderBy: 'code' });
  return activesSeulement ? offres.filter((o) => o.actif) : offres;
}

export async function getParametres(): Promise<Record<string, string>> {
  const rows = await db.list<Parametre>('parametres');
  return Object.fromEntries(rows.map((r) => [r.cle, r.valeur]));
}

export async function getParametreNombre(cle: string, defaut: number): Promise<number> {
  const params = await getParametres();
  const valeur = Number(params[cle]);
  return Number.isFinite(valeur) ? valeur : defaut;
}

// --- Prospection ------------------------------------------------------------

export async function getProspects(filtres: {
  statut?: ProspectStatut;
  secteur?: string;
  codePostal?: string;
  recherche?: string;
} = {}): Promise<Prospect[]> {
  const where: Record<string, unknown> = {};
  if (filtres.statut) where.statut = filtres.statut;
  if (filtres.secteur) where.secteur = filtres.secteur;
  if (filtres.codePostal) where.code_postal = filtres.codePostal;

  const list = await db.list<Prospect>('prospects', where, { orderBy: 'score', dir: 'desc' });
  if (!filtres.recherche) return list;

  const q = filtres.recherche.toLowerCase();
  return list.filter(
    (p) =>
      p.raison_sociale.toLowerCase().includes(q) ||
      (p.ville ?? '').toLowerCase().includes(q) ||
      (p.secteur ?? '').toLowerCase().includes(q),
  );
}

/** Le SIRET est la clé de déduplication multi-canal. */
export async function siretDejaDemarche(siret: string): Promise<boolean> {
  if (!siret) return false;
  const [history, prospect] = await Promise.all([
    db.findOne('prospects_history', { siret }),
    db.findOne('prospects', { siret }),
  ]);
  return Boolean(history || prospect);
}

export async function getRecherches(limit = 20): Promise<RecherchePerplexity[]> {
  return db.list<RecherchePerplexity>('recherches_perplexity', {}, {
    orderBy: 'created_at',
    dir: 'desc',
    limit,
  });
}

// --- CRM --------------------------------------------------------------------

export async function getClients(): Promise<Client[]> {
  return db.list<Client>('clients', {}, { orderBy: 'created_at', dir: 'desc' });
}

export interface FicheClient {
  client: Client;
  sites: Site[];
  devis: Devis[];
  factures: Facture[];
  abonnements: Abonnement[];
  notes: Note[];
  hebergements: HostingInstance[];
}

export async function getFicheClient(clientId: string): Promise<FicheClient | null> {
  const client = await db.get<Client>('clients', clientId);
  if (!client) return null;

  const [sites, devis, factures, abonnements, notes] = await Promise.all([
    db.list<Site>('sites', { client_id: clientId }, { orderBy: 'created_at', dir: 'desc' }),
    db.list<Devis>('devis', { client_id: clientId }, { orderBy: 'created_at', dir: 'desc' }),
    db.list<Facture>('factures', { client_id: clientId }, { orderBy: 'date', dir: 'desc' }),
    db.list<Abonnement>('abonnements', { client_id: clientId }),
    db.list<Note>('notes', { client_id: clientId }, { orderBy: 'created_at', dir: 'desc' }),
  ]);

  const hebergements = (
    await Promise.all(sites.map((s) => db.list<HostingInstance>('hosting_instances', { site_id: s.id })))
  ).flat();

  return { client, sites, devis, factures, abonnements, notes, hebergements };
}

// --- Sites ------------------------------------------------------------------

export async function getSites(): Promise<Site[]> {
  return db.list<Site>('sites', {}, { orderBy: 'updated_at', dir: 'desc' });
}

export async function getSiteVersions(siteId: string): Promise<SiteVersion[]> {
  return db.list<SiteVersion>('site_versions', { site_id: siteId }, {
    orderBy: 'version',
    dir: 'desc',
  });
}

export async function getValidations(siteId?: string): Promise<ValidationClient[]> {
  const where = siteId ? { site_id: siteId } : {};
  return db.list<ValidationClient>('validations_client', where, {
    orderBy: 'envoye_le',
    dir: 'desc',
  });
}

/** Sites dont la validation client est encore en attente de réponse. */
export async function getSitesEnAttenteValidation(): Promise<
  { site: Site; validation: ValidationClient }[]
> {
  const validations = await getValidations();
  const enAttente = validations.filter(
    (v) => v.statut === 'envoyee' || v.statut === 'modifications_demandees',
  );
  const résultats: { site: Site; validation: ValidationClient }[] = [];
  for (const validation of enAttente) {
    const site = await db.get<Site>('sites', validation.site_id);
    if (site) résultats.push({ site, validation });
  }
  return résultats;
}

// --- Hébergement ------------------------------------------------------------

export async function getHebergements(): Promise<(HostingInstance & { site?: Site })[]> {
  const instances = await db.list<HostingInstance>('hosting_instances');
  return Promise.all(
    instances.map(async (h) => ({ ...h, site: (await db.get<Site>('sites', h.site_id)) ?? undefined })),
  );
}

// --- Facturation ------------------------------------------------------------

export async function getDevis(): Promise<Devis[]> {
  return db.list<Devis>('devis', {}, { orderBy: 'created_at', dir: 'desc' });
}

export async function getFactures(): Promise<Facture[]> {
  return db.list<Facture>('factures', {}, { orderBy: 'date', dir: 'desc' });
}

export async function getAbonnements(): Promise<Abonnement[]> {
  return db.list<Abonnement>('abonnements', {}, { orderBy: 'created_at', dir: 'desc' });
}

/** Numérotation continue et sans trou, exigée pour les pièces comptables. */
export async function prochainNumero(prefixe: 'DEV' | 'FAC'): Promise<string> {
  const table = prefixe === 'DEV' ? 'devis' : 'factures';
  const rows = await db.list<{ numero: string }>(table);
  const annee = new Date().getFullYear();
  const max = rows
    .map((r) => r.numero)
    .filter((n) => n?.startsWith(`${prefixe}-${annee}-`))
    .map((n) => Number(n.split('-')[2]))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefixe}-${annee}-${String(max + 1).padStart(4, '0')}`;
}

// --- Ads & emailing ---------------------------------------------------------

export async function getCampagnes(): Promise<CampagneAds[]> {
  return db.list<CampagneAds>('campagnes_ads', {}, { orderBy: 'created_at', dir: 'desc' });
}

export async function getEmailsEnvoyes(limit = 50): Promise<EmailEnvoye[]> {
  return db.list<EmailEnvoye>('emails_envoyes', {}, { orderBy: 'envoye_le', dir: 'desc', limit });
}

/** Consultée avant TOUT envoi — obligation de l'opt-out B2B. */
export async function estDesinscrit(email: string): Promise<boolean> {
  const row = await db.get('unsubscribed_emails', email.toLowerCase());
  return Boolean(row);
}
