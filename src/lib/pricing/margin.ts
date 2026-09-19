// ---------------------------------------------------------------------------
// Calculateur de marge en temps réel.
//
// Marge one-shot   = prix facturé − coût API IA − coût d'acquisition Ads
// Marge mensuelle  = abonnement facturé − coût d'hébergement réel
//
// Deux seuils d'alerte, réglables dans Paramètres :
//   · marge_min_oneshot_pct     (défaut 70 %)
//   · marge_min_abonnement_eur  (défaut 12 €)
// ---------------------------------------------------------------------------

import type { Tarification } from './engine';

export interface SeuilsMarge {
  /** Pourcentage minimum de marge sur la prestation initiale. */
  oneshotPct: number;
  /** Marge nette mensuelle minimale, en euros. */
  abonnementEur: number;
}

export const SEUILS_DEFAUT: SeuilsMarge = { oneshotPct: 70, abonnementEur: 12 };

export interface AnalyseMarge {
  margeOneshot: number;
  margeOneshotPct: number;
  margeMensuelle: number;
  margeMensuellePct: number;
  /** Marge cumulée sur 12 mois : prestation initiale + 12 mensualités. */
  margeAnnuelle: number;
  coutTotalOneshot: number;
  alerte: boolean;
  alertes: string[];
}

function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

export function analyserMarge(
  tarif: Tarification,
  seuils: SeuilsMarge = SEUILS_DEFAUT,
): AnalyseMarge {
  const coutTotalOneshot = arrondi(tarif.coutIa + tarif.coutAcquisitionAds);
  const margeOneshot = arrondi(tarif.totalOneshot - coutTotalOneshot);
  const margeOneshotPct =
    tarif.totalOneshot > 0 ? arrondi((margeOneshot / tarif.totalOneshot) * 100) : 0;

  const margeMensuelle = arrondi(tarif.totalMensuel - tarif.coutHebergementMensuel);
  const margeMensuellePct =
    tarif.totalMensuel > 0 ? arrondi((margeMensuelle / tarif.totalMensuel) * 100) : 0;

  // Les mois offerts coûtent l'hébergement sans recette : on les déduit.
  const moisFactures = Math.max(0, 12 - tarif.moisOfferts);
  const margeAnnuelle = arrondi(
    margeOneshot +
      margeMensuelle * moisFactures -
      tarif.coutHebergementMensuel * tarif.moisOfferts,
  );

  const alertes: string[] = [];
  if (tarif.totalOneshot > 0 && margeOneshotPct < seuils.oneshotPct) {
    alertes.push(
      `Marge de ${margeOneshotPct.toFixed(1)} % sur la prestation initiale, sous le seuil de ${seuils.oneshotPct} %.`,
    );
  }
  if (tarif.totalMensuel > 0 && margeMensuelle < seuils.abonnementEur) {
    alertes.push(
      `Marge mensuelle de ${margeMensuelle.toFixed(2)} €, sous le seuil de ${seuils.abonnementEur} €.`,
    );
  }
  if (margeOneshot < 0) {
    alertes.push('La prestation initiale est vendue à perte.');
  }

  return {
    margeOneshot,
    margeOneshotPct,
    margeMensuelle,
    margeMensuellePct,
    margeAnnuelle,
    coutTotalOneshot,
    alerte: alertes.length > 0,
    alertes,
  };
}

/**
 * Argumentaire commercial dérivé du comparateur concurrentiel interne.
 * Renvoie le facteur d'écart avec les prix relevés chez la concurrence locale.
 */
export function comparerAuMarche(
  prixPropose: number,
  concurrenceMin: number | null,
  concurrenceMax: number | null,
): { facteurMin: number | null; facteurMax: number | null; argumentaire: string | null } {
  if (!prixPropose || (!concurrenceMin && !concurrenceMax)) {
    return { facteurMin: null, facteurMax: null, argumentaire: null };
  }
  const facteurMin = concurrenceMin ? arrondi(concurrenceMin / prixPropose) : null;
  const facteurMax = concurrenceMax ? arrondi(concurrenceMax / prixPropose) : null;

  if (!facteurMin && !facteurMax) return { facteurMin, facteurMax, argumentaire: null };
  const bas = facteurMin ?? facteurMax!;
  const haut = facteurMax ?? facteurMin!;
  const argumentaire =
    bas === haut
      ? `${bas.toFixed(1)} fois moins cher que les offres relevées localement, site en ligne en quelques jours.`
      : `${bas.toFixed(1)} à ${haut.toFixed(1)} fois moins cher que les offres relevées localement, site en ligne en quelques jours.`;

  return { facteurMin, facteurMax, argumentaire };
}
