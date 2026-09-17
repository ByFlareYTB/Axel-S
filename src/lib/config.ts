// ---------------------------------------------------------------------------
// Configuration centralisée. Tout est lu depuis l'environnement, avec des
// valeurs par défaut qui permettent de faire tourner l'app en mode démo
// sans aucune clé d'API.
// ---------------------------------------------------------------------------

function env(key: string, fallback = ''): string {
  return process.env[key]?.trim() || fallback;
}

/**
 * Mode démo : données fictives en mémoire, aucun appel réseau sortant.
 *
 * Désactivé par défaut — l'application démarre en production. Le mode démo
 * s'active explicitement avec DEMO_MODE=true, pour une démonstration ou un
 * essai sans conséquence.
 */
export const DEMO_MODE = env('DEMO_MODE', 'false').toLowerCase() === 'true';

export const config = {
  demo: DEMO_MODE,
  appBaseUrl: env('APP_BASE_URL', 'http://localhost:3000'),

  entreprise: {
    nom: env('ENTREPRISE_NOM', 'SiteForge AI'),
    exploitant: env('ENTREPRISE_EXPLOITANT', 'Axel S.'),
    siren: env('SIREN', '000000000'),
    adresse: env('ENTREPRISE_ADRESSE', '37260 Monts, Centre-Val de Loire, France'),
    email: env('ENTREPRISE_EMAIL', 'contact@siteforgeai.fr'),
    telephone: env('ENTREPRISE_TELEPHONE', ''),
    // Microentreprise : franchise en base de TVA.
    mentionTva: 'TVA non applicable, art. 293 B du CGI',
    mentionRetard:
      'En cas de retard de paiement, pénalités au taux de 3 fois le taux d\'intérêt légal ' +
      'et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).',
  },

  auth: {
    email: env('AUTH_EMAIL', 'contact@siteforgeai.fr'),
    passwordHash: env('AUTH_PASSWORD_HASH'),
    totpSecret: env('AUTH_TOTP_SECRET'),
    sessionSecret: env('SESSION_SECRET', 'dev-session-secret-change-me-please-32chars'),
    // En démo, le couple démo/démo suffit et la 2FA est facultative.
    demoPassword: 'demo',
  },

  database: { url: env('DATABASE_URL') },

  anthropic: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('ANTHROPIC_MODEL', 'claude-opus-5'),
    // Requis uniquement si la clé n'est rattachée à aucun workspace.
    workspaceId: env('ANTHROPIC_WORKSPACE_ID'),
  },

  perplexity: {
    apiKey: env('PERPLEXITY_API_KEY'),
    model: env('PERPLEXITY_MODEL', 'sonar'),
  },

  sirene: { url: env('SIRENE_API_URL', 'https://recherche-entreprises.api.gouv.fr') },

  vercel: { token: env('VERCEL_TOKEN'), teamId: env('VERCEL_TEAM_ID') },

  /**
   * Domaine racine des sites clients, et façon dont leurs sous-domaines sont
   * publiés.
   *
   * `wildcard` : un enregistrement générique `*.domaine` a été créé une fois
   * chez le registrar. Chaque sous-domaine client résout alors tout seul, sans
   * qu'aucune API DNS soit nécessaire — c'est le mode qui fonctionne partout,
   * y compris chez un registrar sans API exploitable.
   */
  domaine: {
    racine: env('ROOT_DOMAIN', env('CLOUDFLARE_ROOT_DOMAIN', 'siteforgeai.fr')),
    wildcard: env('DNS_WILDCARD', 'false').toLowerCase() === 'true',
  },

  cloudflare: {
    token: env('CLOUDFLARE_API_TOKEN'),
    zoneId: env('CLOUDFLARE_ZONE_ID'),
    rootDomain: env('ROOT_DOMAIN', env('CLOUDFLARE_ROOT_DOMAIN', 'siteforgeai.fr')),
  },

  stripe: {
    secretKey: env('STRIPE_SECRET_KEY'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
  },

  email: {
    provider: env('EMAIL_PROVIDER', 'resend') as 'resend' | 'brevo',
    resendKey: env('RESEND_API_KEY'),
    brevoKey: env('BREVO_API_KEY'),
    from: env('EMAIL_FROM', 'SiteForge AI <contact@siteforgeai.fr>'),
  },

  ads: {
    metaToken: env('META_ADS_TOKEN'),
    metaAccountId: env('META_ADS_ACCOUNT_ID'),
    googleToken: env('GOOGLE_ADS_TOKEN'),
    googleCustomerId: env('GOOGLE_ADS_CUSTOMER_ID'),
  },

  alertes: {
    telegramToken: env('TELEGRAM_BOT_TOKEN'),
    telegramChatId: env('TELEGRAM_CHAT_ID'),
    slackWebhook: env('SLACK_WEBHOOK_URL'),
  },
} as const;

/** Formatage monétaire français, utilisé partout dans l'UI et les PDF. */
export function euros(montant: number, decimales = 2): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(montant);
}

/**
 * Vrai quand l'application n'est joignable que depuis la machine qui l'exécute.
 *
 * Décisif pour les emails : un lien de validation en localhost ouvre la machine
 * du destinataire, pas la vôtre. Il est donc mort pour tout client réel, alors
 * même que l'email part correctement.
 */
export function applicationLocaleUniquement(): boolean {
  const url = process.env.APP_BASE_URL?.trim() || 'http://localhost:3000';
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
}

export function dateFr(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(d);
}
