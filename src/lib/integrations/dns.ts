// ---------------------------------------------------------------------------
// Publication des sous-domaines clients.
//
// Trois façons de faire, de la plus automatique à la plus manuelle. Le mode se
// déduit de la configuration, sans réglage à choisir : c'est la présence des
// clés qui décide.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';
import { estDisponible } from './prerequis';

export type ModeDns =
  /** API Cloudflare : chaque sous-domaine est créé à la demande. */
  | 'cloudflare'
  /** Enregistrement générique posé une fois : tout sous-domaine résout déjà. */
  | 'wildcard'
  /** Rien : les sites restent joignables sur leur URL d'hébergement. */
  | 'aucun';

export function modeDns(): ModeDns {
  if (estDisponible('dns_ssl')) return 'cloudflare';
  if (config.domaine.wildcard) return 'wildcard';
  return 'aucun';
}

export interface EnregistrementRequis {
  type: 'CNAME' | 'TXT' | 'A';
  /** Nom tel qu'il se saisit chez le registrar, sans le domaine racine. */
  nom: string;
  /** Valeur à saisir, ou null quand l'hébergeur la donne lui-même. */
  valeur: string | null;
  /** Où lire la valeur, quand elle n'est pas connue d'avance. */
  ou?: string;
  role: string;
}

/**
 * Enregistrements DNS à créer chez le registrar, une fois pour toutes.
 *
 * Le générique `*` est ce qui remplace une API DNS : il déclare d'avance que
 * tout sous-domaine du domaine racine est servi par l'hébergeur. Créer le
 * sous-domaine d'un client ne demande alors plus rien côté DNS — seul
 * l'hébergeur doit apprendre le nom, ce qu'il fait par son API.
 *
 * Le second enregistrement délègue la validation du certificat générique :
 * sans lui, l'hébergeur ne peut pas émettre de certificat couvrant `*`, et les
 * sites clients s'ouvriraient sur un avertissement de sécurité.
 */
export function enregistrementsRequis(cibleHebergeur = 'cname.vercel-dns.com'): EnregistrementRequis[] {
  return [
    {
      type: 'CNAME',
      nom: 'app',
      valeur: cibleHebergeur,
      role: "L'application elle-même.",
    },
    {
      type: 'CNAME',
      nom: '*',
      valeur: cibleHebergeur,
      role: 'Tous les sites clients, présents et à venir.',
    },
    {
      type: 'CNAME',
      nom: '_acme-challenge',
      // La cible est propre à chaque projet : Vercel l'affiche au moment où
      // l'on déclare le domaine générique. L'inventer produirait un
      // enregistrement inerte et un certificat qui n'arrive jamais.
      valeur: null,
      ou: 'Vercel → Settings → Domains → ajoutez *.'
        + config.domaine.racine
        + ' : la valeur exacte s’affiche à ce moment-là.',
      role: 'Validation du certificat SSL générique — sans lui, aucun HTTPS sur les sites clients.',
    },
  ];
}

/** Sous-domaine attribué à un client, d'après sa raison sociale déjà normalisée. */
export function sousDomaineClient(slug: string): string {
  return `${slug}.${config.domaine.racine}`;
}
