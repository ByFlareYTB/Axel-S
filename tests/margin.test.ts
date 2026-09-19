import { describe, expect, it } from 'vitest';
import { calculerTarification } from '@/lib/pricing/engine';
import { SEUILS_DEFAUT, analyserMarge, comparerAuMarche } from '@/lib/pricing/margin';
import { PRICING_RULES_DEFAUT } from '@/lib/demo/pricing-seed';
import type { PricingRule } from '@/lib/types';

const REGLES: PricingRule[] = PRICING_RULES_DEFAUT.map((r, i) => ({ id: `regle-${i}`, ...r }));

function tarifer(options: { code: string; quantite?: number }[], coutAds = 0) {
  return calculerTarification({ options, coutAcquisitionAds: coutAds }, REGLES);
}

describe('calculateur de marge', () => {
  it('déduit le coût IA et le coût d’acquisition de la prestation initiale', () => {
    const marge = analyserMarge(tarifer([{ code: 'base_site_essentiel' }], 20));
    // 249 € − 4,50 € d'IA − 20 € d'Ads
    expect(marge.margeOneshot).toBeCloseTo(224.5, 2);
    expect(marge.margeOneshotPct).toBeCloseTo(90.16, 1);
  });

  it('déduit le coût d’hébergement réel de l’abonnement', () => {
    const marge = analyserMarge(tarifer([{ code: 'abo_hebergement' }]));
    expect(marge.margeMensuelle).toBeCloseTo(18.55, 2);
  });

  it('cumule prestation et 12 mensualités dans la marge annuelle', () => {
    const tarif = tarifer([{ code: 'base_site_essentiel' }, { code: 'abo_hebergement' }]);
    const marge = analyserMarge(tarif);
    expect(marge.margeAnnuelle).toBeCloseTo(marge.margeOneshot + marge.margeMensuelle * 12, 2);
  });

  it('retire la recette des mois offerts tout en gardant leur coût', () => {
    const avecOffre = calculerTarification(
      { options: [{ code: 'abo_hebergement' }] },
      REGLES,
      [
        {
          id: 'p',
          code: 'PREMIERMOIS',
          libelle: '1er mois offert',
          type_remise: 'mois_offerts',
          valeur: 1,
          duree_mois: 1,
          actif: true,
          date_debut: null,
          date_fin: null,
        },
      ],
    );
    const marge = analyserMarge({ ...avecOffre, promo: avecOffre.promo, moisOfferts: 1 });
    const sansOffre = analyserMarge(tarifer([{ code: 'abo_hebergement' }]));
    expect(marge.margeAnnuelle).toBeLessThan(sansOffre.margeAnnuelle);
  });

  it('alerte quand la marge du one-shot passe sous le seuil', () => {
    // Un coût d'acquisition Ads démesuré fait chuter la marge sous 70 %.
    const marge = analyserMarge(tarifer([{ code: 'base_site_essentiel' }], 120));
    expect(marge.alerte).toBe(true);
    expect(marge.alertes[0]).toContain('prestation initiale');
  });

  it('alerte quand la marge mensuelle passe sous le plancher en euros', () => {
    const reglesChères = REGLES.map((r) =>
      r.code === 'abo_hebergement' ? { ...r, cout_hebergement_mensuel: 10 } : r,
    );
    const tarif = calculerTarification({ options: [{ code: 'abo_hebergement' }] }, reglesChères);
    const marge = analyserMarge(tarif, SEUILS_DEFAUT);
    expect(marge.margeMensuelle).toBe(9);
    expect(marge.alerte).toBe(true);
  });

  it('signale une vente à perte', () => {
    const marge = analyserMarge(tarifer([{ code: 'base_site_essentiel' }], 400));
    expect(marge.margeOneshot).toBeLessThan(0);
    expect(marge.alertes).toContain('La prestation initiale est vendue à perte.');
  });

  it('ne déclenche aucune alerte sur une sélection vide', () => {
    expect(analyserMarge(tarifer([])).alerte).toBe(false);
  });
});

describe('comparateur concurrentiel', () => {
  it('exprime l’écart de prix en facteur', () => {
    const resultat = comparerAuMarche(249, 900, 4200);
    expect(resultat.facteurMin).toBeCloseTo(3.61, 2);
    expect(resultat.facteurMax).toBeCloseTo(16.87, 2);
    expect(resultat.argumentaire).toContain('moins cher');
  });

  it('reste silencieux sans relevé de concurrence', () => {
    expect(comparerAuMarche(249, null, null).argumentaire).toBeNull();
  });
});
