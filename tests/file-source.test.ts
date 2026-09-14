import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Prospect } from '@/lib/types';

const ENV_INITIAL = { ...process.env };
let dossier: string;

// Le chemin est résolu à chaque appel : positionner DATA_FILE suffit, sans
// avoir à recharger le module.
async function chargerStore() {
  return import('@/lib/db/file-source');
}

describe('stockage fichier de production', () => {
  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), 'siteforge-'));
    process.env.DATA_FILE = join(dossier, 'donnees.json');
    delete (globalThis as { __siteforgeFichier?: unknown }).__siteforgeFichier;
  });

  afterEach(() => {
    rmSync(dossier, { recursive: true, force: true });
    process.env = { ...ENV_INITIAL };
    delete (globalThis as { __siteforgeFichier?: unknown }).__siteforgeFichier;
  });

  it('amorce la configuration sans aucune donnée commerciale', async () => {
    const { fileSource } = await chargerStore();

    const regles = await fileSource.list('pricing_rules');
    const parametres = await fileSource.list('parametres');
    expect(regles).toHaveLength(11);
    expect(parametres.length).toBeGreaterThan(0);

    // Le cœur de la bascule en production : aucune fiction préchargée.
    for (const table of ['prospects', 'clients', 'sites', 'devis', 'factures'] as const) {
      expect(await fileSource.list(table)).toHaveLength(0);
    }
  });

  it('n’active aucune promotion par défaut', async () => {
    const { fileSource } = await chargerStore();
    const offres = await fileSource.list<{ actif: boolean }>('offres_promo');
    expect(offres.length).toBeGreaterThan(0);
    expect(offres.every((offre) => !offre.actif)).toBe(true);
  });

  it('écrit sur disque dès la première lecture', async () => {
    const { fileSource, cheminFichierDonnees } = await chargerStore();
    await fileSource.list('pricing_rules');
    expect(existsSync(cheminFichierDonnees())).toBe(true);
  });

  it('persiste les écritures dans le fichier', async () => {
    const { fileSource, cheminFichierDonnees } = await chargerStore();

    await fileSource.insert<Prospect>('prospects', {
      raison_sociale: 'Boulangerie Durand',
      statut: 'non_vu',
      score: 75,
    });

    const contenu = JSON.parse(readFileSync(cheminFichierDonnees(), 'utf8'));
    expect(contenu.prospects).toHaveLength(1);
    expect(contenu.prospects[0].raison_sociale).toBe('Boulangerie Durand');
  });

  it('relit les données après redémarrage du processus', async () => {
    const premier = await chargerStore();
    await premier.fileSource.insert<Prospect>('prospects', {
      raison_sociale: 'Garage Martin',
      statut: 'en_attente',
      score: 60,
    });

    // Simule un redémarrage : le cache mémoire est vidé, le fichier demeure.
    delete (globalThis as { __siteforgeFichier?: unknown }).__siteforgeFichier;
    const second = await chargerStore();

    const prospects = await second.fileSource.list<Prospect>('prospects');
    expect(prospects).toHaveLength(1);
    expect(prospects[0].raison_sociale).toBe('Garage Martin');
  });

  it('applique les mises à jour et les suppressions sur disque', async () => {
    const { fileSource, cheminFichierDonnees } = await chargerStore();

    const cree = await fileSource.insert<Prospect>('prospects', {
      raison_sociale: 'Institut Belle',
      statut: 'non_vu',
      score: 50,
    });

    await fileSource.update('prospects', cree.id, { statut: 'client' });
    let contenu = JSON.parse(readFileSync(cheminFichierDonnees(), 'utf8'));
    expect(contenu.prospects[0].statut).toBe('client');

    await fileSource.remove('prospects', cree.id);
    contenu = JSON.parse(readFileSync(cheminFichierDonnees(), 'utf8'));
    expect(contenu.prospects).toHaveLength(0);
  });

  it('ne laisse jamais de fichier temporaire derrière lui', async () => {
    const { fileSource, cheminFichierDonnees } = await chargerStore();
    await fileSource.insert('prospects', { raison_sociale: 'Test', statut: 'non_vu', score: 1 });
    // L'écriture est atomique : temporaire puis renommage.
    expect(existsSync(`${cheminFichierDonnees()}.tmp`)).toBe(false);
  });
});
