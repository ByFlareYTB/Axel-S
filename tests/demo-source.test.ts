import { beforeEach, describe, expect, it } from 'vitest';
import { demoSource } from '@/lib/db/demo-source';
import type { Prospect } from '@/lib/types';

describe('adaptateur de données en mode démo', () => {
  beforeEach(() => {
    // Le store vit sur globalThis : on le réinitialise entre les scénarios.
    delete (globalThis as { __siteforgeDemo?: unknown }).__siteforgeDemo;
  });

  it('charge un jeu de données cohérent', async () => {
    const [prospects, clients, sites, regles] = await Promise.all([
      demoSource.list('prospects'),
      demoSource.list('clients'),
      demoSource.list('sites'),
      demoSource.list('pricing_rules'),
    ]);
    expect(prospects.length).toBeGreaterThan(20);
    expect(clients.length).toBeGreaterThan(0);
    expect(sites.length).toBe(clients.length);
    expect(regles).toHaveLength(11);
  });

  it('rattache chaque site à un client existant', async () => {
    const clients = await demoSource.list<{ id: string }>('clients');
    const sites = await demoSource.list<{ client_id: string }>('sites');
    const ids = new Set(clients.map((c) => c.id));
    expect(sites.every((s) => ids.has(s.client_id))).toBe(true);
  });

  it('filtre, trie et limite les résultats', async () => {
    const convertis = await demoSource.list<Prospect>('prospects', { statut: 'client' });
    expect(convertis.length).toBeGreaterThan(0);
    expect(convertis.every((p) => p.statut === 'client')).toBe(true);

    const meilleurs = await demoSource.list<Prospect>('prospects', {}, {
      orderBy: 'score',
      dir: 'desc',
      limit: 3,
    });
    expect(meilleurs).toHaveLength(3);
    expect(meilleurs[0].score).toBeGreaterThanOrEqual(meilleurs[2].score);
  });

  it('insère, met à jour et supprime', async () => {
    const cree = await demoSource.insert<Prospect>('prospects', {
      raison_sociale: 'Test SARL',
      statut: 'non_vu',
      score: 50,
    });
    expect(cree.id).toBeTruthy();

    const modifie = await demoSource.update<Prospect>('prospects', cree.id, { statut: 'refuse' });
    expect(modifie?.statut).toBe('refuse');

    expect(await demoSource.remove('prospects', cree.id)).toBe(true);
    expect(await demoSource.get('prospects', cree.id)).toBeNull();
  });

  it('gère les tables dont la clé primaire n’est pas « id »', async () => {
    const parametre = await demoSource.get<{ cle: string; valeur: string }>(
      'parametres',
      'marge_min_oneshot_pct',
    );
    expect(parametre?.valeur).toBe('70');
  });

  it('renvoie les lignes par copie, jamais par référence', async () => {
    const [avant] = await demoSource.list<Prospect>('prospects');
    avant.raison_sociale = 'Modifié hors du store';
    const [apres] = await demoSource.list<Prospect>('prospects');
    expect(apres.raison_sociale).not.toBe('Modifié hors du store');
  });
});
