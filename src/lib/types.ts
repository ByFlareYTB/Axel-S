// ---------------------------------------------------------------------------
// Types métier partagés entre le serveur, les API routes et l'UI.
// Ils reflètent 1:1 le schéma SQL de supabase/migrations.
// ---------------------------------------------------------------------------

export type ProspectStatut = 'non_vu' | 'en_attente' | 'client' | 'refuse';
export type SiteStatut = 'brouillon' | 'test' | 'production' | 'maintenance' | 'hors_ligne';
export type ValidationStatut = 'envoyee' | 'approuvee' | 'modifications_demandees' | 'expiree';
export type PricingType = 'base' | 'option' | 'abonnement';
export type DevisStatut = 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire';
export type FactureStatut = 'brouillon' | 'emise' | 'payee' | 'impayee' | 'annulee';
export type AbonnementStatut = 'actif' | 'en_echec' | 'suspendu' | 'annule';

/** Workflow de prospection à 4 emojis. */
export const PROSPECT_STATUTS: Record<ProspectStatut, { emoji: string; label: string }> = {
  non_vu: { emoji: '🕐', label: 'Non vu' },
  en_attente: { emoji: '⏳', label: 'En attente' },
  client: { emoji: '✅', label: 'Client' },
  refuse: { emoji: '❌', label: 'Refusé' },
};

export interface Prospect {
  id: string;
  raison_sociale: string;
  siret: string | null;
  siren: string | null;
  secteur: string | null;
  code_naf: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  departement: string | null;
  email: string | null;
  telephone: string | null;
  site_web_existant: string | null;
  site_obsolete: boolean;
  score: number;
  statut: ProspectStatut;
  prix_concurrence_min: number | null;
  prix_concurrence_max: number | null;
  source_concurrence: string | null;
  source: string;
  notes_ia: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectHistory {
  id: string;
  siret: string;
  raison_sociale: string | null;
  canal: string;
  dernier_statut: ProspectStatut;
  premier_contact: string;
  dernier_contact: string;
  nb_contacts: number;
}

export interface Client {
  id: string;
  prospect_id: string | null;
  raison_sociale: string;
  contact_nom: string | null;
  email: string;
  telephone: string | null;
  siret: string | null;
  secteur: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  client_id: string | null;
  prospect_id: string | null;
  auteur: string;
  contenu: string;
  created_at: string;
}

export interface Site {
  id: string;
  client_id: string;
  nom: string;
  secteur: string | null;
  statut: SiteStatut;
  url_test: string | null;
  url_production: string | null;
  version_actuelle: number;
  nb_pages: number;
  options_actives: string[];
  cout_generation_ia: number;
  derniere_generation: string | null;
  mise_en_production_le: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteVersion {
  id: string;
  site_id: string;
  version: number;
  libelle: string | null;
  contenu: Record<string, unknown>;
  prompt_utilise: string | null;
  modele_ia: string | null;
  cout_ia: number;
  deploy_url: string | null;
  cree_par: string;
  created_at: string;
}

export interface ValidationClient {
  id: string;
  site_id: string;
  version: number;
  token: string;
  statut: ValidationStatut;
  commentaire: string | null;
  envoye_le: string;
  repondu_le: string | null;
  expire_le: string;
}

export interface HostingInstance {
  id: string;
  site_id: string;
  plateforme: string;
  projet_externe_id: string | null;
  domaine: string | null;
  sous_domaine: string | null;
  statut_ssl: string;
  dns_configure: boolean;
  cout_mensuel_reel: number;
  prix_facture_mensuel: number;
  derniere_verification: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingRule {
  id: string;
  code: string;
  nom: string;
  type: PricingType;
  prix: number;
  unite: string;
  quantifiable: boolean;
  description: string | null;
  cout_ia_estime: number;
  cout_hebergement_mensuel: number;
  actif: boolean;
  ordre: number;
}

export interface OffrePromo {
  id: string;
  code: string;
  libelle: string;
  type_remise: 'pourcentage_oneshot' | 'pourcentage_abonnement' | 'mois_offerts';
  valeur: number;
  duree_mois: number;
  actif: boolean;
  date_debut: string | null;
  date_fin: string | null;
}

/** Ligne figée d'un devis : le prix est copié, jamais recalculé a posteriori. */
export interface LigneDevis {
  code: string;
  nom: string;
  type: PricingType;
  prix_unitaire: number;
  quantite: number;
  total: number;
}

export interface Devis {
  id: string;
  numero: string;
  client_id: string;
  site_id: string | null;
  options_selectionnees: LigneDevis[];
  promo_code: string | null;
  total_oneshot: number;
  total_mensuel: number;
  remise: number;
  total: number;
  cout_ia_estime: number;
  cout_hebergement_estime: number;
  cout_acquisition_ads: number;
  marge_oneshot: number;
  marge_oneshot_pct: number;
  marge_mensuelle: number;
  alerte_marge: boolean;
  statut: DevisStatut;
  pdf_url: string | null;
  envoye_le: string | null;
  accepte_le: string | null;
  valide_jusqu_au: string | null;
  created_at: string;
  updated_at: string;
}

export interface Facture {
  id: string;
  numero: string;
  devis_id: string | null;
  client_id: string;
  abonnement_id: string | null;
  lignes: LigneDevis[];
  total_ht: number;
  tva: number;
  total_ttc: number;
  statut_paiement: FactureStatut;
  moyen_paiement: string | null;
  stripe_payment_intent: string | null;
  date: string;
  date_echeance: string | null;
  date_paiement: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Abonnement {
  id: string;
  client_id: string;
  site_id: string | null;
  pricing_rule_code: string;
  prix_mensuel: number;
  promo_code: string | null;
  statut: AbonnementStatut;
  statut_stripe: string | null;
  stripe_subscription_id: string | null;
  prochaine_echeance: string | null;
  echecs_paiement: number;
  suspendu_le: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampagneAds {
  id: string;
  plateforme: string;
  nom: string;
  statut: string;
  budget: number;
  depense: number;
  leads: number;
  conversions: number;
  revenus_attribues: number;
  date_debut: string | null;
  date_fin: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailEnvoye {
  id: string;
  prospect_id: string | null;
  client_id: string | null;
  destinataire: string;
  sujet: string;
  gabarit: string | null;
  statut: string;
  ouvert: boolean;
  clique: boolean;
  token_desinscription: string;
  provider_id: string | null;
  envoye_le: string;
}

export interface UnsubscribedEmail {
  email: string;
  motif: string | null;
  source: string;
  desinscrit_le: string;
}

export interface RecherchePerplexity {
  id: string;
  requete: string;
  secteur: string | null;
  zone: string | null;
  modele: string | null;
  nb_resultats: number;
  cout_estime: number;
  created_at: string;
}

export interface HistoriquePrix {
  id: string;
  client_id: string;
  devis_id: string | null;
  pricing_code: string;
  libelle: string;
  prix_applique: number;
  prix_grille: number;
  quantite: number;
  motif: string | null;
  applique_le: string;
}

export interface Parametre {
  cle: string;
  valeur: string;
  description: string | null;
}
