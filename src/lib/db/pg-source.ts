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

function client(): postgres.Sql {
  if (!config.database.url) {
    throw new Error(
      'DATABASE_URL est requis quand DEMO_MODE=false. Renseignez-le ou repassez en mode démo.',
    );
  }
  verifierUrl(config.database.url);
  if (!globalPg.__siteforgeSql) {
    globalPg.__siteforgeSql = postgres(config.database.url, {
      max: 5,
      idle_timeout: 20,
      onnotice: () => {},
    });
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

export const pgSource: DataSource = {
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
