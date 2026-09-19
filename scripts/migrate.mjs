#!/usr/bin/env node
/**
 * Applique les migrations SQL de supabase/migrations dans l'ordre alphabétique.
 *
 * Usage : npm run db:migrate
 * DATABASE_URL est lu depuis .env.local, ou depuis l'environnement du shell.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { chargerEnvironnement, verifierUrlBase } from './env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');

// Node ne lit aucun fichier .env de lui-même : sans cela, le script ne verrait
// pas la configuration que l'application utilise pourtant déjà.
chargerEnvironnement();

const url = process.env.DATABASE_URL;
const probleme = verifierUrlBase(url);
if (probleme) {
  console.error(probleme);
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {} });

try {
  await sql`create table if not exists _migrations (
    nom text primary key,
    applique_le timestamptz not null default now()
  )`;

  const applied = new Set((await sql`select nom from _migrations`).map((r) => r.nom));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} (déjà appliquée)`);
      continue;
    }
    const content = await readFile(join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into _migrations (nom) values (${file})`;
    });
    console.log(`✓ ${file}`);
  }
  console.log(`Migrations terminées sur ${new URL(url).hostname}.`);
} catch (err) {
  console.error('Échec des migrations :', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
