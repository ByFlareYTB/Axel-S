import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client, Devis, Prospect, Site, SiteVersion } from '@/lib/types';

/**
 * Tests de l'adaptateur PostgreSQL contre une vraie base.
 *
 * Ignorés sans `TEST_DATABASE_URL`, pour que la suite reste exécutable sans
 * infrastructure. Pour les lancer :
 *
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/siteforge_test \
 *     npm run db:migrate && npm test
 *
 * Ils couvrent ce qu'aucun test en mémoire ne peut attraper : la sérialisation
 * des colonnes jsonb, les types énumérés, et la conversion des `numeric` que
 * PostgreSQL renvoie sous forme de chaînes.
 */
const URL_TEST = process.env.TEST_DATABASE_URL;
const suite = URL_TEST ? describe : describe.skip;

suite('adaptateur PostgreSQL', () => {
  let pgSource: typeof import('@/lib/db/pg-source').pgSource;
  let sql: import('postgres').Sql;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TEST;
    process.env.DEMO_MODE = 'false';
    pgSource = (await import('@/lib/db/pg-source')).pgSource;

    const postgres = (await import('postgres')).default;
    sql = postgres(URL_TEST!, { onnotice: () => {} });
  });

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    // Ordre inverse des dépendances : les enfants avant les parents.
    await sql`truncate site_versions, sites, devis, factures, notifications, prospects, clients restart identity cascade`;
  });

  async function creerClient(): Promise<Client> {
    return pgSource.insert<Client>('clients', {
      raison_sociale: 'Boulangerie Le Fournil',
      email: 'contact@fournil.fr',
      ville: 'Monts',
    });
  }

  it('écrit et relit une ligne simple', async () => {
    const client = await creerClient();
    expect(client.id).toBeTruthy();

    const relu = await pgSource.get<Client>('clients', client.id);
    expect(relu?.raison_sociale).toBe('Boulangerie Le Fournil');
  });

  it('conserve un tableau dans une colonne jsonb', async () => {
    const client = await creerClient();
    const site = await pgSource.insert<Site>('sites', {
      client_id: client.id,
      nom: 'Le Fournil',
      statut: 'test',
      options_actives: ['module_reservation', 'pack_visibilite'],
    });

    const relu = await pgSource.get<Site>('sites', site.id);
    expect(relu?.options_actives).toEqual(['module_reservation', 'pack_visibilite']);
  });

  it('conserve un objet imbriqué dans une colonne jsonb', async () => {
    const client = await creerClient();
    const site = await pgSource.insert<Site>('sites', {
      client_id: client.id,
      nom: 'Le Fournil',
      statut: 'test',
    });

    const contenu = { pages: [{ slug: 'accueil', html: '<h1>Bonjour</h1>' }], palette: { fond: '#fff' } };
    const version = await pgSource.insert<SiteVersion>('site_versions', {
      site_id: site.id,
      version: 1,
      contenu,
    });

    const relue = await pgSource.get<SiteVersion>('site_versions', version.id);
    expect(relue?.contenu).toEqual(contenu);
  });

  it('renvoie les montants en nombres, pas en chaînes', async () => {
    const client = await creerClient();
    const devis = await pgSource.insert<Devis>('devis', {
      numero: 'DEV-2026-0001',
      client_id: client.id,
      options_selectionnees: [{ code: 'base_site_essentiel', quantite: 1 }],
      total_oneshot: 249,
      marge_oneshot_pct: 98.19,
    });

    // PostgreSQL renvoie les `numeric` en chaînes : sans conversion, tout
    // calcul de marge produirait des concaténations au lieu de sommes.
    const relu = await pgSource.get<Devis>('devis', devis.id);
    expect(typeof relu?.total_oneshot).toBe('number');
    expect(relu?.total_oneshot).toBe(249);
    expect(relu?.marge_oneshot_pct).toBeCloseTo(98.19, 2);
  });

  it('accepte les valeurs des types énumérés', async () => {
    for (const statut of ['non_vu', 'en_attente', 'client', 'refuse'] as const) {
      const prospect = await pgSource.insert<Prospect>('prospects', {
        raison_sociale: `Prospect ${statut}`,
        statut,
      });
      expect(prospect.statut).toBe(statut);
    }
  });

  it('filtre, trie et limite', async () => {
    for (const [nom, score] of [['A', 30], ['B', 90], ['C', 60]] as const) {
      await pgSource.insert('prospects', { raison_sociale: nom, statut: 'non_vu', score });
    }
    await pgSource.insert('prospects', { raison_sociale: 'D', statut: 'client', score: 99 });

    const nonVus = await pgSource.list<Prospect>('prospects', { statut: 'non_vu' });
    expect(nonVus).toHaveLength(3);

    const meilleurs = await pgSource.list<Prospect>('prospects', {}, {
      orderBy: 'score',
      dir: 'desc',
      limit: 2,
    });
    expect(meilleurs.map((p) => p.raison_sociale)).toEqual(['D', 'B']);
  });

  it('filtre sur plusieurs valeurs à la fois', async () => {
    await pgSource.insert('prospects', { raison_sociale: 'A', statut: 'non_vu' });
    await pgSource.insert('prospects', { raison_sociale: 'B', statut: 'client' });
    await pgSource.insert('prospects', { raison_sociale: 'C', statut: 'refuse' });

    const retenus = await pgSource.list<Prospect>('prospects', { statut: ['non_vu', 'client'] });
    expect(retenus).toHaveLength(2);
  });

  it('met à jour, compte et supprime', async () => {
    const client = await creerClient();

    const modifie = await pgSource.update<Client>('clients', client.id, { ville: 'Tours' });
    expect(modifie?.ville).toBe('Tours');

    expect(await pgSource.count('clients')).toBe(1);
    expect(await pgSource.count('clients', { ville: 'Tours' })).toBe(1);
    expect(await pgSource.count('clients', { ville: 'Paris' })).toBe(0);

    expect(await pgSource.remove('clients', client.id)).toBe(true);
    expect(await pgSource.get('clients', client.id)).toBeNull();
  });

  it('renvoie null plutôt que d’échouer sur une ligne absente', async () => {
    const absent = '00000000-0000-0000-0000-000000000000';
    expect(await pgSource.get('clients', absent)).toBeNull();
    expect(await pgSource.update('clients', absent, { ville: 'Tours' })).toBeNull();
    expect(await pgSource.remove('clients', absent)).toBe(false);
    expect(await pgSource.findOne('clients', { email: 'inconnu@nulle-part.fr' })).toBeNull();
  });

  it('trouve une ligne par un critère autre que sa clé', async () => {
    await creerClient();
    const trouve = await pgSource.findOne<Client>('clients', { email: 'contact@fournil.fr' });
    expect(trouve?.raison_sociale).toBe('Boulangerie Le Fournil');
  });

  it('gère une table dont la clé primaire n’est pas « id »', async () => {
    const parametre = await pgSource.get<{ cle: string; valeur: string }>(
      'parametres',
      'marge_min_oneshot_pct',
    );
    // Valeur posée par la migration d'amorçage.
    expect(parametre?.valeur).toBe('70');
  });

  it('charge la grille tarifaire installée par les migrations', async () => {
    const regles = await pgSource.list('pricing_rules', {}, { orderBy: 'ordre' });
    expect(regles).toHaveLength(11);
  });
});
