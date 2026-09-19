#!/usr/bin/env node
/**
 * Contrôle des enregistrements DNS du domaine racine.
 *
 * Usage : npm run dns:check
 *
 * À lancer après avoir créé les entrées chez le registrar. La propagation
 * prend de quelques minutes à quelques heures : un enregistrement absent ici
 * peut simplement ne pas être encore diffusé.
 */
import { Resolver } from 'node:dns/promises';
import { chargerEnvironnement } from './env.mjs';
import { ERRONE, MANQUANT, interpreter } from './dns-verif.mjs';
import { DOMAINE_EXEMPLE } from './prod.mjs';

chargerEnvironnement();

// D'où vient la valeur : un contrôle mené sur le mauvais domaine produit un
// rapport parfaitement cohérent et entièrement hors sujet.
const source = process.env.ROOT_DOMAIN ? 'ROOT_DOMAIN' : 'CLOUDFLARE_ROOT_DOMAIN';
const racine = (process.env.ROOT_DOMAIN || process.env.CLOUDFLARE_ROOT_DOMAIN || '').trim();

if (racine === DOMAINE_EXEMPLE) {
  console.error(
    `\n« ${DOMAINE_EXEMPLE} » est le domaine d'exemple de .env.example, pas le vôtre :\n` +
      "il appartient à un tiers, et contrôler sa zone n'apprend rien sur la vôtre.\n\n" +
      `Remplacez ${source} dans .env.local par votre domaine :\n` +
      '  ROOT_DOMAIN=mondomaine.fr\n',
  );
  process.exit(1);
}

if (!racine) {
  console.error(
    '\nROOT_DOMAIN est absent de .env.local.\n' +
      '  ROOT_DOMAIN=siteforgeai.fr\n',
  );
  process.exit(1);
}

// Un résolveur public plutôt que celui du système : le cache d'une box
// internet garde longtemps l'absence d'un enregistrement tout juste créé.
const resolveur = new Resolver();
resolveur.setServers(['1.1.1.1', '8.8.8.8']);

/** Résout sans faire échouer le script : un nom absent est une information. */
async function lire(methode, nom) {
  try {
    const valeurs = await resolveur[methode](nom);
    return methode === 'resolveTxt' ? valeurs.map((morceaux) => morceaux.join('')) : valeurs;
  } catch {
    return [];
  }
}

// Le générique se sonde sur un nom qui n'a jamais été créé : s'il résout,
// c'est « * » qui répond.
const sonde = `sonde-${Date.now().toString(36)}.${racine}`;

// Où la zone est réellement hébergée. Décisif : des entrées créées dans le
// tableau de bord du registrar n'ont aucun effet si la zone est déléguée
// ailleurs — elles existent, et personne ne les lit.
const serveurs = await lire('resolveNs', racine);

const lectures = {
  app: await lire('resolveCname', `app.${racine}`),
  wildcard: await lire('resolveCname', sonde),
  acme: await lire('resolveCname', `_acme-challenge.${racine}`),
  spf: await lire('resolveTxt', racine),
  // Le sous-domaine d'envoi doit être lu en CNAME : c'est là que se voit s'il
  // est réellement délégué au fournisseur, ou capté par le générique.
  sendCname: await lire('resolveCname', `send.${racine}`),
  dkim: await lire('resolveTxt', `resend._domainkey.${racine}`),
  dmarc: await lire('resolveTxt', `_dmarc.${racine}`),
};

/** Nomme l'hébergeur DNS quand il est reconnaissable, pour lever l'ambiguïté. */
function nommerHebergeur(liste) {
  const connus = [
    ['cloudflare', 'le tableau de bord Cloudflare'],
    ['ovh', 'la zone DNS OVH'],
    ['vercel-dns', 'le tableau de bord Vercel'],
    ['gandi', 'le tableau de bord Gandi'],
    ['ionos', 'le tableau de bord IONOS'],
  ];
  const trouve = connus.find(([motif]) => liste.some((s) => s.toLowerCase().includes(motif)));
  return trouve ? ` — soit ${trouve[1]}` : '';
}

const resultats = interpreter(lectures, racine);

console.log(`\nEnregistrements DNS de ${racine}  (lu dans ${source})\n`);

if (serveurs.length > 0) {
  console.log('  Serveurs de noms faisant autorité :');
  for (const serveur of serveurs) console.log(`    ${serveur}`);
  console.log(
    `\n  C'est là que les enregistrements doivent être créés${nommerHebergeur(serveurs)}.\n`,
  );
} else {
  console.log(
    "  Aucun serveur de noms trouvé : le domaine vient peut-être d'être acheté et sa zone\n" +
      "  n'est pas encore diffusée. Réessayez dans quelques heures.\n",
  );
}

for (const r of resultats) {
  const marque = r.etat === 'ok' ? '✓' : r.etat === ERRONE ? '✗' : '·';
  console.log(`  ${marque} ${r.nom}`);
  console.log(`     ${r.constat}`);
  if (r.correction) console.log(`     → ${r.correction}`);
  console.log();
}

const errones = resultats.filter((r) => r.etat === ERRONE);
const manquants = resultats.filter((r) => r.etat === MANQUANT);

if (errones.length === 0 && manquants.length === 0) {
  console.log('Tout est en place. Posez DNS_WILDCARD=true et redéployez.\n');
} else {
  if (errones.length > 0) {
    console.log(`${errones.length} enregistrement(s) à corriger — ils existent mais sont faux.`);
  }
  if (manquants.length > 0) {
    console.log(
      `${manquants.length} enregistrement(s) introuvable(s). Si vous venez de les créer, ` +
        'la propagation peut prendre plusieurs heures : relancez plus tard.',
    );
  }
  console.log();
}

// Un enregistrement faux est une erreur ; un enregistrement en cours de
// propagation n'en est pas une.
process.exitCode = errones.length > 0 ? 1 : 0;
