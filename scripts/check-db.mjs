#!/usr/bin/env node
/**
 * Diagnostic de la connexion à la base.
 *
 * Usage : npm run db:check
 *
 * Affiche comment la chaîne de connexion est réellement interprétée, mot de
 * passe masqué, puis tente une connexion. Une URL mal formée produit sinon une
 * erreur DNS (« ENOTFOUND postgres ») qui ne dit rien de ce qu'il faut corriger.
 */
import postgres from 'postgres';
import { chargerEnvironnement, verifierUrlBase } from './env.mjs';

chargerEnvironnement();

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL est absent de .env.local et de votre environnement.');
  process.exit(1);
}

/** Masque le mot de passe pour que la sortie soit collable sans risque. */
function masquer(chaine) {
  return chaine.replace(/(:\/\/[^:@/]*:)[^@]*(@)/, '$1••••••$2');
}

console.log(`\nChaîne lue : ${masquer(url)}\n`);

let analysee = null;
try {
  analysee = new URL(url);
} catch (err) {
  console.error(`Cette chaîne n'est pas une URL analysable : ${err.message}\n`);
  // Vérifié : un « / », « # » ou « ? » dans le mot de passe rend l'URL
  // entièrement inanalysable, alors qu'une chaîne tronquée reste analysable.
  console.error(
    'Cause la plus fréquente : un caractère spécial dans le mot de passe\n' +
      "(/ # ? @ %) interrompt l'analyse de l'URL.\n\n" +
      'Deux solutions :\n' +
      '  1. Réinitialisez le mot de passe dans Supabase avec des lettres et des\n' +
      '     chiffres uniquement — Project Settings → Database → Reset database password.\n' +
      '  2. Ou encodez-le :\n' +
      '     node -e "console.log(encodeURIComponent(\'VotreMotDePasse\'))"\n' +
      '     puis collez le résultat à la place du mot de passe.\n',
  );
}

if (analysee) {
  console.log('Interprétation :');
  console.log(`  protocole    ${analysee.protocol}//`);
  console.log(`  utilisateur  ${analysee.username || '(aucun)'}`);
  console.log(`  mot de passe ${analysee.password ? `${analysee.password.length} caractères` : '(aucun)'}`);
  console.log(`  serveur      ${analysee.hostname || '(aucun)'}`);
  console.log(`  port         ${analysee.port || '(par défaut)'}`);
  console.log(`  base         ${analysee.pathname.replace(/^\//, '') || '(aucune)'}\n`);
}

const probleme = verifierUrlBase(url);
if (probleme) {
  console.error(`${probleme}\n`);

  // Vérifié : « postgres » comme serveur signifie que la chaîne s'arrête avant
  // l'adresse réelle — le nom d'utilisateur est alors pris pour le serveur.
  if (analysee?.hostname === 'postgres') {
    console.error(
      'La chaîne est incomplète : elle s’arrête avant l’adresse du serveur,\n' +
        'si bien que le nom d’utilisateur « postgres » est pris pour le serveur.\n\n' +
        'Elle doit ressembler à ceci, sur UNE SEULE ligne :\n' +
        '  DATABASE_URL=postgresql://postgres:MotDePasse@db.xxxx.supabase.co:5432/postgres\n\n' +
        'Vérifiez dans .env.local qu’aucun retour à la ligne ne coupe la valeur,\n' +
        'puis recopiez-la entièrement depuis Supabase :\n' +
        'Project Settings → Database → Connection string → URI.\n',
    );
  }
  process.exit(1);
}

console.log('Format valide. Tentative de connexion…\n');

const sql = postgres(url, { connect_timeout: 10, onnotice: () => {} });
try {
  const [{ version }] = await sql`select version()`;
  const [{ tables }] = await sql`
    select count(*)::int as tables from information_schema.tables where table_schema = 'public'
  `;
  console.log(`Connexion réussie.\n  ${version.split(',')[0]}`);
  console.log(`  ${tables} table(s) dans le schéma public.`);
  console.log(
    tables === 0
      ? "\nLa base est vide : lancez `npm run db:migrate` pour créer le schéma.\n"
      : '\nLe schéma est en place.\n',
  );
} catch (err) {
  console.error(`Connexion refusée : ${err.message}\n`);
  if (/ENOTFOUND|EAI_AGAIN/.test(err.message)) {
    console.error('Le serveur nommé dans la chaîne est introuvable. Vérifiez son adresse.\n');
  } else if (/password|authentication/i.test(err.message)) {
    console.error('Le serveur répond mais refuse le mot de passe. Vérifiez-le dans Supabase.\n');
  }
  process.exitCode = 1;
} finally {
  await sql.end();
}
