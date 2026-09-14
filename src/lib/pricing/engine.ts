// ---------------------------------------------------------------------------
// Moteur de tarification hybride : base fixe + options modulables.
//
// Toutes les valeurs viennent de la table `pricing_rules`, jamais du code :
// ajuster la grille (test de prix, promotion, remise fidélité) ne demande
// aucun redéploiement.
// ---------------------------------------------------------------------------

import type { LigneDevis, OffrePromo, PricingRule } from '@/lib/types';

/** Une option choisie dans le configurateur : un code + une quantité. */
export interface SelectionOption {
  code: string;
  quantite?: number;
}

export interface EntreeDevis {
  options: SelectionOption[];
  /** Code d'une offre de lancement, facultatif. */
  promoCode?: string | null;
  /** Coût publicitaire d'acquisition imputé à ce client, en euros. */
  coutAcquisitionAds?: number;
}

export interface Tarification {
  lignes: LigneDevis[];
  /** Prestation initiale : base + options, avant remise. */
  totalOneshotBrut: number;
  /** Prestation initiale après remise promotionnelle. */
  totalOneshot: number;
  /** Abonnement mensuel après remise promotionnelle. */
  totalMensuel: number;
  totalMensuelBrut: number;
  remiseOneshot: number;
  remiseMensuelle: number;
  /** Nombre de mois offerts sur l'abonnement. */
  moisOfferts: number;
  promo: OffrePromo | null;
  /** Coût de production estimé de la prestation initiale. */
  coutIa: number;
  /** Coût d'hébergement mensuel estimé. */
  coutHebergementMensuel: number;
  coutAcquisitionAds: number;
}

function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

/**
 * Transforme une sélection d'options en lignes de devis figées.
 * Les codes inconnus ou les règles inactives sont ignorés silencieusement :
 * une grille qui évolue ne doit jamais faire échouer un devis en cours.
 */
export function construireLignes(options: SelectionOption[], regles: PricingRule[]): LigneDevis[] {
  const parCode = new Map(regles.filter((r) => r.actif).map((r) => [r.code, r]));
  const lignes: LigneDevis[] = [];

  for (const option of options) {
    const regle = parCode.get(option.code);
    if (!regle) continue;
    const quantite = regle.quantifiable ? Math.max(1, Math.floor(option.quantite ?? 1)) : 1;
    lignes.push({
      code: regle.code,
      nom: regle.nom,
      type: regle.type,
      prix_unitaire: regle.prix,
      quantite,
      total: arrondi(regle.prix * quantite),
    });
  }

  // Ordre d'affichage : base, options, puis abonnement.
  const rang = { base: 0, option: 1, abonnement: 2 } as const;
  return lignes.sort((a, b) => rang[a.type] - rang[b.type]);
}

/** Vérifie qu'une offre promotionnelle est active à la date donnée. */
export function promoApplicable(promo: OffrePromo, date = new Date()): boolean {
  if (!promo.actif) return false;
  const jour = date.toISOString().slice(0, 10);
  if (promo.date_debut && jour < promo.date_debut) return false;
  if (promo.date_fin && jour > promo.date_fin) return false;
  return true;
}

/**
 * Calcule la tarification complète d'une sélection.
 * C'est la seule fonction autorisée à produire un total : le configurateur de
 * devis, l'API et le pipeline automatique passent tous par elle, ce qui garantit
 * qu'un devis affiché et un devis enregistré donnent le même prix.
 */
export function calculerTarification(
  entree: EntreeDevis,
  regles: PricingRule[],
  promos: OffrePromo[] = [],
): Tarification {
  const lignes = construireLignes(entree.options, regles);
  const parCode = new Map(regles.map((r) => [r.code, r]));

  const lignesOneshot = lignes.filter((l) => l.type !== 'abonnement');
  const lignesAbo = lignes.filter((l) => l.type === 'abonnement');

  const totalOneshotBrut = arrondi(lignesOneshot.reduce((s, l) => s + l.total, 0));
  const totalMensuelBrut = arrondi(lignesAbo.reduce((s, l) => s + l.total, 0));

  const promo =
    promos.find((p) => p.code === entree.promoCode && promoApplicable(p)) ?? null;

  let remiseOneshot = 0;
  let remiseMensuelle = 0;
  let moisOfferts = 0;

  if (promo) {
    if (promo.type_remise === 'pourcentage_oneshot') {
      remiseOneshot = arrondi((totalOneshotBrut * promo.valeur) / 100);
    } else if (promo.type_remise === 'pourcentage_abonnement') {
      remiseMensuelle = arrondi((totalMensuelBrut * promo.valeur) / 100);
    } else if (promo.type_remise === 'mois_offerts') {
      moisOfferts = Math.max(0, Math.floor(promo.valeur));
    }
  }

  // Coûts de production : IA sur la prestation initiale, hébergement au mois.
  const coutIa = arrondi(
    lignesOneshot.reduce((s, l) => s + (parCode.get(l.code)?.cout_ia_estime ?? 0) * l.quantite, 0),
  );
  const coutHebergementMensuel = arrondi(
    lignes.reduce((s, l) => s + (parCode.get(l.code)?.cout_hebergement_mensuel ?? 0) * l.quantite, 0),
  );

  return {
    lignes,
    totalOneshotBrut,
    totalOneshot: arrondi(totalOneshotBrut - remiseOneshot),
    totalMensuelBrut,
    totalMensuel: arrondi(totalMensuelBrut - remiseMensuelle),
    remiseOneshot,
    remiseMensuelle,
    moisOfferts,
    promo,
    coutIa,
    coutHebergementMensuel,
    coutAcquisitionAds: arrondi(entree.coutAcquisitionAds ?? 0),
  };
}

/**
 * Sélection par défaut d'un site : la base seule.
 * Les pages au-delà des 5 incluses sont facturées à l'unité.
 */
export function selectionDepuisSite(nbPages: number, optionsActives: string[]): SelectionOption[] {
  const selection: SelectionOption[] = [{ code: 'base_site_essentiel' }];
  const pagesSupplementaires = Math.max(0, nbPages - 5);
  if (pagesSupplementaires > 0) {
    selection.push({ code: 'page_supplementaire', quantite: pagesSupplementaires });
  }
  for (const code of optionsActives) {
    if (code === 'page_supplementaire' || code === 'base_site_essentiel') continue;
    selection.push({ code });
  }
  selection.push({ code: 'abo_hebergement' });
  return selection;
}
