import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSource } from '@/lib/db/demo-source';

vi.mock('@/lib/db', async () => {
  const { demoSource } = await import('@/lib/db/demo-source');
  return { db: demoSource };
});

import { GET as apercu } from '@/app/apercu/[id]/[[...page]]/route';
import type { Site } from '@/lib/types';

function requete(): Request {
  return new Request('http://localhost/apercu');
}

function parametres(id: string, page?: string[]) {
  return { params: Promise.resolve({ id, page }) };
}

async function siteAvecPages(pages: { slug: string; html: string }[]): Promise<Site> {
  const site = await demoSource.insert<Site>('sites', {
    client_id: 'client-test',
    nom: 'Garage Verdier',
    statut: 'test',
    version_actuelle: 1,
    version_sauvegarde: null,
    nb_pages: pages.length,
    options_actives: [],
    cout_generation_ia: 0.62,
  });
  await demoSource.insert('site_versions', {
    site_id: site.id,
    version: 1,
    libelle: 'Génération initiale',
    contenu: { pages },
    cout_ia: 0.62,
    cree_par: 'ia',
  });
  return site;
}

const PAGES = [
  {
    slug: 'accueil',
    html: '<!doctype html><html><head><title>Garage</title></head><body><h1>Garage Verdier</h1></body></html>',
  },
  { slug: 'services', html: '<html><body><h1>Nos services</h1></body></html>' },
];

describe('aperçu local des sites générés', () => {
  beforeEach(() => {
    delete (globalThis as { __siteforgeDemo?: unknown }).__siteforgeDemo;
  });

  it('sert la page d’accueil de la version courante', async () => {
    const site = await siteAvecPages(PAGES);
    const reponse = await apercu(requete(), parametres(site.id));

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toContain('text/html');
    expect(await reponse.text()).toContain('Garage Verdier');
  });

  it('sert une page interne demandée avec son extension', async () => {
    const site = await siteAvecPages(PAGES);
    const reponse = await apercu(requete(), parametres(site.id, ['services.html']));
    expect(await reponse.text()).toContain('Nos services');
  });

  it('neutralise le HTML généré par un sandbox', async () => {
    const site = await siteAvecPages(PAGES);
    const reponse = await apercu(requete(), parametres(site.id));

    // Sans `allow-same-origin`, une page générée ne peut ni lire les cookies de
    // session ni appeler l'API de l'application qui l'affiche.
    expect(reponse.headers.get('content-security-policy')).toBe('sandbox');
    expect(reponse.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('insère une base pour que les liens relatifs restent dans l’aperçu', async () => {
    const site = await siteAvecPages(PAGES);
    const html = await (await apercu(requete(), parametres(site.id))).text();
    expect(html).toContain(`<base href="/apercu/${site.id}/">`);
  });

  it('insère la base même sans balise head', async () => {
    const site = await siteAvecPages([{ slug: 'accueil', html: '<body><h1>Nu</h1></body>' }]);
    const html = await (await apercu(requete(), parametres(site.id))).text();
    expect(html.startsWith(`<base href="/apercu/${site.id}/">`)).toBe(true);
  });

  it('retombe sur la première page quand aucune ne s’appelle « accueil »', async () => {
    const site = await siteAvecPages([{ slug: 'presentation', html: '<h1>Présentation</h1>' }]);
    const html = await (await apercu(requete(), parametres(site.id))).text();
    expect(html).toContain('Présentation');
  });

  it('répond 404 pour une page absente de la version', async () => {
    const site = await siteAvecPages(PAGES);
    const reponse = await apercu(requete(), parametres(site.id, ['inexistante.html']));
    expect(reponse.status).toBe(404);
  });

  it('répond 404 pour un site inconnu ou jamais généré', async () => {
    expect((await apercu(requete(), parametres('site-inconnu'))).status).toBe(404);

    const vierge = await demoSource.insert<Site>('sites', {
      client_id: 'c',
      nom: 'Jamais généré',
      statut: 'brouillon',
      version_actuelle: 0,
      version_sauvegarde: null,
    });
    expect((await apercu(requete(), parametres(vierge.id))).status).toBe(404);
  });

  it('n’est jamais mis en cache', async () => {
    const site = await siteAvecPages(PAGES);
    const reponse = await apercu(requete(), parametres(site.id));
    // L'aperçu change à chaque génération : un cache le figerait.
    expect(reponse.headers.get('cache-control')).toBe('no-store');
  });
});
