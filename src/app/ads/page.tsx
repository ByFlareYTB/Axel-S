import { Badge, Carte, Kpi, Tableau, TitrePage, TitreSection, Vide } from '@/components/ui';
import { dateFr, euros } from '@/lib/config';
import { kpiCampagne } from '@/lib/integrations/ads';
import { getCampagnes } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function AdsPage() {
  const campagnes = await getCampagnes();

  const depense = campagnes.reduce((s, c) => s + c.depense, 0);
  const budget = campagnes.reduce((s, c) => s + c.budget, 0);
  const revenus = campagnes.reduce((s, c) => s + c.revenus_attribues, 0);
  const leads = campagnes.reduce((s, c) => s + c.leads, 0);
  const conversions = campagnes.reduce((s, c) => s + c.conversions, 0);

  return (
    <>
      <TitrePage
        titre="Publicité"
        sousTitre="Meta Ads et Google Ads en lecture seule : budget, dépensé, leads, coût/lead, conversions et revenus attribués."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi libelle="Dépensé" valeur={euros(depense)} detail={`sur ${euros(budget)} de budget`} />
        <Kpi
          libelle="Coût par lead"
          valeur={leads > 0 ? euros(depense / leads) : '—'}
          detail={`${leads} leads`}
        />
        <Kpi
          libelle="Coût par client"
          valeur={conversions > 0 ? euros(depense / conversions) : '—'}
          detail={`${conversions} conversions`}
        />
        <Kpi
          libelle="Revenus attribués"
          valeur={euros(revenus)}
          detail={depense > 0 ? `ROAS ${(revenus / depense).toFixed(2)}` : undefined}
          ton={revenus > depense ? 'positif' : 'alerte'}
        />
      </div>

      <Carte className="mt-4">
        <TitreSection>Campagnes</TitreSection>
        {campagnes.length === 0 ? (
          <Vide message="Aucune campagne synchronisée." />
        ) : (
          <Tableau
            entetes={['Campagne', 'Plateforme', 'Budget', 'Dépensé', 'Leads', 'Coût/lead', 'Conversions', 'Revenus', 'ROAS', 'Période']}
          >
            {campagnes.map((campagne) => {
              const kpi = kpiCampagne(campagne);
              return (
                <tr key={campagne.id}>
                  <td className="px-2 py-2">
                    <span className="font-medium">{campagne.nom}</span>
                    <span className="mt-0.5 block">
                      <Badge ton={campagne.statut === 'active' ? 'succes' : 'neutre'}>
                        {campagne.statut}
                      </Badge>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-ardoise-700 capitalize">{campagne.plateforme}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(campagne.budget)}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(campagne.depense)}</td>
                  <td className="px-2 py-2 tabular-nums">{campagne.leads}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {kpi.coutParLead !== null ? euros(kpi.coutParLead) : '—'}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{campagne.conversions}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(campagne.revenus_attribues)}</td>
                  <td
                    className={`px-2 py-2 tabular-nums ${
                      (kpi.roas ?? 0) >= 1 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {kpi.roas ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-xs text-ardoise-500">
                    {dateFr(campagne.date_debut)} → {campagne.date_fin ? dateFr(campagne.date_fin) : 'en cours'}
                  </td>
                </tr>
              );
            })}
          </Tableau>
        )}
      </Carte>
    </>
  );
}
