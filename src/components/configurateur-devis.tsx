'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Carte, JaugeMarge, TitreSection } from '@/components/ui';
import { calculerTarification } from '@/lib/pricing/engine';
import { analyserMarge, comparerAuMarche, type SeuilsMarge } from '@/lib/pricing/margin';
import type { Client, OffrePromo, PricingRule } from '@/lib/types';

function euros(montant: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montant);
}

/**
 * Configurateur de devis instantané.
 *
 * Le calcul affiché utilise exactement le même moteur que le serveur
 * (`calculerTarification` + `analyserMarge`), ce qui évite tout écart entre
 * le prix montré et le prix enregistré.
 */
export function ConfigurateurDevis({
  regles,
  promos,
  clients,
  seuils,
  coutAdsParDefaut,
}: {
  regles: PricingRule[];
  promos: OffrePromo[];
  clients: Client[];
  seuils: SeuilsMarge;
  coutAdsParDefaut: number;
}) {
  const router = useRouter();
  const base = regles.find((r) => r.type === 'base');
  const abonnement = regles.find((r) => r.type === 'abonnement');
  const options = regles.filter((r) => r.type === 'option');

  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [avecBase, setAvecBase] = useState(true);
  const [avecAbonnement, setAvecAbonnement] = useState(true);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState('');
  const [coutAds, setCoutAds] = useState(coutAdsParDefaut);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => setCoutAds(coutAdsParDefaut), [coutAdsParDefaut]);

  const selection = useMemo(() => {
    const liste: { code: string; quantite?: number }[] = [];
    if (avecBase && base) liste.push({ code: base.code });
    for (const [code, quantite] of Object.entries(quantites)) {
      if (quantite > 0) liste.push({ code, quantite });
    }
    if (avecAbonnement && abonnement) liste.push({ code: abonnement.code });
    return liste;
  }, [avecBase, avecAbonnement, base, abonnement, quantites]);

  const tarification = useMemo(
    () =>
      calculerTarification(
        { options: selection, promoCode: promoCode || null, coutAcquisitionAds: coutAds },
        regles,
        promos,
      ),
    [selection, promoCode, coutAds, regles, promos],
  );

  const marge = useMemo(() => analyserMarge(tarification, seuils), [tarification, seuils]);

  // Comparateur concurrentiel : fourchette basse observée localement.
  const comparaison = comparerAuMarche(tarification.totalOneshot, 900, 4200);

  function changerQuantite(regle: PricingRule, valeur: number) {
    setQuantites((actuelles) => ({ ...actuelles, [regle.code]: Math.max(0, valeur) }));
  }

  async function enregistrer(statut: 'brouillon' | 'envoye') {
    setMessage(null);
    setErreur(null);
    const reponse = await fetch('/api/devis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId,
        options: selection,
        promoCode: promoCode || null,
        coutAcquisitionAds: coutAds,
        statut,
      }),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) {
      setErreur(donnees.erreur ?? 'Impossible de créer le devis.');
      return;
    }
    setMessage(
      `Devis ${donnees.devis.numero} créé${statut === 'envoye' ? ' et envoyé au client' : ''}.`,
    );
    router.refresh();
  }

  return (
    <Carte>
      <TitreSection>Configurateur de devis instantané</TitreSection>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-ardoise-500">Client</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.raison_sociale}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs text-ardoise-500">Offre de lancement</span>
              <select
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
              >
                <option value="">Aucune</option>
                {promos.map((promo) => (
                  <option key={promo.code} value={promo.code}>
                    {promo.libelle}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-ardoise-200 p-3">
            {base && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={avecBase}
                    onChange={(e) => setAvecBase(e.target.checked)}
                  />
                  <span className="font-medium">{base.nom}</span>
                </span>
                <span className="tabular-nums">{euros(base.prix)}</span>
              </label>
            )}

            {options.map((option) => (
              <label key={option.code} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  {option.quantifiable ? (
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={quantites[option.code] ?? 0}
                      onChange={(e) => changerQuantite(option, Number(e.target.value))}
                      className="w-14 rounded border border-ardoise-200 px-2 py-1 text-sm"
                    />
                  ) : (
                    <input
                      type="checkbox"
                      checked={(quantites[option.code] ?? 0) > 0}
                      onChange={(e) => changerQuantite(option, e.target.checked ? 1 : 0)}
                    />
                  )}
                  <span>{option.nom}</span>
                </span>
                <span className="tabular-nums text-ardoise-500">
                  {euros(option.prix)}
                  {option.unite !== 'forfait' ? ` / ${option.unite}` : ''}
                </span>
              </label>
            ))}

            {abonnement && (
              <label className="flex items-center justify-between gap-3 border-t border-ardoise-200 pt-2 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={avecAbonnement}
                    onChange={(e) => setAvecAbonnement(e.target.checked)}
                  />
                  <span className="font-medium">{abonnement.nom}</span>
                </span>
                <span className="tabular-nums">{euros(abonnement.prix)} / mois</span>
              </label>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ardoise-500">
              Coût d&apos;acquisition Ads imputé à ce client (€)
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={coutAds}
              onChange={(e) => setCoutAds(Number(e.target.value))}
              className="w-32 rounded-lg border border-ardoise-200 px-3 py-2"
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg bg-ardoise-900 p-4 text-white">
            <p className="text-xs text-ardoise-200 uppercase">Prestation initiale</p>
            <p className="text-3xl font-semibold tabular-nums">{euros(tarification.totalOneshot)}</p>
            {tarification.remiseOneshot > 0 && (
              <p className="text-xs text-ardoise-200">
                Remise {tarification.promo?.code} : − {euros(tarification.remiseOneshot)}
              </p>
            )}
            {tarification.totalMensuel > 0 && (
              <p className="mt-2 text-sm text-ardoise-200">
                puis <strong className="text-white">{euros(tarification.totalMensuel)} / mois</strong>
                {tarification.moisOfferts > 0 && ` · ${tarification.moisOfferts} mois offert(s)`}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-ardoise-200 p-4">
            <p className="mb-2 text-xs font-medium text-ardoise-500 uppercase">
              Calculateur de marge en temps réel
            </p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-ardoise-500">Coût API IA</dt>
                <dd className="tabular-nums">− {euros(tarification.coutIa)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ardoise-500">Coût acquisition Ads</dt>
                <dd className="tabular-nums">− {euros(tarification.coutAcquisitionAds)}</dd>
              </div>
              <div className="flex justify-between border-t border-ardoise-200 pt-1 font-medium">
                <dt>Marge prestation</dt>
                <dd className="tabular-nums">{euros(marge.margeOneshot)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ardoise-500">Hébergement réel / mois</dt>
                <dd className="tabular-nums">− {euros(tarification.coutHebergementMensuel)}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>Marge mensuelle</dt>
                <dd className="tabular-nums">{euros(marge.margeMensuelle)}</dd>
              </div>
              <div className="flex justify-between border-t border-ardoise-200 pt-1">
                <dt className="text-ardoise-500">Marge sur 12 mois</dt>
                <dd className="tabular-nums">{euros(marge.margeAnnuelle)}</dd>
              </div>
            </dl>

            <div className="mt-3">
              <JaugeMarge pourcentage={marge.margeOneshotPct} seuil={seuils.oneshotPct} />
            </div>

            {marge.alerte && (
              <ul className="mt-3 space-y-1 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                {marge.alertes.map((alerte) => (
                  <li key={alerte}>⚠️ {alerte}</li>
                ))}
              </ul>
            )}

            {comparaison.argumentaire && (
              <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                💬 {comparaison.argumentaire}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enCours || !clientId || tarification.lignes.length === 0}
              onClick={() => demarrer(() => enregistrer('envoye'))}
              className="rounded-lg bg-ardoise-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Créer et envoyer le devis
            </button>
            <button
              type="button"
              disabled={enCours || !clientId || tarification.lignes.length === 0}
              onClick={() => demarrer(() => enregistrer('brouillon'))}
              className="rounded-lg border border-ardoise-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Enregistrer en brouillon
            </button>
          </div>

          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {erreur && <p className="text-sm text-rose-600">{erreur}</p>}
        </div>
      </div>
    </Carte>
  );
}
