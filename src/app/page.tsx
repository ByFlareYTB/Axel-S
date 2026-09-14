import Link from 'next/link';
import {
  BadgeDevis,
  Carte,
  Histogramme,
  Kpi,
  LienDiscret,
  TitrePage,
  TitreSection,
  Tableau,
  Vide,
} from '@/components/ui';
import { dateFr, euros } from '@/lib/config';
import { calculerKpi, revenusMensuels } from '@/lib/dashboard';
import { getDevis, getSitesEnAttenteValidation } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [kpi, serie, enAttente, devis] = await Promise.all([
    calculerKpi(),
    revenusMensuels(),
    getSitesEnAttenteValidation(),
    getDevis(),
  ]);

  const devisAlerte = devis.filter((d) => d.alerte_marge).slice(0, 5);

  return (
    <>
      <TitrePage
        titre="Dashboard"
        sousTitre="Prospection, revenus, marge et récurrent, en un coup d'œil."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          libelle="Clients démarchés"
          valeur={String(kpi.prospection.demarches)}
          detail={`${kpi.prospection.tauxConversion} % de conversion — ${kpi.prospection.convertis} clients`}
        />
        <Kpi
          libelle="Revenus du mois"
          valeur={euros(kpi.revenus.mois)}
          detail={`Jour ${euros(kpi.revenus.jour)} · semaine ${euros(kpi.revenus.semaine)}`}
          ton="positif"
        />
        <Kpi
          libelle="MRR (abonnements)"
          valeur={euros(kpi.mrr)}
          detail="Hébergement & maintenance facturés chaque mois"
          ton="positif"
        />
        <Kpi
          libelle="Marge nette moyenne / site"
          valeur={euros(kpi.margeNetteMoyenne)}
          detail="Encaissé − coût IA − hébergement"
          ton={kpi.margeNetteMoyenne > 0 ? 'positif' : 'alerte'}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          libelle="Sites actifs"
          valeur={String(kpi.sites.actifs)}
          detail={`${kpi.sites.total} sites au total · ${kpi.sites.enTest} en test`}
        />
        <Kpi
          libelle="En attente de validation"
          valeur={String(kpi.sites.enAttenteValidation)}
          detail="Sites déployés en test, réponse client attendue"
          ton={kpi.sites.enAttenteValidation > 0 ? 'alerte' : 'neutre'}
        />
        <Kpi
          libelle="Revenus Ads attribués"
          valeur={euros(kpi.ads.revenus)}
          detail={`${euros(kpi.ads.depense)} dépensés · ROAS ${kpi.ads.roas ?? '—'}`}
        />
        <Kpi
          libelle="Encours à recouvrer"
          valeur={euros(kpi.revenus.impayes)}
          detail={`${kpi.devisEnAttente} devis en attente de réponse`}
          ton={kpi.revenus.impayes > 0 ? 'alerte' : 'neutre'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Carte className="lg:col-span-2">
          <TitreSection>Revenus encaissés — 6 derniers mois</TitreSection>
          <Histogramme points={serie} />
        </Carte>

        <Carte>
          <TitreSection action={<LienDiscret href="/sites">Tous les sites</LienDiscret>}>
            Validations en attente
          </TitreSection>
          {enAttente.length === 0 ? (
            <Vide message="Aucune validation en attente." />
          ) : (
            <ul className="space-y-3">
              {enAttente.slice(0, 5).map(({ site, validation }) => (
                <li key={validation.id} className="text-sm">
                  <Link href={`/sites#${site.id}`} className="font-medium hover:underline">
                    {site.nom}
                  </Link>
                  <p className="text-xs text-ardoise-500">
                    v{validation.version} · envoyée le {dateFr(validation.envoye_le)} ·{' '}
                    {validation.statut === 'modifications_demandees'
                      ? 'retouches demandées'
                      : 'réponse attendue'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>

      <Carte className="mt-4">
        <TitreSection action={<LienDiscret href="/facturation">Module facturation</LienDiscret>}>
          Devis sous les seuils de marge
        </TitreSection>
        {devisAlerte.length === 0 ? (
          <Vide message="Aucun devis ne passe sous les seuils de marge configurés." />
        ) : (
          <Tableau entetes={['Devis', 'Total', 'Marge', 'Marge %', 'Statut']}>
            {devisAlerte.map((d) => (
              <tr key={d.id}>
                <td className="px-2 py-2 font-medium">{d.numero}</td>
                <td className="px-2 py-2 tabular-nums">{euros(d.total_oneshot)}</td>
                <td className="px-2 py-2 tabular-nums text-rose-600">{euros(d.marge_oneshot)}</td>
                <td className="px-2 py-2 tabular-nums">{d.marge_oneshot_pct.toFixed(1)} %</td>
                <td className="px-2 py-2">
                  <BadgeDevis statut={d.statut} />
                </td>
              </tr>
            ))}
          </Tableau>
        )}
      </Carte>
    </>
  );
}
