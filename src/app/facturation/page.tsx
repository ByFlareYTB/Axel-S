import {
  BadgeDevis,
  BadgeFacture,
  Carte,
  Kpi,
  Tableau,
  TitrePage,
  TitreSection,
  Vide,
} from '@/components/ui';
import { ConfigurateurDevis } from '@/components/configurateur-devis';
import { dateFr, euros } from '@/lib/config';
import { coutAcquisitionMoyen } from '@/lib/integrations/ads';
import { seuilsMarge } from '@/lib/pipeline/facturation';
import {
  getAbonnements,
  getClients,
  getDevis,
  getFactures,
  getOffresPromo,
  getPricingRules,
} from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function FacturationPage() {
  const [regles, promos, clients, devis, factures, abonnements, seuils, coutAds] = await Promise.all([
    getPricingRules(),
    getOffresPromo(true),
    getClients(),
    getDevis(),
    getFactures(),
    getAbonnements(),
    seuilsMarge(),
    coutAcquisitionMoyen(),
  ]);

  const mrr = abonnements.filter((a) => a.statut === 'actif').reduce((s, a) => s + a.prix_mensuel, 0);
  const encaisse = factures
    .filter((f) => f.statut_paiement === 'payee')
    .reduce((s, f) => s + f.total_ttc, 0);
  const impaye = factures
    .filter((f) => f.statut_paiement === 'impayee' || f.statut_paiement === 'emise')
    .reduce((s, f) => s + f.total_ttc, 0);
  const margeMoyenne = devis.length
    ? devis.reduce((s, d) => s + d.marge_oneshot_pct, 0) / devis.length
    : 0;

  return (
    <>
      <TitrePage
        titre="Facturation & tarification"
        sousTitre="Base fixe + options modulables, marge calculée en temps réel, abonnements récurrents."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi libelle="Encaissé" valeur={euros(encaisse)} ton="positif" />
        <Kpi libelle="MRR" valeur={euros(mrr)} detail={`${abonnements.length} abonnement(s)`} ton="positif" />
        <Kpi
          libelle="Marge moyenne des devis"
          valeur={`${margeMoyenne.toFixed(1)} %`}
          detail={`Seuil d'alerte ${seuils.oneshotPct} %`}
          ton={margeMoyenne >= seuils.oneshotPct ? 'positif' : 'alerte'}
        />
        <Kpi
          libelle="À recouvrer"
          valeur={euros(impaye)}
          detail="Factures émises ou impayées"
          ton={impaye > 0 ? 'alerte' : 'neutre'}
        />
      </div>

      <div className="mt-4">
        <ConfigurateurDevis
          regles={regles}
          promos={promos}
          clients={clients}
          seuils={seuils}
          coutAdsParDefaut={coutAds}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Carte>
          <TitreSection>Devis</TitreSection>
          {devis.length === 0 ? (
            <Vide message="Aucun devis émis." />
          ) : (
            <Tableau entetes={['Numéro', 'Total', 'Mensuel', 'Marge', 'Statut', '']}>
              {devis.slice(0, 12).map((d) => (
                <tr key={d.id} className={d.alerte_marge ? 'bg-rose-50' : ''}>
                  <td className="px-2 py-2 font-medium">{d.numero}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(d.total_oneshot)}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {d.total_mensuel > 0 ? `${euros(d.total_mensuel)}/mois` : '—'}
                  </td>
                  <td className={`px-2 py-2 tabular-nums ${d.alerte_marge ? 'text-rose-600' : ''}`}>
                    {euros(d.marge_oneshot)} ({d.marge_oneshot_pct.toFixed(0)} %)
                  </td>
                  <td className="px-2 py-2">
                    <BadgeDevis statut={d.statut} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <a href={`/api/devis/${d.id}/pdf`} className="text-xs text-sky-700 hover:underline">
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </Tableau>
          )}
        </Carte>

        <Carte>
          <TitreSection>Factures</TitreSection>
          {factures.length === 0 ? (
            <Vide message="Aucune facture." />
          ) : (
            <Tableau entetes={['Numéro', 'Date', 'Montant', 'Statut', '']}>
              {factures.slice(0, 12).map((f) => (
                <tr key={f.id}>
                  <td className="px-2 py-2 font-medium">{f.numero}</td>
                  <td className="px-2 py-2 text-ardoise-500">{dateFr(f.date)}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(f.total_ttc)}</td>
                  <td className="px-2 py-2">
                    <BadgeFacture statut={f.statut_paiement} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <a href={`/api/factures/${f.id}/pdf`} className="text-xs text-sky-700 hover:underline">
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </Tableau>
          )}
        </Carte>
      </div>

      <Carte className="mt-4">
        <TitreSection>Abonnements Hébergement & Maintenance</TitreSection>
        {abonnements.length === 0 ? (
          <Vide message="Aucun abonnement." />
        ) : (
          <Tableau entetes={['Client', 'Montant', 'Statut', 'Échecs', 'Prochaine échéance', 'Offre']}>
            {abonnements.map((abo) => {
              const client = clients.find((c) => c.id === abo.client_id);
              return (
                <tr key={abo.id}>
                  <td className="px-2 py-2 font-medium">{client?.raison_sociale ?? '—'}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(abo.prix_mensuel)}/mois</td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        abo.statut === 'actif'
                          ? 'text-emerald-600'
                          : abo.statut === 'suspendu'
                            ? 'text-rose-600'
                            : 'text-amber-600'
                      }
                    >
                      {abo.statut}
                    </span>
                  </td>
                  <td className="px-2 py-2 tabular-nums">{abo.echecs_paiement}</td>
                  <td className="px-2 py-2 text-ardoise-500">{dateFr(abo.prochaine_echeance)}</td>
                  <td className="px-2 py-2 text-xs text-ardoise-500">{abo.promo_code ?? '—'}</td>
                </tr>
              );
            })}
          </Tableau>
        )}
      </Carte>
    </>
  );
}
