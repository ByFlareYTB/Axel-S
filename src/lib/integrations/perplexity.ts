// ---------------------------------------------------------------------------
// API Perplexity (Sonar) : enrichissement web des prospects issus de SIRENE
// (présence en ligne, obsolescence du site, coordonnées publiques) et veille
// tarifaire sur la concurrence locale.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';
import { requeteJson } from './http';

const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

interface ReponsePerplexity {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

export interface ResultatPerplexity<T> {
  donnees: T;
  modele: string;
  coutEstime: number;
  brut: string;
}

/** Tarif Sonar approximatif, utilisé pour le suivi des coûts par recherche. */
const COUT_PAR_1K_TOKENS = 0.001;

async function interroger<T>(prompt: string, schemaIndice: string): Promise<ResultatPerplexity<T>> {
  const reponse = await requeteJson<ReponsePerplexity>('Perplexity', ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.perplexity.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.perplexity.model,
      messages: [
        {
          role: 'system',
          content:
            'Tu es un assistant de prospection B2B. Tu réponds exclusivement par du JSON valide, ' +
            `sans texte autour, au format suivant : ${schemaIndice}`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  const contenu = reponse.choices?.[0]?.message?.content ?? '';
  const tokens = reponse.usage?.total_tokens ?? 0;

  // Le modèle encadre parfois le JSON par des balises de code.
  const json = contenu.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let donnees: T;
  try {
    donnees = JSON.parse(json) as T;
  } catch {
    throw new Error(`Réponse Perplexity non parsable : ${contenu.slice(0, 200)}`);
  }

  return {
    donnees,
    modele: config.perplexity.model,
    coutEstime: Number(((tokens / 1000) * COUT_PAR_1K_TOKENS).toFixed(4)),
    brut: contenu,
  };
}

export interface EnrichissementProspect {
  raison_sociale: string;
  site_web: string | null;
  site_obsolete: boolean;
  email: string | null;
  telephone: string | null;
  commentaire: string | null;
}

/** Complète une liste d'entreprises SIRENE avec leur présence en ligne. */
export async function enrichirProspects(
  entreprises: { raison_sociale: string; ville: string | null }[],
  secteur: string,
): Promise<ResultatPerplexity<EnrichissementProspect[]>> {
  const liste = entreprises
    .map((e, i) => `${i + 1}. ${e.raison_sociale}${e.ville ? ` (${e.ville})` : ''}`)
    .join('\n');

  return interroger<EnrichissementProspect[]>(
    `Pour chacune de ces entreprises du secteur « ${secteur} », indique si elle possède un site web ` +
      `professionnel, si ce site paraît obsolète (non responsive, non mis à jour depuis plusieurs années), ` +
      `ainsi que son email et son téléphone publics si tu les trouves.\n\n${liste}`,
    '[{"raison_sociale":"…","site_web":null,"site_obsolete":false,"email":null,"telephone":null,"commentaire":"…"}]',
  );
}

export interface VeilleTarifaire {
  prix_min: number | null;
  prix_max: number | null;
  source: string | null;
  commentaire: string | null;
}

/** Comparateur concurrentiel interne : prix pratiqués localement. */
export async function veilleTarifaire(zone: string): Promise<ResultatPerplexity<VeilleTarifaire>> {
  return interroger<VeilleTarifaire>(
    `Quels sont les prix pratiqués en ${zone} pour la création d'un site vitrine professionnel ` +
      `de 5 pages par une agence ou un freelance ? Donne une fourchette basse et haute en euros.`,
    '{"prix_min":0,"prix_max":0,"source":"…","commentaire":"…"}',
  );
}
