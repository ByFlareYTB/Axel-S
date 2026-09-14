// ---------------------------------------------------------------------------
// API Recherche d'entreprises (base SIRENE, api.gouv.fr).
// Publique, sans clé : fournit l'identité légale et le SIRET, qui sert de clé
// de déduplication dans tout le pipeline de prospection.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';
import { requeteJson } from './http';

export interface EtablissementSirene {
  raison_sociale: string;
  siret: string | null;
  siren: string | null;
  code_naf: string | null;
  activite: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  departement: string | null;
  date_creation: string | null;
  effectif: string | null;
}

interface ReponseSirene {
  results?: {
    nom_complet?: string;
    nom_raison_sociale?: string;
    siren?: string;
    activite_principale?: string;
    date_creation?: string;
    tranche_effectif_salarie?: string;
    siege?: {
      siret?: string;
      adresse?: string;
      code_postal?: string;
      libelle_commune?: string;
      departement?: string;
      activite_principale?: string;
    };
  }[];
}

export interface CritèresSirene {
  secteur?: string;
  codePostal?: string;
  departement?: string;
  limite?: number;
}

export async function rechercherEntreprises(criteres: CritèresSirene): Promise<EtablissementSirene[]> {
  const params = new URLSearchParams();
  params.set('q', criteres.secteur ?? 'artisan');
  if (criteres.codePostal) params.set('code_postal', criteres.codePostal);
  if (criteres.departement) params.set('departement', criteres.departement);
  params.set('per_page', String(Math.min(criteres.limite ?? 20, 25)));
  // On ne cible que les établissements en activité.
  params.set('etat_administratif', 'A');

  const url = `${config.sirene.url}/search?${params.toString()}`;
  const reponse = await requeteJson<ReponseSirene>('SIRENE', url, {
    headers: { accept: 'application/json' },
  });

  return (reponse.results ?? []).map((r) => ({
    raison_sociale: r.nom_complet ?? r.nom_raison_sociale ?? 'Entreprise sans nom',
    siret: r.siege?.siret ?? null,
    siren: r.siren ?? null,
    code_naf: r.siege?.activite_principale ?? r.activite_principale ?? null,
    activite: criteres.secteur ?? null,
    adresse: r.siege?.adresse ?? null,
    code_postal: r.siege?.code_postal ?? null,
    ville: r.siege?.libelle_commune ?? null,
    departement: r.siege?.departement ?? null,
    date_creation: r.date_creation ?? null,
    effectif: r.tranche_effectif_salarie ?? null,
  }));
}
