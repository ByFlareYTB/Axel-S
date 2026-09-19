#!/usr/bin/env node
/**
 * Prépare le bloc de variables à coller chez l'hébergeur.
 *
 * Usage : npm run deploy:env
 *
 * La saisie manuelle d'une quinzaine de variables est l'étape où se glissent
 * les fautes les plus coûteuses : une valeur d'exemple oubliée, un caractère
 * perdu dans une chaîne de connexion, une variable absente qu'on croit avoir
 * saisie. Ce script part du .env.local qui fonctionne déjà en local, écarte ce
 * qui n'a pas de sens en ligne, et signale ce qui reste à décider.
 */
import { chargerEnvironnement } from './env.mjs';
import { BLOQUANT, DOMAINE_EXEMPLE, SECRET_EXEMPLE, verifierProduction } from './prod.mjs';

chargerEnvironnement();

/**
 * Variables qui ne concernent que la machine de développement.
 *
 * DATA_FILE désigne un stockage fichier, impossible sur un hébergement dont le
 * disque est éphémère — la reporter reviendrait à demander à l'application de
 * refuser de démarrer.
 */
const LOCALES = ['DATA_FILE'];

/** Valeurs que le fichier d'exemple propose et qu'il ne faut pas reporter. */
const EXEMPLES = new Set([SECRET_EXEMPLE, DOMAINE_EXEMPLE, 'http://localhost:3000', 'mondomaine.fr']);

const ORDRE = [
  'DEMO_MODE',
  'DATABASE_URL',
  'SESSION_SECRET',
  'APP_BASE_URL',
  'ROOT_DOMAIN',
  'DNS_WILDCARD',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_WORKSPACE_ID',
  'RESEND_API_KEY',
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'AUTH_EMAIL',
  'SIREN',
  'ENTREPRISE_NOM',
  'ENTREPRISE_EXPLOITANT',
  'ENTREPRISE_ADRESSE',
  'ENTREPRISE_EMAIL',
  'ENTREPRISE_TELEPHONE',
  'VERCEL_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PERPLEXITY_API_KEY',
  'NOTIFICATIONS_RETENTION_JOURS',
];

const lignes = [];
const aDecider = [];

for (const cle of ORDRE) {
  if (LOCALES.includes(cle)) continue;

  const valeur = (process.env[cle] ?? '').trim();

  // Une variable vide n'est pas une erreur : chaque intégration est
  // facultative, et l'application dit clairement ce qui lui manque.
  if (!valeur) continue;

  if (EXEMPLES.has(valeur)) {
    aDecider.push(`${cle} vaut « ${valeur} », la valeur d'exemple — à remplacer avant de coller.`);
    continue;
  }

  lignes.push(`${cle}=${valeur}`);
}

// Ce bloc contient des secrets en clair : c'est nécessaire pour les coller,
// mais il n'a rien à faire ailleurs que dans le formulaire de l'hébergeur.
console.log('\nCe bloc contient vos clés en clair : ne le collez que dans votre hébergeur,');
console.log('jamais dans un message, un ticket ou un dépôt.\n');
console.log('Collez-le dans le champ « Key » : votre hébergeur reconnaît le');
console.log('format et crée toutes les variables d’un coup.\n');
console.log('Cochez les trois environnements — Production, Preview, Development.\n');
console.log('─'.repeat(64));
console.log(lignes.join('\n'));
console.log('─'.repeat(64));

if (aDecider.length > 0) {
  console.log('\nÉcartées, car encore sur une valeur d’exemple :\n');
  for (const ligne of aDecider) console.log(`  · ${ligne}`);
}

const problemes = verifierProduction(process.env).filter((p) => p.niveau === BLOQUANT);
if (problemes.length > 0) {
  console.log('\nÀ corriger avant de déployer :\n');
  for (const p of problemes) {
    console.log(`  ✗ ${p.variable} — ${p.constat}`);
    console.log(`     → ${p.correction}\n`);
  }
}

console.log(
  '\nRappel : une variable ajoutée ne s’applique pas aux déploiements déjà faits.\n' +
    'Relancez un déploiement après les avoir saisies.\n',
);
