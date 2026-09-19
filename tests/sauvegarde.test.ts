import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSource } from '@/lib/db/demo-source';
import { enregistrerVersion, etatSauvegarde, restaurerSauvegarde } from '@/lib/pipeline/sauvegarde';
import type { Site, SiteVersion } from '@/lib/types';

// Le module de sauvegarde passe par `db`, qui est l'adaptateur démo sous
// vitest (DEMO_MODE n'est pas positionné à "true" en test, mais aucune base
// n'est configurée non plus — on travaille donc sur le store en mémoire).
vi.mock('@/lib/db', async () => {
  const { demoSource } = await import('@/lib/db/demo-source');
  return { db: demoSource };
});

async function creerSite(): Promise<Site> {
  return demoSource.insert<Site>('sites', {
    client_id: 'client-test',
    nom: 'Site de test',
    secteur: 'Boulangerie',
    statut: 'brouillon',
    url_test: null,
    url_production: null,
    version_actuelle: 0,
    version_sauvegarde: null,
    nb_pages: 5,
    options_actives: [],
    cout_generation_ia: 0,
    derniere_generation: null,
    mise_en_production_le: null,
  });
}

function contenu(libelle: string) {
  return {
    libelle,
    contenu: { pages: [{ slug: 'accueil', html: `<p>${libelle}</p>` }] },
    promptUtilise: 'test',
    modeleIa: 'test',
    coutIa: 1,
    deployUrl: `https://${libelle.toLowerCase().replace(/\s/g, '-')}.example`,
  };
}

/** Rejoue le cycle complet : enregistrement puis mise à jour du site. */
async function nouvelleVersion(site: Site, libelle: string): Promise<Site> {
  const { version, sauvegardee } = await enregistrerVersion(site, contenu(libelle));
  return (await demoSource.update<Site>('sites', site.id, {
    version_actuelle: version.version,
    version_sauvegarde: sauvegardee,
  }))!;
}

describe('sauvegarde unique par site', () => {
  beforeEach(() => {
    delete (globalThis as { __siteforgeDemo?: unknown }).__siteforgeDemo;
  });

  it('ne crée aucune sauvegarde à la première génération', async () => {
    let site = await creerSite();
    site = await nouvelleVersion(site, 'Génération initiale');

    expect(site.version_actuelle).toBe(1);
    expect(site.version_sauvegarde).toBeNull();

    const etat = await etatSauvegarde(site);
    expect(etat.courante?.libelle).toBe('Génération initiale');
    expect(etat.sauvegarde).toBeNull();
  });

  it('fait descendre la production courante en sauvegarde', async () => {
    let site = await creerSite();
    site = await nouvelleVersion(site, 'Génération initiale');
    site = await nouvelleVersion(site, 'Retouches client');

    expect(site.version_actuelle).toBe(2);
    expect(site.version_sauvegarde).toBe(1);

    const etat = await etatSauvegarde(site);
    expect(etat.courante?.libelle).toBe('Retouches client');
    expect(etat.sauvegarde?.libelle).toBe('Génération initiale');
  });

  it('ne conserve jamais plus de deux versions', async () => {
    let site = await creerSite();
    for (const libelle of ['v1', 'v2', 'v3', 'v4', 'v5']) {
      site = await nouvelleVersion(site, libelle);
    }

    const versions = await demoSource.list<SiteVersion>('site_versions', { site_id: site.id });
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([4, 5]);
    expect(site.version_actuelle).toBe(5);
    expect(site.version_sauvegarde).toBe(4);
  });

  it('restaure la sauvegarde et conserve l’état remplacé', async () => {
    let site = await creerSite();
    site = await nouvelleVersion(site, 'Génération initiale');
    site = await nouvelleVersion(site, 'Retouches client');

    const resultat = await restaurerSauvegarde(site.id);
    expect(resultat.restauree).toBe(1);
    expect(resultat.remplacee).toBe(2);
    expect(resultat.site.version_actuelle).toBe(1);
    expect(resultat.site.version_sauvegarde).toBe(2);
  });

  it('est réversible : restaurer deux fois revient au point de départ', async () => {
    let site = await creerSite();
    site = await nouvelleVersion(site, 'Génération initiale');
    site = await nouvelleVersion(site, 'Retouches client');

    await restaurerSauvegarde(site.id);
    const final = await restaurerSauvegarde(site.id);

    expect(final.site.version_actuelle).toBe(2);
    expect(final.site.version_sauvegarde).toBe(1);
  });

  it('refuse de restaurer un site sans sauvegarde', async () => {
    let site = await creerSite();
    site = await nouvelleVersion(site, 'Génération initiale');

    await expect(restaurerSauvegarde(site.id)).rejects.toThrow(/Aucune sauvegarde/);
  });

  it('refuse de restaurer un site inexistant', async () => {
    await expect(restaurerSauvegarde('site-inconnu')).rejects.toThrow(/introuvable/);
  });
});
