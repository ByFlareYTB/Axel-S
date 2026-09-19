/**
 * Chargement des fichiers d'environnement pour les scripts en ligne de commande.
 *
 * Next.js lit `.env.local` tout seul, mais un script lancé à la main non :
 * Node ne charge aucun fichier `.env` par défaut. Sans cela, un script comme
 * les migrations ne voit pas la configuration de son propre projet.
 *
 * Ordre de priorité, du plus fort au plus faible — le premier qui définit une
 * variable gagne, comme chez Next.js :
 *   1. l'environnement réel du shell
 *   2. .env.local
 *   3. .env
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Analyse le contenu d'un fichier .env en paires clé/valeur. */
function analyser(contenu) {
  const valeurs = {};

  for (const ligne of contenu.split('\n')) {
    const propre = ligne.trim();
    if (!propre || propre.startsWith('#')) continue;

    const separateur = propre.indexOf('=');
    if (separateur === -1) continue;

    const cle = propre.slice(0, separateur).trim();
    let valeur = propre.slice(separateur + 1).trim();

    // Les valeurs peuvent être entourées de guillemets — une chaîne de
    // connexion contient souvent des caractères qui l'exigent.
    const guillemet = valeur[0];
    if ((guillemet === '"' || guillemet === "'") && valeur.endsWith(guillemet)) {
      valeur = valeur.slice(1, -1);
    }

    if (cle) valeurs[cle] = valeur;
  }

  return valeurs;
}

/** Charge .env.local puis .env, sans jamais écraser l'environnement réel. */
export function chargerEnvironnement() {
  for (const fichier of ['.env.local', '.env']) {
    let contenu;
    try {
      contenu = readFileSync(resolve(RACINE, fichier), 'utf8');
    } catch {
      continue;
    }

    for (const [cle, valeur] of Object.entries(analyser(contenu))) {
      if (process.env[cle] === undefined) process.env[cle] = valeur;
    }
  }
}

/**
 * Vérifie qu'une chaîne de connexion est exploitable, et explique ce qui cloche.
 *
 * Les deux pièges du démarrage sont le mot de passe laissé entre crochets et
 * l'URL tronquée : tous deux produisent une erreur de résolution DNS
 * incompréhensible (« ENOTFOUND postgres ») plutôt qu'un message utile.
 */
export function verifierUrlBase(url) {
  if (!url) {
    return (
      'DATABASE_URL absent.\n' +
      'Renseignez-le dans .env.local, par exemple :\n' +
      '  DATABASE_URL=postgresql://postgres:MonMotDePasse@db.xxxx.supabase.co:5432/postgres'
    );
  }

  if (/\[.*\]/.test(url)) {
    return (
      'DATABASE_URL contient encore un espace réservé entre crochets.\n' +
      'Remplacez [YOUR-PASSWORD] par votre vrai mot de passe, crochets compris :\n' +
      '  postgresql://postgres:MonMotDePasse@db.xxxx.supabase.co:5432/postgres'
    );
  }

  let analysee;
  try {
    analysee = new URL(url);
  } catch {
    return `DATABASE_URL n'est pas une URL valide :\n  ${url}`;
  }

  if (!/^postgres(ql)?:$/.test(analysee.protocol)) {
    return `DATABASE_URL doit commencer par postgresql:// (reçu : ${analysee.protocol}//)`;
  }

  // L'hôte « postgres » est celui qu'on obtient quand l'URL est mal formée :
  // c'est le nom d'utilisateur qui a été pris pour le serveur.
  if (!analysee.hostname || analysee.hostname === 'postgres') {
    return (
      `DATABASE_URL ne désigne aucun serveur valide (hôte lu : « ${analysee.hostname} »).\n` +
      'Recopiez la chaîne complète depuis Supabase : Project Settings → Database → Connection string → URI.'
    );
  }

  return null;
}
