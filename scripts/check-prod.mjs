#!/usr/bin/env node
/**
 * Contrôle de la configuration de production.
 *
 * Usage : npm run deploy:check
 *
 * À lancer avant de déployer, avec le .env.local que vous comptez recopier sur
 * l'hébergeur, puis après le déploiement en pointant sur l'environnement réel.
 */
import { chargerEnvironnement, verifierUrlBase } from './env.mjs';
import { BLOQUANT, verifierProduction } from './prod.mjs';

chargerEnvironnement();

const problemes = verifierProduction(process.env);

// La chaîne de connexion mérite son propre contrôle : présente mais mal formée,
// elle échoue à l'exécution avec une erreur DNS incompréhensible.
if (process.env.DATABASE_URL) {
  const probleme = verifierUrlBase(process.env.DATABASE_URL);
  if (probleme) {
    problemes.unshift({
      niveau: BLOQUANT,
      variable: 'DATABASE_URL',
      constat: probleme.split('\n')[0],
      correction: 'Lancez `npm run db:check` pour le détail.',
    });
  }
}

const bloquants = problemes.filter((p) => p.niveau === BLOQUANT);
const avertissements = problemes.filter((p) => p.niveau !== BLOQUANT);

function afficher(titre, liste, marque) {
  if (liste.length === 0) return;
  console.log(`\n${titre}\n`);
  for (const p of liste) {
    console.log(`  ${marque} ${p.variable}`);
    console.log(`     ${p.constat}`);
    console.log(`     → ${p.correction}\n`);
  }
}

console.log(`\nConfiguration de production — ${process.env.APP_BASE_URL || 'adresse non renseignée'}`);

afficher('À corriger avant de déployer', bloquants, '✗');
afficher('Fonctionnera, mais mal', avertissements, '!');

if (problemes.length === 0) {
  console.log('\nTout est en place.\n');
} else {
  console.log(
    `${bloquants.length} problème(s) bloquant(s), ${avertissements.length} avertissement(s).\n`,
  );
}

process.exitCode = bloquants.length > 0 ? 1 : 0;
