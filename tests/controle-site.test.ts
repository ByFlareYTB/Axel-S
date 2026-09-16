import { describe, expect, it } from 'vitest';
import { controlerSite, slugsAttendus } from '@/lib/integrations/claude';

function page(slug: string, liens: string[] = []) {
  const menu = liens.map((lien) => `<a href="${lien}">lien</a>`).join('');
  return { slug, titre: slug, html: `<html><body><nav>${menu}</nav></body></html>` };
}

describe('pages attendues', () => {
  it('produit la liste demandée en terminant par contact', () => {
    expect(slugsAttendus(5)).toEqual([
      'accueil',
      'services',
      'a-propos',
      'realisations',
      'contact',
    ]);
  });

  it('commence toujours par accueil et finit toujours par contact', () => {
    for (const nb of [2, 3, 4, 5, 8, 12]) {
      const slugs = slugsAttendus(nb);
      expect(slugs[0]).toBe('accueil');
      expect(slugs.at(-1)).toBe('contact');
      // Aucun doublon : chaque page du menu est unique.
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('ne descend jamais sous deux pages', () => {
    expect(slugsAttendus(0)).toHaveLength(2);
    expect(slugsAttendus(1)).toHaveLength(2);
  });

  it('plafonne au catalogue disponible plutôt que d’inventer des slugs', () => {
    expect(slugsAttendus(50).length).toBeLessThanOrEqual(10);
  });
});

describe('contrôle d’un site généré', () => {
  const SLUGS = ['accueil', 'services', 'contact'];

  it('ne signale rien quand tout est produit et lié', () => {
    const pages = SLUGS.map((slug) => page(slug, ['index.html', 'services.html', 'contact.html']));
    expect(controlerSite(pages, SLUGS)).toEqual({ manquantes: [], liensMorts: [] });
  });

  it('détecte les pages absentes — le défaut qui rend un site invendable', () => {
    const controle = controlerSite([page('accueil')], SLUGS);
    expect(controle.manquantes).toEqual(['services', 'contact']);
  });

  it('détecte un lien de menu sans page correspondante', () => {
    const pages = [page('accueil', ['services.html', 'blog.html']), page('services'), page('contact')];
    const controle = controlerSite(pages, SLUGS);
    expect(controle.liensMorts).toEqual([{ page: 'accueil', cible: 'blog' }]);
  });

  it('accepte index.html comme alias de l’accueil', () => {
    const pages = SLUGS.map((slug) => page(slug, ['index.html']));
    expect(controlerSite(pages, SLUGS).liensMorts).toEqual([]);
  });

  it('accepte les mentions légales, fournies hors génération', () => {
    const pages = SLUGS.map((slug) => page(slug, ['mentions-legales.html']));
    expect(controlerSite(pages, SLUGS).liensMorts).toEqual([]);
  });

  it('ignore les liens externes et les ancres', () => {
    const pages = [
      {
        slug: 'accueil',
        titre: 'Accueil',
        html: '<a href="https://exemple.fr/page.html">externe</a><a href="#ancre">ancre</a><a href="tel:0247000000">tel</a>',
      },
      page('services'),
      page('contact'),
    ];
    expect(controlerSite(pages, SLUGS).liensMorts).toEqual([]);
  });

  it('résout un lien écrit avec un chemin relatif', () => {
    const pages = [page('accueil', ['./services.html', '/contact.html']), page('services'), page('contact')];
    expect(controlerSite(pages, SLUGS).liensMorts).toEqual([]);
  });

  it('repère les liens morts sur toutes les pages, pas seulement l’accueil', () => {
    const pages = [page('accueil'), page('services', ['tarifs.html']), page('contact')];
    const controle = controlerSite(pages, SLUGS);
    expect(controle.liensMorts).toEqual([{ page: 'services', cible: 'tarifs' }]);
  });
});
