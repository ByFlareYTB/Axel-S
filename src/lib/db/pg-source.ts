// ---------------------------------------------------------------------------
// Adaptateur PostgreSQL (Supabase), utilisé dès que DEMO_MODE=false.
// ---------------------------------------------------------------------------

import postgres from 'postgres';
import { config } from '@/lib/config';
import type { DataSource, QueryOptions, TableName } from './schema';
import { PRIMARY_KEYS, coerceRow } from './schema';

const globalPg = globalThis as unknown as { __siteforgeSql?: postgres.Sql };

/**
 * Vérifie la chaîne de connexion avant de s'en servir.
 *
 * Une URL mal formée ne produit pas d'erreur claire : postgres.js prend le nom
 * d'utilisateur pour un nom de serveur et l'on obtient « ENOTFOUND postgres »,
 * qui ne dit rien de ce qu'il faut corriger.
 */
function verifierUrl(url: string): void {
  if (/\[.*\]/.test(url)) {
    throw new Error(
      'DATABASE_URL contient encore un espace réservé entre crochets. Remplacez ' +
        '[YOUR-PASSWORD] par votre mot de passe, crochets compris, puis redémarrez.',
    );
  }

  let analysee: URL;
  try {
    analysee = new URL(url);
  } catch {
    throw new Error("DATABASE_URL n'est pas une URL valide. Recopiez la chaîne complète depuis Supabase.");
  }

  if (!analysee.hostname || analysee.hostname === 'postgres') {
    throw new Error(
      `DATABASE_URL ne désigne aucun serveur valide (hôte lu : « ${analysee.hostname} »). ` +
        'Recopiez la chaîne depuis Supabase : Project Settings → Database → Connection string → URI.',
    );
  }
}

/**
 * Options de connexion adaptées à l'endroit où le code tourne.
 *
 * Deux réglages décident du succès sur un hébergement sans serveur, et aucun
 * n'est celui par défaut.
 *
 * Le premier : un connecteur en mode transaction ne garde pas de session entre
 * deux requêtes, si bien que les requêtes préparées — que postgres.js utilise
 * d'office — échouent dès la seconde exécution.
 *
 * Le second : chaque instance sans serveur ouvre son propre lot de connexions.
 * Cinq par instance épuisent le quota d'une base modeste dès que le trafic
 * monte, alors qu'une seule suffit puisqu'une instance ne traite qu'une requête
 * à la fois.
 */
export function optionsConnexion(
  url: string,
  environnement: Record<string, string | undefined> = process.env,
): postgres.Options<{}> {
  const sansServeur = Boolean(environnement.VERCEL || environnement.AWS_LAMBDA_FUNCTION_NAME);

  let hote = '';
  let port = '';
  try {
    const analysee = new URL(url);
    hote = analysee.hostname.toLowerCase();
    port = analysee.port;
  } catch {
    /* déjà signalé par verifierUrl */
  }

  const parConnecteur = hote.includes('pooler.') || port === '6543';

  return {
    max: sansServeur ? 1 : 5,
    idle_timeout: 20,
    // Sans délai explicite, une base injoignable fait attendre la requête
    // jusqu'au bout du temps alloué à la fonction, sans jamais rien expliquer.
    connect_timeout: 10,
    prepare: !parConnecteur,
    onnotice: () => {},
  };
}

/**
 * Traduit les échecs de connexion en consignes.
 *
 * Le cas fréquent sur un hébergement sans serveur : la connexion directe d'une
 * base hébergée n'est joignable qu'en IPv6, que la plateforme ne sait pas
 * router. L'erreur système ne le dit pas, et l'on cherche du côté du mot de
 * passe pendant des heures.
 */
export function traduireErreurConnexion(err: unknown): Error {
  const brut = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code ?? '';

  if (/ENETUNREACH|EHOSTUNREACH/.test(code + brut)) {
    return new Error(
      'La base est injoignable depuis cet hébergement : sa connexion directe ne répond ' +
        "qu'en IPv6, que les plateformes sans serveur ne routent pas. Utilisez la chaîne " +
        'du connecteur (« pooler ») plutôt que la connexion directe : dans Supabase, ' +
        'Project Settings → Database → Connection string → onglet « Session pooler ». ' +
        `(${brut})`,
    );
  }

  if (/ETIMEDOUT|CONNECT_TIMEOUT/i.test(code + brut)) {
    return new Error(
      'Délai dépassé en tentant de joindre la base. Vérifiez que la chaîne pointe vers le ' +
        'connecteur de votre hébergeur de base, et que le projet n’est pas en pause. ' +
        `(${brut})`,
    );
  }

  if (/password|authentication|SASL/i.test(brut)) {
    return new Error(
      'La base répond mais refuse les identifiants. Attention : la chaîne du connecteur ' +
        'utilise un nom d’utilisateur différent de la connexion directe — recopiez-la ' +
        `entièrement plutôt que d’en modifier une partie. (${brut})`,
    );
  }

  return err instanceof Error ? err : new Error(brut);
}

function client(): postgres.Sql {
  if (!config.database.url) {
    throw new Error(
      'DATABASE_URL est requis quand DEMO_MODE=false. Renseignez-le ou repassez en mode démo.',
    );
  }
  verifierUrl(config.database.url);
  if (!globalPg.__siteforgeSql) {
    globalPg.__siteforgeSql = postgres(config.database.url, optionsConnexion(config.database.url));
  }
  return globalPg.__siteforgeSql;
}

/** Construit un fragment WHERE typé (les valeurs restent paramétrées). */
function whereFragment(sql: postgres.Sql, where: Record<string, unknown>) {
  const entries = Object.entries(where).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return sql``;
  return entries.reduce(
    (acc, [key, value], index) => {
      const clause = Array.isArray(value)
        ? sql`${sql(key)} = any(${value as string[]})`
        : sql`${sql(key)} = ${value as never}`;
      return index === 0 ? sql`where ${clause}` : sql`${acc} and ${clause}`;
    },
    sql``,
  );
}

const adaptateur: DataSource = {
  kind: 'postgres',

  async list<T>(table: TableName, where: Record<string, unknown> = {}, opts?: QueryOptions<T>) {
    const sql = client();
    const order = opts?.orderBy
      ? sql`order by ${sql(opts.orderBy as string)} ${opts.dir === 'desc' ? sql`desc` : sql`asc`}`
      : sql``;
    const limit = opts?.limit ? sql`limit ${opts.limit}` : sql``;
    const result = await sql`
      select * from ${sql(table)} ${whereFragment(sql, where)} ${order} ${limit}
    `;
    return result.map((row) => coerceRow<T>(table, row as Record<string, unknown>));
  },

  async get<T>(table: TableName, id: string) {
    const sql = client();
    const pk = PRIMARY_KEYS[table];
    const [row] = await sql`select * from ${sql(table)} where ${sql(pk)} = ${id} limit 1`;
    return row ? coerceRow<T>(table, row as Record<string, unknown>) : null;
  },

  async findOne<T>(table: TableName, where: Record<string, unknown>) {
    const sql = client();
    const [row] = await sql`select * from ${sql(table)} ${whereFragment(sql, where)} limit 1`;
    return row ? coerceRow<T>(table, row as Record<string, unknown>) : null;
  },

  async insert<T>(table: TableName, row: Record<string, unknown>) {
    const sql = client();
    const [created] = await sql`insert into ${sql(table)} ${sql(row)} returning *`;
    return coerceRow<T>(table, created as Record<string, unknown>);
  },

  async update<T>(table: TableName, id: string, patch: Record<string, unknown>) {
    const sql = client();
    const pk = PRIMARY_KEYS[table];
    const [updated] = await sql`
      update ${sql(table)} set ${sql(patch)} where ${sql(pk)} = ${id} returning *
    `;
    return updated ? coerceRow<T>(table, updated as Record<string, unknown>) : null;
  },

  async remove(table: TableName, id: string) {
    const sql = client();
    const pk = PRIMARY_KEYS[table];
    const result = await sql`delete from ${sql(table)} where ${sql(pk)} = ${id}`;
    return result.count > 0;
  },

  async count(table: TableName, where: Record<string, unknown> = {}) {
    const sql = client();
    const [row] = await sql`select count(*)::int as n from ${sql(table)} ${whereFragment(sql, where)}`;
    return Number((row as { n: number }).n);
  },
};

/**
 * Traduit les erreurs de toutes les opérations, sans les répéter une à une.
 *
 * Un échec de connexion se produit à la première requête venue, quelle qu'elle
 * soit : n'habiller qu'une méthode laisserait les autres remonter le message
 * système brut.
 */
export const pgSource: DataSource = new Proxy(adaptateur, {
  get(cible, propriete, recepteur) {
    const valeur = Reflect.get(cible, propriete, recepteur);
    if (typeof valeur !== 'function') return valeur;

    return async (...args: unknown[]) => {
      try {
        return await (valeur as (...a: unknown[]) => Promise<unknown>).apply(cible, args);
      } catch (err) {
        throw traduireErreurConnexion(err);
      }
    };
  },
});
