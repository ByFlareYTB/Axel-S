// ---------------------------------------------------------------------------
// Prérequis des intégrations.
//
// En production, une clé manquante doit produire un message qui nomme la
// variable à renseigner — jamais un succès simulé. Montrer à un client un site
// « déployé » qui n'existe pas serait la pire des issues : il vaut mieux un
// refus explicite qu'une illusion.
//
// Chaque capacité est déclarée ici une fois, et sert à deux choses : bloquer
// l'action avec une explication utile, et afficher l'état réel dans Paramètres.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';

export type Capacite =
  | 'generation_ia'
  | 'recherche_web'
  | 'hebergement'
  | 'dns_ssl'
  | 'paiement'
  | 'emailing'
  | 'ads';

interface DefinitionCapacite {
  libelle: string;
  /** Variables d'environnement indispensables. */
  variables: string[];
  /** Ce que vous ne pouvez pas faire tant qu'elles manquent. */
  consequence: string;
  ou: string;
}

const CAPACITES: Record<Capacite, DefinitionCapacite> = {
  generation_ia: {
    libelle: 'Génération de sites par IA',
    variables: ['ANTHROPIC_API_KEY'],
    consequence: 'Impossible de générer un site.',
    ou: 'console.anthropic.com → API keys',
  },
  recherche_web: {
    libelle: 'Recherche et veille web',
    variables: ['PERPLEXITY_API_KEY'],
    consequence:
      "La recherche de prospects se limite à l'annuaire SIRENE, sans enrichissement web ni veille tarifaire.",
    ou: 'perplexity.ai → Settings → API',
  },
  hebergement: {
    libelle: 'Hébergement automatisé',
    variables: ['VERCEL_TOKEN'],
    consequence: 'Impossible de déployer un site, en test comme en production.',
    ou: 'vercel.com → Account Settings → Tokens',
  },
  dns_ssl: {
    libelle: 'Domaine et certificat SSL',
    variables: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID'],
    consequence: 'La mise en production se fera sans configuration DNS ni SSL automatique.',
    ou: 'dash.cloudflare.com → My Profile → API Tokens',
  },
  paiement: {
    libelle: 'Encaissement',
    variables: ['STRIPE_SECRET_KEY'],
    consequence:
      'Les devis et factures sont bien générés, mais aucun lien de paiement ni prélèvement automatique.',
    ou: 'dashboard.stripe.com → Développeurs → Clés API',
  },
  emailing: {
    libelle: 'Envoi d’emails',
    variables: ['RESEND_API_KEY'],
    consequence:
      "Aucun email ne part : ni prospection, ni demande de validation, ni envoi de devis.",
    ou: 'resend.com → API Keys (ou BREVO_API_KEY avec EMAIL_PROVIDER=brevo)',
  },
  ads: {
    libelle: 'Statistiques publicitaires',
    variables: ['META_ADS_TOKEN'],
    consequence: 'Les campagnes ne se synchronisent pas automatiquement.',
    ou: 'developers.facebook.com → Outils → Token d’accès',
  },
};

function valeur(variable: string): string {
  return process.env[variable]?.trim() ?? '';
}

/** Variables manquantes pour une capacité donnée. */
export function manquantes(capacite: Capacite): string[] {
  if (capacite === 'emailing') {
    // Deux fournisseurs interchangeables : l'un des deux suffit.
    const choisi = config.email.provider === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY';
    return valeur(choisi) ? [] : [choisi];
  }
  return CAPACITES[capacite].variables.filter((variable) => !valeur(variable));
}

export function estDisponible(capacite: Capacite): boolean {
  return manquantes(capacite).length === 0;
}

export class CapaciteIndisponibleError extends Error {
  constructor(
    readonly capacite: Capacite,
    readonly variables: string[],
  ) {
    const definition = CAPACITES[capacite];
    super(
      `${definition.libelle} indisponible : ${variables.join(' et ')} ${
        variables.length > 1 ? 'ne sont pas renseignées' : "n'est pas renseignée"
      }. ${definition.consequence} Ajoutez ${variables.length > 1 ? 'ces valeurs' : 'cette valeur'} dans .env.local (${definition.ou}), puis redémarrez l'application.`,
    );
    this.name = 'CapaciteIndisponibleError';
  }
}

/**
 * Bloque l'action si la capacité n'est pas configurée.
 * En mode démo, tout est considéré disponible : rien ne sort de la machine.
 */
export function exigerCapacite(capacite: Capacite): void {
  if (config.demo) return;
  const absentes = manquantes(capacite);
  if (absentes.length > 0) throw new CapaciteIndisponibleError(capacite, absentes);
}

export interface EtatCapacite {
  capacite: Capacite;
  libelle: string;
  disponible: boolean;
  manquantes: string[];
  consequence: string;
  ou: string;
}

/** État de toutes les intégrations, pour la page Paramètres. */
export function etatCapacites(): EtatCapacite[] {
  return (Object.keys(CAPACITES) as Capacite[]).map((capacite) => {
    const absentes = manquantes(capacite);
    return {
      capacite,
      libelle: CAPACITES[capacite].libelle,
      disponible: absentes.length === 0,
      manquantes: absentes,
      consequence: CAPACITES[capacite].consequence,
      ou: CAPACITES[capacite].ou,
    };
  });
}
