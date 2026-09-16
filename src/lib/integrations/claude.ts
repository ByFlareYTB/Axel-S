// ---------------------------------------------------------------------------
// Génération de sites vitrines par l'API Claude.
//
// Le prompt est structuré par secteur d'activité : la même mécanique produit
// un site de boulangerie ou de garage, seuls les repères métier changent.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';

/** Tarifs API en dollars par million de tokens, pour le suivi de marge. */
const TARIFS: Record<string, { entree: number; sortie: number }> = {
  'claude-opus-5': { entree: 5, sortie: 25 },
  'claude-sonnet-5': { entree: 2, sortie: 10 },
  'claude-haiku-4-5': { entree: 1, sortie: 5 },
};

const TAUX_USD_EUR = 0.92;

export interface PageGeneree {
  slug: string;
  titre: string;
  html: string;
}

export interface SiteGenere {
  nom: string;
  pages: PageGeneree[];
  palette: { primaire: string; secondaire: string; fond: string };
  meta: { titre: string; description: string; motsCles: string[] };
  /** Coût réel de la génération, en euros. */
  coutEuros: number;
  modele: string;
  /** Défauts constatés après contrôle. Vide si le site est livrable tel quel. */
  avertissements: string[];
}

export interface BriefSite {
  raisonSociale: string;
  secteur: string;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  /** Options vendues au client, qui conditionnent les sections à produire. */
  options: string[];
  nbPages: number;
  /** Retours du client lors d'une boucle de retouches. */
  retours?: string | null;
}

/** Repères métier injectés dans le prompt, par grande famille de secteur. */
const REPERES_SECTEUR: Record<string, string> = {
  boulangerie:
    'Mettre en avant les produits du jour, les horaires, les commandes spéciales et la fabrication artisanale.',
  garage:
    'Mettre en avant les prestations (révision, pneus, carrosserie), la prise de rendez-vous et les marques traitées.',
  beaute:
    'Mettre en avant la carte des soins avec tarifs, la prise de rendez-vous et l’ambiance du lieu.',
  batiment:
    'Mettre en avant les réalisations en photo, les zones d’intervention, les garanties et le devis gratuit.',
  sante:
    'Mettre en avant les motifs de consultation, les horaires, l’accès et la prise de rendez-vous. Ton sobre, aucune promesse de résultat.',
  restauration:
    'Mettre en avant la carte, les horaires de service, la réservation et les photos de plats.',
  defaut:
    'Mettre en avant les prestations, la zone d’intervention, les avis clients et un appel à l’action clair.',
};

function reperesPour(secteur: string): string {
  const s = secteur.toLowerCase();
  if (s.includes('boulang') || s.includes('pâtiss') || s.includes('patiss')) return REPERES_SECTEUR.boulangerie;
  if (s.includes('garage') || s.includes('auto')) return REPERES_SECTEUR.garage;
  if (s.includes('beaut') || s.includes('coiff') || s.includes('esthé')) return REPERES_SECTEUR.beaute;
  if (s.includes('menuis') || s.includes('maçon') || s.includes('plomb') || s.includes('électric') || s.includes('peint') || s.includes('toitur'))
    return REPERES_SECTEUR.batiment;
  if (s.includes('santé') || s.includes('ostéo') || s.includes('kiné') || s.includes('infirm')) return REPERES_SECTEUR.sante;
  if (s.includes('restaur') || s.includes('pizz') || s.includes('traiteur')) return REPERES_SECTEUR.restauration;
  return REPERES_SECTEUR.defaut;
}

/**
 * Pages attendues, dans l'ordre.
 *
 * Nommer explicitement les pages plutôt que d'annoncer un nombre : le modèle
 * sait alors exactement quoi produire, et les liens du menu peuvent être
 * imposés (`<slug>.html`), ce qui rend la navigation vérifiable.
 */
export function slugsAttendus(nbPages: number): string[] {
  const catalogue = [
    'accueil',
    'services',
    'a-propos',
    'realisations',
    'tarifs',
    'temoignages',
    'faq',
    'horaires',
    'zone-intervention',
  ];
  const total = Math.max(2, Math.min(nbPages, catalogue.length + 1));
  // « contact » ferme toujours la navigation : c'est la page qui convertit.
  return [...catalogue.slice(0, total - 1), 'contact'];
}

function promptSite(brief: BriefSite, slugs: string[]): string {
  const options = brief.options.length ? brief.options.join(', ') : 'aucune option supplémentaire';
  return [
    `Génère un site vitrine professionnel pour « ${brief.raisonSociale} », ${brief.secteur}${brief.ville ? ` à ${brief.ville}` : ''}.`,
    '',
    `Repères du secteur : ${reperesPour(brief.secteur)}`,
    `Options vendues au client : ${options}.`,
    '',
    `Produis EXACTEMENT ${slugs.length} pages, une par slug, dans cet ordre :`,
    ...slugs.map((slug) => `- ${slug}`),
    '',
    'Coordonnées à intégrer :',
    `- Téléphone : ${brief.telephone ?? 'non communiqué'}`,
    `- Email : ${brief.email ?? 'non communiqué'}`,
    `- Adresse : ${brief.adresse ?? 'non communiquée'}`,
    '',
    brief.retours ? `Retouches demandées par le client, à appliquer en priorité : ${brief.retours}` : '',
    '',
    'Contraintes :',
    `- Le tableau "pages" doit contenir ${slugs.length} entrées, avec exactement ces slugs.`,
    '- Chaque page porte le MÊME menu de navigation, avec un lien par page.',
    `- Les liens du menu pointent vers "<slug>.html" : ${slugs.map((s) => `${s}.html`).join(', ')}.`,
    '  L\'accueil se référence par "index.html".',
    '- Un lien "mentions-legales.html" dans le pied de page de chaque page ; cette page est',
    '  fournie séparément, ne la génère pas.',
    '- Ne crée AUCUN autre lien interne : tout href se terminant par .html doit figurer ci-dessus.',
    '- HTML5 sémantique complet par page, CSS en ligne dans une balise <style>, aucun script externe.',
    '- Responsive mobile-first, contraste accessible, balises meta SEO renseignées.',
    '- Formulaire de contact pointant vers /api/contact en POST.',
    '- Aucun texte de remplissage type « Lorem ipsum » : rédige un contenu crédible pour ce métier.',
    '- Aucune affirmation invérifiable (chiffres d’affaires, certifications, avis clients inventés).',
    '',
    'Réponds uniquement par un objet JSON valide, sans texte autour, au format :',
    '{"nom":"…","palette":{"primaire":"#…","secondaire":"#…","fond":"#…"},',
    '"meta":{"titre":"…","description":"…","motsCles":["…"]},',
    '"pages":[',
    '  {"slug":"accueil","titre":"…","html":"<!doctype html>…"},',
    '  {"slug":"services","titre":"…","html":"<!doctype html>…"}',
    `  … et ainsi de suite pour les ${slugs.length} pages]}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Pages manquantes et liens internes qui ne mènent nulle part. */
export interface ControleSite {
  manquantes: string[];
  liensMorts: { page: string; cible: string }[];
}

/**
 * Vérifie qu'un site est livrable.
 *
 * Un site dont le menu mène à des 404 n'est pas vendable : mieux vaut le
 * détecter ici que le découvrir devant le client.
 */
export function controlerSite(pages: PageGeneree[], slugs: string[]): ControleSite {
  const produits = new Set(pages.map((page) => page.slug));
  const autorises = new Set([...produits, 'mentions-legales', 'index']);

  const liensMorts: { page: string; cible: string }[] = [];
  for (const page of pages) {
    for (const lien of page.html.matchAll(/href\s*=\s*["']([^"']+\.html)["']/gi)) {
      const href = lien[1];
      // Un lien externe vers une page .html n'est pas de notre ressort : seuls
      // les liens internes peuvent mener à un 404 sur le site livré.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;

      const cible = href.split(/[?#]/)[0].split('/').pop()!.replace(/\.html$/i, '');
      if (cible && !autorises.has(cible)) liensMorts.push({ page: page.slug, cible });
    }
  }

  return {
    manquantes: slugs.filter((slug) => !produits.has(slug)),
    liensMorts,
  };
}

function coutEuros(modele: string, entree: number, sortie: number): number {
  const tarif = TARIFS[modele] ?? TARIFS['claude-opus-5'];
  const usd = (entree / 1_000_000) * tarif.entree + (sortie / 1_000_000) * tarif.sortie;
  return Number((usd * TAUX_USD_EUR).toFixed(4));
}

/**
 * En-têtes ajoutés à chaque appel.
 *
 * Une clé non rattachée à un workspace exige `anthropic-workspace-id`. Une clé
 * créée dans un workspace n'en a pas besoin : l'en-tête est alors omis, car
 * l'envoyer à tort provoque un refus.
 */
export function entetesAnthropic(): Record<string, string> | undefined {
  // Lu à l'appel plutôt que depuis l'instantané de `config` : la valeur reste
  // la même en production, et le comportement ne dépend pas de l'ordre des
  // imports — comme pour les prérequis d'intégration.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return workspace ? { 'anthropic-workspace-id': workspace } : undefined;
}

/**
 * Transforme une erreur de l'API en message actionnable.
 *
 * Sans cela, l'interface affiche une enveloppe JSON brute où rien n'indique
 * quoi corriger. Chaque cas fréquent renvoie ici la manipulation exacte.
 */
export function traduireErreur(err: unknown): Error {
  if (!(err instanceof Anthropic.APIError)) {
    return err instanceof Error ? err : new Error(String(err));
  }

  const message = err.message ?? '';

  if (err instanceof Anthropic.AuthenticationError) {
    return new Error(
      'Clé Anthropic refusée. Vérifiez ANTHROPIC_API_KEY dans .env.local, ' +
        'puis redémarrez l’application.',
    );
  }

  if (message.includes('not scoped to a workspace')) {
    return new Error(
      'Votre clé Anthropic n’est rattachée à aucun workspace. Deux solutions : ' +
        'créez une nouvelle clé en choisissant un workspace (console.anthropic.com → API keys), ' +
        'ou renseignez ANTHROPIC_WORKSPACE_ID dans .env.local avec l’identifiant visible dans ' +
        'l’URL de console.anthropic.com/settings/workspaces.',
    );
  }

  if (message.includes('credit balance') || message.includes('insufficient')) {
    return new Error(
      'Crédit Anthropic épuisé. Ajoutez du crédit dans console.anthropic.com → Billing, ' +
        'puis relancez la génération.',
    );
  }

  if (err instanceof Anthropic.RateLimitError) {
    return new Error(
      'Limite de débit atteinte chez Anthropic. Patientez une minute avant de relancer.',
    );
  }

  if (message.includes('model')) {
    return new Error(
      `Modèle « ${config.anthropic.model} » refusé par l’API. Vérifiez ANTHROPIC_MODEL ` +
        '(par exemple claude-opus-5 ou claude-haiku-4-5).',
    );
  }

  return new Error(`Appel à l’API Claude échoué (${err.status ?? 'sans code'}) : ${message}`);
}

/**
 * Appelle l'API Claude et renvoie le site généré.
 * La réponse est longue (plusieurs pages HTML) : on passe donc par le mode
 * streaming pour ne pas buter sur le délai d'expiration HTTP.
 */
export async function genererSite(brief: BriefSite): Promise<SiteGenere> {
  const modele = config.anthropic.model;
  const slugs = slugsAttendus(brief.nbPages);

  const premier = await appelerClaude(promptSite(brief, slugs), modele);
  let pages = premier.donnees.pages ?? [];
  let cout = premier.cout;

  let controle = controlerSite(pages, slugs);

  // Rattrapage : si des pages manquent, on ne redemande que celles-là plutôt
  // que de tout régénérer — moins long et moins cher qu'un second site complet.
  if (controle.manquantes.length > 0) {
    const reference = pages.find((page) => page.slug === 'accueil') ?? pages[0];
    const complement = await appelerClaude(
      promptComplement(brief, slugs, controle.manquantes, reference),
      modele,
    );
    cout = Number((cout + complement.cout).toFixed(4));

    const dejaPresent = new Set(pages.map((page) => page.slug));
    for (const page of complement.donnees.pages ?? []) {
      if (!dejaPresent.has(page.slug)) pages.push(page);
    }
    controle = controlerSite(pages, slugs);
  }

  // Les pages sont réordonnées selon la navigation attendue, pour que l'aperçu
  // et le déploiement présentent le site dans l'ordre du menu.
  pages = [
    ...slugs.map((slug) => pages.find((page) => page.slug === slug)).filter((p): p is PageGeneree => Boolean(p)),
    ...pages.filter((page) => !slugs.includes(page.slug)),
  ];

  return {
    nom: premier.donnees.nom,
    palette: premier.donnees.palette,
    meta: premier.donnees.meta,
    pages,
    modele,
    coutEuros: cout,
    avertissements: messagesControle(controle),
  };
}

/** Second appel, ciblé sur les seules pages absentes de la première réponse. */
function promptComplement(
  brief: BriefSite,
  slugs: string[],
  manquantes: string[],
  reference: PageGeneree | undefined,
): string {
  return [
    `Voici la page d'accueil déjà produite pour « ${brief.raisonSociale} », ${brief.secteur} :`,
    '',
    reference?.html.slice(0, 6000) ?? '(aucune page de référence)',
    '',
    `Produis maintenant EXACTEMENT les ${manquantes.length} pages manquantes : ${manquantes.join(', ')}.`,
    '',
    'Contraintes :',
    '- Reprends à l’identique la mise en page, la palette, le menu et le pied de page ci-dessus.',
    `- Le menu de chaque page contient les mêmes liens : ${slugs.map((s) => `${s}.html`).join(', ')}.`,
    '  L\'accueil se référence par "index.html".',
    '- Ne crée aucun autre lien interne.',
    '- Contenu crédible pour ce métier, aucune affirmation invérifiable.',
    '',
    'Réponds uniquement par un objet JSON valide :',
    '{"pages":[{"slug":"…","titre":"…","html":"<!doctype html>…"}]}',
  ].join('\n');
}

interface ReponseClaude {
  donnees: {
    nom: string;
    palette: SiteGenere['palette'];
    meta: SiteGenere['meta'];
    pages?: PageGeneree[];
  };
  cout: number;
}

/** Appel unitaire : streaming, extraction du JSON, coût réel. */
async function appelerClaude(prompt: string, modele: string): Promise<ReponseClaude> {
  const client = new Anthropic({
    apiKey: config.anthropic.apiKey,
    defaultHeaders: entetesAnthropic(),
  });

  let reponse: Anthropic.Message;
  try {
    const stream = client.messages.stream({
      model: modele,
      max_tokens: 64_000,
      system:
        'Tu es un développeur web spécialisé dans les sites vitrines de TPE françaises. ' +
        'Tu produis du HTML/CSS propre, sobre et performant, et tu réponds exclusivement par du JSON valide.',
      messages: [{ role: 'user', content: prompt }],
    });
    reponse = await stream.finalMessage();
  } catch (err) {
    throw traduireErreur(err);
  }

  const texte = reponse.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === 'text')
    .map((bloc) => bloc.text)
    .join('');

  const json = texte.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return {
      donnees: JSON.parse(json),
      cout: coutEuros(modele, reponse.usage.input_tokens, reponse.usage.output_tokens),
    };
  } catch {
    throw new Error(
      `Réponse de l'API non exploitable. Relancez la génération. Début de la réponse : ${texte.slice(0, 160)}`,
    );
  }
}

/** Traduit le contrôle en avertissements lisibles, ou rien si tout est bon. */
function messagesControle(controle: ControleSite): string[] {
  const messages: string[] = [];

  if (controle.manquantes.length > 0) {
    messages.push(
      `Pages non générées malgré une seconde tentative : ${controle.manquantes.join(', ')}. ` +
        'Relancez la génération, ou demandez-les via le champ de retouches.',
    );
  }

  if (controle.liensMorts.length > 0) {
    const cibles = [...new Set(controle.liensMorts.map((lien) => `${lien.cible}.html`))];
    messages.push(
      `Liens du menu sans page correspondante : ${cibles.join(', ')}. ` +
        'Demandez leur correction via le champ de retouches avant de livrer.',
    );
  }

  return messages;
}

/** Site fictif renvoyé en mode démo, sans appel réseau ni coût. */
export function genererSiteDemo(brief: BriefSite): SiteGenere {
  const slugs = slugsAttendus(brief.nbPages);
  const palette = { primaire: '#1d4ed8', secondaire: '#0f172a', fond: '#f8fafc' };

  return {
    nom: brief.raisonSociale,
    palette,
    meta: {
      titre: `${brief.raisonSociale} — ${brief.secteur}${brief.ville ? ` à ${brief.ville}` : ''}`,
      description: `${brief.secteur} ${brief.ville ? `à ${brief.ville}` : ''} : découvrez les prestations de ${brief.raisonSociale}.`,
      motsCles: [brief.secteur, brief.ville ?? '', brief.raisonSociale].filter(Boolean),
    },
    pages: slugs.map((slug) => ({
      slug,
      titre: slug.replace(/-/g, ' '),
      html:
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
        `<title>${brief.raisonSociale} — ${slug}</title></head>` +
        `<body style="font-family:system-ui;background:${palette.fond};color:${palette.secondaire}">` +
        `<h1>${brief.raisonSociale}</h1><p>Page « ${slug} » générée en mode démo.</p></body></html>`,
    })),
    modele: 'demo',
    avertissements: [],
    // Coût représentatif d'une génération réelle, pour que les marges affichées
    // en démo restent réalistes.
    coutEuros: Number((3.4 + brief.nbPages * 0.4).toFixed(4)),
  };
}
