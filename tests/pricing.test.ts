import { describe, expect, it } from 'vitest';
import { calculerTarification, construireLignes, promoApplicable, selectionDepuisSite } from '@/lib/pricing/engine';
import { OFFRES_PROMO_DEFAUT, PRICING_RULES_DEFAUT } from '@/lib/demo/pricing-seed';
import type { OffrePromo, PricingRule } from '@/lib/types';

const REGLES: PricingRule[] = PRICING_RULES_DEFAUT.map((r, i) => ({ id: `regle-${i}`, ...r }));
const PROMOS: OffrePromo[] = OFFRES_PROMO_DEFAUT.map((p, i) => ({ id: `promo-${i}`, ...p, actif: true }));

describe('moteur de tarification', () => {
  it('additionne la base et les options en séparant l’abonnement', () => {
    const tarif = calculerTarification(
      {
        options: [
          { code: 'base_site_essentiel' },
          { code: 'module_reservation' },
          { code: 'abo_hebergement' },
        ],
      },
      REGLES,
    );

    expect(tarif.totalOneshot).toBe(249 + 89);
    expect(tarif.totalMensuel).toBe(19);
  });

  it('multiplie le prix des options quantifiables', () => {
    const tarif = calculerTarification(
      { options: [{ code: 'page_supplementaire', quantite: 3 }] },
      REGLES,
    );
    expect(tarif.totalOneshot).toBe(87);
    expect(tarif.lignes[0].quantite).toBe(3);
  });

  it('ignore la quantité sur une option non quantifiable', () => {
    const lignes = construireLignes([{ code: 'module_reservation', quantite: 5 }], REGLES);
    expect(lignes[0].quantite).toBe(1);
    expect(lignes[0].total).toBe(89);
  });

  it('ignore silencieusement un code inconnu ou une règle désactivée', () => {
    const reglesDesactivees = REGLES.map((r) =>
      r.code === 'boutique_stripe' ? { ...r, actif: false } : r,
    );
    const tarif = calculerTarification(
      { options: [{ code: 'inexistant' }, { code: 'boutique_stripe' }, { code: 'base_site_essentiel' }] },
      reglesDesactivees,
    );
    expect(tarif.lignes).toHaveLength(1);
    expect(tarif.totalOneshot).toBe(249);
  });

  it('ordonne les lignes base → options → abonnement', () => {
    const tarif = calculerTarification(
      {
        options: [
          { code: 'abo_hebergement' },
          { code: 'refonte_premium' },
          { code: 'base_site_essentiel' },
        ],
      },
      REGLES,
    );
    expect(tarif.lignes.map((l) => l.type)).toEqual(['base', 'option', 'abonnement']);
  });

  it('applique une remise en pourcentage sur la prestation initiale', () => {
    const tarif = calculerTarification(
      { options: [{ code: 'base_site_essentiel' }], promoCode: 'OUVERTURE20' },
      REGLES,
      PROMOS,
    );
    expect(tarif.remiseOneshot).toBeCloseTo(49.8, 2);
    expect(tarif.totalOneshot).toBeCloseTo(199.2, 2);
  });

  it('applique une remise sur l’abonnement sans toucher au one-shot', () => {
    const tarif = calculerTarification(
      {
        options: [{ code: 'base_site_essentiel' }, { code: 'abo_hebergement' }],
        promoCode: 'LANCEMENT30',
      },
      REGLES,
      PROMOS,
    );
    expect(tarif.totalOneshot).toBe(249);
    expect(tarif.totalMensuel).toBeCloseTo(13.3, 2);
  });

  it('comptabilise les mois offerts sans modifier le prix mensuel', () => {
    const tarif = calculerTarification(
      { options: [{ code: 'abo_hebergement' }], promoCode: 'PREMIERMOIS' },
      REGLES,
      PROMOS,
    );
    expect(tarif.moisOfferts).toBe(1);
    expect(tarif.totalMensuel).toBe(19);
  });

  it('n’applique pas une offre inactive ou hors période', () => {
    const inactive: OffrePromo = { ...PROMOS[0], actif: false };
    expect(promoApplicable(inactive)).toBe(false);

    const expiree: OffrePromo = { ...PROMOS[0], date_fin: '2020-01-01' };
    expect(promoApplicable(expiree)).toBe(false);

    const tarif = calculerTarification(
      { options: [{ code: 'base_site_essentiel' }], promoCode: 'OUVERTURE20' },
      REGLES,
      [inactive],
    );
    expect(tarif.remiseOneshot).toBe(0);
  });

  it('facture les pages au-delà des 5 incluses dans la base', () => {
    const selection = selectionDepuisSite(8, ['module_reservation']);
    expect(selection).toContainEqual({ code: 'page_supplementaire', quantite: 3 });

    const tarif = calculerTarification({ options: selection }, REGLES);
    expect(tarif.totalOneshot).toBe(249 + 3 * 29 + 89);
  });

  it('ne facture aucune page supplémentaire en deçà de 5 pages', () => {
    expect(selectionDepuisSite(4, [])).not.toContainEqual(
      expect.objectContaining({ code: 'page_supplementaire' }),
    );
  });
});
