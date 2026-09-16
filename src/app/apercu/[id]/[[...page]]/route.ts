import { erreur, erreurInterne } from '@/lib/api';
import { db } from '@/lib/db';
import type { Site, SiteVersion } from '@/lib/types';

interface PageGeneree {
  slug: string;
  titre?: string;
  html: string;
}

/**
 * Aperçu local d'un site généré.
 *
 * Toujours disponible, même sans hébergement configuré : voir ce que l'IA a
 * produit ne doit pas dépendre d'un compte Vercel. C'est aussi la façon de
 * relire un site avant de décider de le déployer.
 *
 * Le HTML servi est produit par l'IA. Il est donc rendu sous `sandbox`, ce qui
 * neutralise scripts et accès à l'origine : une page générée ne peut pas agir
 * sur l'application qui l'affiche.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string; page?: string[] }> },
) {
  try {
    const { id, page } = await params;

    const site = await db.get<Site>('sites', id);
    if (!site) return erreur('Site introuvable.', 404);

    const version = await db.findOne<SiteVersion>('site_versions', {
      site_id: id,
      version: site.version_actuelle,
    });
    if (!version) return erreur("Ce site n'a pas encore été généré.", 404);

    const contenu = version.contenu as { pages?: PageGeneree[] };
    const pages = contenu.pages ?? [];
    if (pages.length === 0) return erreur('Cette version ne contient aucune page.', 404);

    // `/apercu/<id>/` sert l'accueil ; `/apercu/<id>/services.html` la page voulue.
    const demande = page?.join('/') ?? '';
    const slug = demande.replace(/\.html$/, '');
    const cible = slug
      ? pages.find((p) => p.slug === slug)
      : (pages.find((p) => p.slug === 'accueil') ?? pages[0]);

    if (!cible) return erreur(`Page « ${slug} » introuvable dans cette version.`, 404);

    return new Response(avecBase(cible.html, `/apercu/${id}/`), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Le sandbox est la protection essentielle : sans `allow-same-origin`,
        // la page ne peut ni lire les cookies de session ni appeler l'API.
        'content-security-policy': 'sandbox',
        'x-content-type-options': 'nosniff',
        // Un aperçu ne doit jamais être mis en cache : il change à chaque
        // génération.
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return erreurInterne(err);
  }
}

/**
 * Insère une balise `<base>` pour que les liens relatifs entre pages
 * (`services.html`) pointent vers l'aperçu et non vers la racine de l'app.
 */
function avecBase(html: string, base: string): string {
  const baliseBase = `<base href="${base}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (ouverture) => `${ouverture}${baliseBase}`);
  }
  return `${baliseBase}${html}`;
}
