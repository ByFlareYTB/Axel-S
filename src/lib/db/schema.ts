// ---------------------------------------------------------------------------
// Métadonnées de schéma partagées par les deux adaptateurs (démo et Postgres).
// ---------------------------------------------------------------------------

export const TABLES = [
  'prospects',
  'prospects_history',
  'clients',
  'notes',
  'sites',
  'site_versions',
  'validations_client',
  'hosting_instances',
  'pricing_rules',
  'offres_promo',
  'devis',
  'factures',
  'abonnements',
  'campagnes_ads',
  'emails_envoyes',
  'unsubscribed_emails',
  'recherches_perplexity',
  'historique_prix',
  'parametres',
  'notifications',
] as const;

export type TableName = (typeof TABLES)[number];

/** Clé primaire de chaque table (toutes en `id` sauf deux). */
export const PRIMARY_KEYS: Record<TableName, string> = {
  prospects: 'id',
  prospects_history: 'id',
  clients: 'id',
  notes: 'id',
  sites: 'id',
  site_versions: 'id',
  validations_client: 'id',
  hosting_instances: 'id',
  pricing_rules: 'id',
  offres_promo: 'id',
  devis: 'id',
  factures: 'id',
  abonnements: 'id',
  campagnes_ads: 'id',
  emails_envoyes: 'id',
  unsubscribed_emails: 'email',
  recherches_perplexity: 'id',
  historique_prix: 'id',
  parametres: 'cle',
  notifications: 'id',
};

/**
 * Colonnes `numeric` : postgres.js les renvoie en chaîne pour préserver la
 * précision. On les reconvertit en nombre à la lecture pour que l'UI et le
 * moteur de marge manipulent partout le même type.
 */
export const NUMERIC_COLUMNS: Partial<Record<TableName, string[]>> = {
  prospects: ['score', 'prix_concurrence_min', 'prix_concurrence_max'],
  prospects_history: ['nb_contacts'],
  sites: ['version_actuelle', 'version_sauvegarde', 'nb_pages', 'cout_generation_ia'],
  site_versions: ['version', 'cout_ia'],
  validations_client: ['version'],
  hosting_instances: ['cout_mensuel_reel', 'prix_facture_mensuel'],
  pricing_rules: ['prix', 'cout_ia_estime', 'cout_hebergement_mensuel', 'ordre'],
  offres_promo: ['valeur', 'duree_mois'],
  devis: [
    'total_oneshot',
    'total_mensuel',
    'remise',
    'total',
    'cout_ia_estime',
    'cout_hebergement_estime',
    'cout_acquisition_ads',
    'marge_oneshot',
    'marge_oneshot_pct',
    'marge_mensuelle',
  ],
  factures: ['total_ht', 'tva', 'total_ttc'],
  abonnements: ['prix_mensuel', 'echecs_paiement'],
  campagnes_ads: ['budget', 'depense', 'leads', 'conversions', 'revenus_attribues'],
  recherches_perplexity: ['nb_resultats', 'cout_estime'],
  historique_prix: ['prix_applique', 'prix_grille', 'quantite'],
};

export interface QueryOptions<T> {
  orderBy?: keyof T & string;
  dir?: 'asc' | 'desc';
  limit?: number;
}

/** Contrat minimal commun aux deux adaptateurs. */
export interface DataSource {
  readonly kind: 'fichier' | 'postgres' | 'demo';
  list<T>(table: TableName, where?: Record<string, unknown>, opts?: QueryOptions<T>): Promise<T[]>;
  get<T>(table: TableName, id: string): Promise<T | null>;
  findOne<T>(table: TableName, where: Record<string, unknown>): Promise<T | null>;
  insert<T>(table: TableName, row: Record<string, unknown>): Promise<T>;
  update<T>(table: TableName, id: string, patch: Record<string, unknown>): Promise<T | null>;
  remove(table: TableName, id: string): Promise<boolean>;
  count(table: TableName, where?: Record<string, unknown>): Promise<number>;
}

export function coerceRow<T>(table: TableName, row: Record<string, unknown>): T {
  const numeric = NUMERIC_COLUMNS[table];
  if (numeric) {
    for (const col of numeric) {
      const value = row[col];
      if (typeof value === 'string' && value !== '') row[col] = Number(value);
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) row[key] = value.toISOString();
  }
  return row as T;
}
