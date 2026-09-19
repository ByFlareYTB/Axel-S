// ---------------------------------------------------------------------------
// Adaptateur « mode démo » : toutes les tables vivent en mémoire et sont
// initialisées avec un jeu de données fictives. Les écritures fonctionnent
// normalement, elles sont simplement perdues au redémarrage du serveur.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { DataSource, QueryOptions, TableName } from './schema';
import { PRIMARY_KEYS, TABLES } from './schema';
import { buildDemoData } from '@/lib/demo/seed';

type Row = Record<string, unknown>;

/**
 * Le store est mémorisé sur `globalThis` : en développement, Next recharge les
 * modules à chaque modification et on perdrait sinon les écritures en cours.
 */
const globalStore = globalThis as unknown as { __siteforgeDemo?: Map<TableName, Row[]> };

function store(): Map<TableName, Row[]> {
  if (!globalStore.__siteforgeDemo) {
    const data = buildDemoData();
    const map = new Map<TableName, Row[]>();
    for (const table of TABLES) map.set(table, (data[table] ?? []) as Row[]);
    globalStore.__siteforgeDemo = map;
  }
  return globalStore.__siteforgeDemo;
}

function rows(table: TableName): Row[] {
  const existing = store().get(table);
  if (existing) return existing;
  const created: Row[] = [];
  store().set(table, created);
  return created;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (Array.isArray(value)) return value.includes(row[key] as never);
    return row[key] === value;
  });
}

function sortRows<T>(list: Row[], opts?: QueryOptions<T>): Row[] {
  if (!opts?.orderBy) return list;
  const key = opts.orderBy as string;
  const sign = opts.dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return (av < bv ? -1 : 1) * sign;
  });
}

export const demoSource: DataSource = {
  kind: 'demo',

  async list<T>(table: TableName, where: Record<string, unknown> = {}, opts?: QueryOptions<T>) {
    let result = rows(table).filter((row) => matches(row, where));
    result = sortRows(result, opts);
    if (opts?.limit) result = result.slice(0, opts.limit);
    return result.map((row) => ({ ...row })) as T[];
  },

  async get<T>(table: TableName, id: string) {
    const pk = PRIMARY_KEYS[table];
    const found = rows(table).find((row) => row[pk] === id);
    return found ? ({ ...found } as T) : null;
  },

  async findOne<T>(table: TableName, where: Record<string, unknown>) {
    const found = rows(table).find((row) => matches(row, where));
    return found ? ({ ...found } as T) : null;
  },

  async insert<T>(table: TableName, row: Record<string, unknown>) {
    const pk = PRIMARY_KEYS[table];
    const now = new Date().toISOString();
    const record: Row = {
      ...(pk === 'id' ? { id: randomUUID() } : {}),
      created_at: now,
      updated_at: now,
      ...row,
    };
    rows(table).push(record);
    return { ...record } as T;
  },

  async update<T>(table: TableName, id: string, patch: Record<string, unknown>) {
    const pk = PRIMARY_KEYS[table];
    const target = rows(table).find((row) => row[pk] === id);
    if (!target) return null;
    Object.assign(target, patch, { updated_at: new Date().toISOString() });
    return { ...target } as T;
  },

  async remove(table: TableName, id: string) {
    const pk = PRIMARY_KEYS[table];
    const list = rows(table);
    const index = list.findIndex((row) => row[pk] === id);
    if (index === -1) return false;
    list.splice(index, 1);
    return true;
  },

  async count(table: TableName, where: Record<string, unknown> = {}) {
    return rows(table).filter((row) => matches(row, where)).length;
  },
};
