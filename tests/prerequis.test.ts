import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CapaciteIndisponibleError,
  estDisponible,
  etatCapacites,
  exigerCapacite,
  manquantes,
} from '@/lib/integrations/prerequis';

const ENV_INITIAL = { ...process.env };

describe('prérequis des intégrations', () => {
  beforeEach(() => {
    // On part d'un environnement vierge : aucune clé configurée.
    for (const cle of [
      'ANTHROPIC_API_KEY',
      'PERPLEXITY_API_KEY',
      'VERCEL_TOKEN',
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_ZONE_ID',
      'STRIPE_SECRET_KEY',
      'RESEND_API_KEY',
      'META_ADS_TOKEN',
    ]) {
      delete process.env[cle];
    }
  });

  afterEach(() => {
    process.env = { ...ENV_INITIAL };
  });

  it('signale une capacité non configurée', () => {
    expect(estDisponible('generation_ia')).toBe(false);
    expect(manquantes('generation_ia')).toEqual(['ANTHROPIC_API_KEY']);
  });

  it('reconnaît une capacité configurée', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(estDisponible('generation_ia')).toBe(true);
    expect(manquantes('generation_ia')).toEqual([]);
  });

  it('ignore une valeur vide ou faite d’espaces', () => {
    process.env.ANTHROPIC_API_KEY = '   ';
    expect(estDisponible('generation_ia')).toBe(false);
  });

  it('exige toutes les variables d’une capacité qui en demande plusieurs', () => {
    process.env.CLOUDFLARE_API_TOKEN = 'jeton';
    expect(manquantes('dns_ssl')).toEqual(['CLOUDFLARE_ZONE_ID']);

    process.env.CLOUDFLARE_ZONE_ID = 'zone';
    expect(estDisponible('dns_ssl')).toBe(true);
  });

  it('accepte l’un ou l’autre fournisseur d’emailing', () => {
    expect(manquantes('emailing')).toEqual(['RESEND_API_KEY']);
    process.env.RESEND_API_KEY = 'clé';
    expect(estDisponible('emailing')).toBe(true);
  });

  it('lève une erreur qui nomme la variable et l’endroit où la trouver', () => {
    let erreur: unknown;
    try {
      exigerCapacite('hebergement');
    } catch (err) {
      erreur = err;
    }

    expect(erreur).toBeInstanceOf(CapaciteIndisponibleError);
    const message = (erreur as Error).message;
    expect(message).toContain('VERCEL_TOKEN');
    expect(message).toContain('.env.local');
    // L'utilisateur doit savoir ce qu'il perd, pas seulement ce qui manque.
    expect(message).toContain('Impossible de déployer');
  });

  it('laisse passer quand la capacité est configurée', () => {
    process.env.VERCEL_TOKEN = 'jeton';
    expect(() => exigerCapacite('hebergement')).not.toThrow();
  });

  it('dresse l’état de toutes les capacités', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const etat = etatCapacites();

    expect(etat).toHaveLength(7);
    expect(etat.find((c) => c.capacite === 'generation_ia')?.disponible).toBe(true);
    expect(etat.find((c) => c.capacite === 'paiement')?.disponible).toBe(false);
    // Chaque capacité indisponible explique sa conséquence.
    for (const capacite of etat.filter((c) => !c.disponible)) {
      expect(capacite.consequence.length).toBeGreaterThan(10);
      expect(capacite.manquantes.length).toBeGreaterThan(0);
    }
  });
});
