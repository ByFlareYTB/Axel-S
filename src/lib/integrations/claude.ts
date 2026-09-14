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

function promptSite(brief: BriefSite): string {
  const options = brief.options.length ? brief.options.join(', ') : 'aucune option supplémentaire';
  return [
    `Génère un site vitrine professionnel pour « ${brief.raisonSociale} », ${brief.secteur}${brief.ville ? ` à ${brief.ville}` : ''}.`,
    '',
    `Repères du secteur : ${reperesPour(brief.secteur)}`,
    `Options vendues au client : ${options}.`,
    `Nombre de pages attendu : ${brief.nbPages}.`,
    '',
    'Coordonnées à intégrer :',
    `- Téléphone : ${brief.telephone ?? 'non communiqué'}`,
    `- Email : ${brief.email ?? 'non communiqué'}`,
    `- Adresse : ${brief.adresse ?? 'non communiquée'}`,
    '',
    brief.retours ? `Retouches demandées par le client, à appliquer en priorité : ${brief.retours}` : '',
    '',
    'Contraintes :',
    '- HTML5 sémantique complet par page, CSS en ligne dans une balise <style>, aucun script externe.',
    '- Responsive mobile-first, contraste accessible, balises meta SEO renseignées.',
    '- Formulaire de contact pointant vers /api/contact en POST.',
    '- Aucun texte de remplissage type « Lorem ipsum » : rédige un contenu crédible pour ce métier.',
    '- Aucune affirmation invérifiable (chiffres d’affaires, certifications, avis clients inventés).',
    '',
    'Réponds uniquement par un objet JSON valide, sans texte autour, au format :',
    '{"nom":"…","palette":{"primaire":"#…","secondaire":"#…","fond":"#…"},',
    '"meta":{"titre":"…","description":"…","motsCles":["…"]},',
    '"pages":[{"slug":"accueil","titre":"…","html":"<!doctype html>…"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

function coutEuros(modele: string, entree: number, sortie: number): number {
  const tarif = TARIFS[modele] ?? TARIFS['claude-opus-5'];
  const usd = (entree / 1_000_000) * tarif.entree + (sortie / 1_000_000) * tarif.sortie;
  return Number((usd * TAUX_USD_EUR).toFixed(4));
}

/**
 * Appelle l'API Claude et renvoie le site généré.
 * La réponse est longue (plusieurs pages HTML) : on passe donc par le mode
 * streaming pour ne pas buter sur le délai d'expiration HTTP.
 */
export async function genererSite(brief: BriefSite): Promise<SiteGenere> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const modele = config.anthropic.model;

  const stream = client.messages.stream({
    model: modele,
    max_tokens: 64_000,
    system:
      'Tu es un développeur web spécialisé dans les sites vitrines de TPE françaises. ' +
      'Tu produis du HTML/CSS propre, sobre et performant, et tu réponds exclusivement par du JSON valide.',
    messages: [{ role: 'user', content: promptSite(brief) }],
  });

  const reponse = await stream.finalMessage();

  const texte = reponse.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === 'text')
    .map((bloc) => bloc.text)
    .join('');

  const json = texte.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parse: Omit<SiteGenere, 'coutEuros' | 'modele'>;
  try {
    parse = JSON.parse(json);
  } catch {
    throw new Error(`Réponse Claude non parsable : ${texte.slice(0, 200)}`);
  }

  return {
    ...parse,
    modele,
    coutEuros: coutEuros(modele, reponse.usage.input_tokens, reponse.usage.output_tokens),
  };
}

/** Site fictif renvoyé en mode démo, sans appel réseau ni coût. */
export function genererSiteDemo(brief: BriefSite): SiteGenere {
  const slugs = ['accueil', 'services', 'a-propos', 'galerie', 'contact'].slice(0, Math.max(3, brief.nbPages));
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
    // Coût représentatif d'une génération réelle, pour que les marges affichées
    // en démo restent réalistes.
    coutEuros: Number((3.4 + brief.nbPages * 0.4).toFixed(4)),
  };
}
