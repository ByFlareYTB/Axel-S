/**
 * Contrôle de la configuration destinée à la production.
 *
 * Une variable oubliée sur Vercel ne casse pas le déploiement : l'application
 * démarre, et le défaut ne se voit qu'au premier client. Un SESSION_SECRET
 * laissé à sa valeur d'exemple est pire encore — il est public sur GitHub, et
 * permet à quiconque de fabriquer un cookie de session valide.
 *
 * Ce module ne lit rien lui-même : il reçoit un environnement et le juge, pour
 * être testable et utilisable aussi bien avant qu'après le déploiement.
 */

/** Valeur d'exemple du fichier .env.example — à ne jamais retrouver en ligne. */
export const SECRET_EXEMPLE = 'dev-session-secret-change-me-please-32chars';

/**
 * Domaine d'exemple du fichier .env.example.
 *
 * Il appartient à un tiers. Laissé en place, il ferait viser à l'application
 * un domaine qui n'est pas le vôtre : les sous-domaines clients seraient
 * annoncés sur une zone que vous ne contrôlez pas.
 */
export const DOMAINE_EXEMPLE = 'siteforge.ai';

/** Domaines d'expédition partagés des fournisseurs d'emailing. */
const DOMAINES_PARTAGES = ['resend.dev', 'sendinblue.com', 'brevo.com'];

const BLOQUANT = 'bloquant';
const AVERTISSEMENT = 'avertissement';

function adresseLocale(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
}

function domaineDe(from) {
  const adresse = from.match(/<([^>]+)>/)?.[1] ?? from;
  return adresse.trim().split('@')[1]?.toLowerCase() ?? null;
}

function racine(domaine) {
  return domaine.split('.').slice(-2).join('.');
}

/**
 * Juge un environnement destiné à une adresse publique.
 *
 * Renvoie la liste des problèmes : `bloquant` empêche un fonctionnement
 * correct, `avertissement` signale ce qui marchera mal sans casser.
 */
export function verifierProduction(env) {
  const problemes = [];
  const lire = (cle) => (env[cle] ?? '').trim();

  const ajouter = (niveau, variable, constat, correction) =>
    problemes.push({ niveau, variable, constat, correction });

  // --- Ce qui empêche l'application de fonctionner ------------------------

  if (lire('DEMO_MODE').toLowerCase() === 'true') {
    ajouter(
      BLOQUANT,
      'DEMO_MODE',
      'Le mode démo est actif : les données sont fictives et disparaissent à chaque redémarrage.',
      'Mettez DEMO_MODE=false.',
    );
  }

  if (!lire('DATABASE_URL')) {
    ajouter(
      BLOQUANT,
      'DATABASE_URL',
      "Aucune base n'est configurée. Sur Vercel le disque est effacé entre les requêtes : " +
        'sans base, vos clients et vos factures seraient perdus en silence.',
      'Renseignez la chaîne de connexion Supabase (Project Settings → Database → URI).',
    );
  }

  const secret = lire('SESSION_SECRET');
  if (!secret || secret === SECRET_EXEMPLE) {
    ajouter(
      BLOQUANT,
      'SESSION_SECRET',
      secret
        ? "Le secret de session est encore celui de l'exemple, publié sur GitHub : " +
            "n'importe qui peut fabriquer un cookie valide et entrer dans le dashboard."
        : 'Le secret de session est absent : la valeur de repli est publique.',
      'Générez-en un : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  } else if (secret.length < 32) {
    ajouter(
      BLOQUANT,
      'SESSION_SECRET',
      `Le secret de session ne fait que ${secret.length} caractères.`,
      'Utilisez au moins 32 caractères aléatoires.',
    );
  }

  const base = lire('APP_BASE_URL');
  if (!base) {
    ajouter(
      BLOQUANT,
      'APP_BASE_URL',
      "L'application ignore sa propre adresse publique : les liens de validation " +
        'envoyés aux clients pointeront vers localhost.',
      "Renseignez l'adresse du déploiement, sans barre oblique finale.",
    );
  } else if (adresseLocale(base)) {
    ajouter(
      BLOQUANT,
      'APP_BASE_URL',
      `L'adresse ${base} ne désigne que la machine qui exécute l'application. ` +
        'Aucun client ne pourra ouvrir les liens reçus par email.',
      "Remplacez-la par l'adresse publique du déploiement.",
    );
  } else if (!/^https:\/\//i.test(base)) {
    ajouter(
      BLOQUANT,
      'APP_BASE_URL',
      `L'adresse ${base} n'est pas en HTTPS.`,
      'Utilisez https:// — les navigateurs refusent les cookies de session sécurisés sinon.',
    );
  }

  // --- Ce qui fonctionnera mal -------------------------------------------

  if (!lire('ANTHROPIC_API_KEY')) {
    ajouter(
      AVERTISSEMENT,
      'ANTHROPIC_API_KEY',
      'La génération de sites sera indisponible.',
      'console.anthropic.com → API Keys.',
    );
  }

  if (!lire('RESEND_API_KEY') && !lire('BREVO_API_KEY')) {
    ajouter(
      AVERTISSEMENT,
      'RESEND_API_KEY',
      "L'envoi d'emails sera indisponible : ni prospection, ni demande de validation.",
      'resend.com → API Keys.',
    );
  }

  const domaineRacine = lire('ROOT_DOMAIN') || lire('CLOUDFLARE_ROOT_DOMAIN');
  if (!domaineRacine) {
    ajouter(
      AVERTISSEMENT,
      'ROOT_DOMAIN',
      "Le domaine racine des sous-domaines clients n'est pas renseigné.",
      'Renseignez votre domaine, par exemple ROOT_DOMAIN=mondomaine.fr.',
    );
  } else if (domaineRacine === DOMAINE_EXEMPLE) {
    ajouter(
      AVERTISSEMENT,
      'ROOT_DOMAIN',
      `« ${DOMAINE_EXEMPLE} » est le domaine d'exemple du fichier .env.example, et il ` +
        "appartient à un tiers. Les sous-domaines de vos clients seraient annoncés sur une " +
        'zone que vous ne contrôlez pas.',
      'Remplacez-le par votre propre domaine.',
    );
  }

  const from = lire('EMAIL_FROM');
  const domaineFrom = from ? domaineDe(from) : null;

  if (domaineFrom && DOMAINES_PARTAGES.includes(domaineFrom)) {
    ajouter(
      AVERTISSEMENT,
      'EMAIL_FROM',
      `L'expéditeur ${from} est l'adresse de test partagée du fournisseur : rien ne ` +
        "l'authentifie à votre nom, et vos emails partiront dans les indésirables.",
      'Vérifiez votre domaine sur resend.com/domains, puis utilisez une adresse de ce domaine.',
    );
  } else if (domaineFrom && base && !adresseLocale(base)) {
    let hote = null;
    try {
      hote = new URL(base).hostname.toLowerCase();
    } catch {
      /* déjà signalé plus haut */
    }
    if (hote && racine(hote) !== racine(domaineFrom)) {
      ajouter(
        AVERTISSEMENT,
        'EMAIL_FROM',
        `L'expéditeur utilise ${domaineFrom} alors que les liens pointent vers ${hote}. ` +
          'Cet écart affaiblit la confiance accordée à vos messages.',
        'Utilisez le même domaine des deux côtés.',
      );
    }
  }

  if (!lire('SIREN') || lire('SIREN') === '000000000') {
    ajouter(
      AVERTISSEMENT,
      'SIREN',
      'Vos devis et factures porteront un SIREN fictif — mention légale obligatoire.',
      'Renseignez le SIREN de votre microentreprise.',
    );
  }

  for (const cle of ['ENTREPRISE_NOM', 'ENTREPRISE_EXPLOITANT', 'ENTREPRISE_ADRESSE', 'ENTREPRISE_EMAIL']) {
    if (!lire(cle)) {
      ajouter(
        AVERTISSEMENT,
        cle,
        'Absente des mentions légales des devis et factures.',
        'Renseignez-la.',
      );
    }
  }

  return problemes;
}

export { BLOQUANT, AVERTISSEMENT };
