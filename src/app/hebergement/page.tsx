import { BadgeSite, Carte, Kpi, Tableau, TitrePage, TitreSection, Vide } from '@/components/ui';
import { dateFr, euros } from '@/lib/config';
import { getHebergements } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function HebergementPage() {
  const hebergements = await getHebergements();

  const coutTotal = hebergements.reduce((s, h) => s + h.cout_mensuel_reel, 0);
  const factureTotal = hebergements.reduce((s, h) => s + h.prix_facture_mensuel, 0);
  const margeAbonnements = factureTotal - coutTotal;

  return (
    <>
      <TitrePage
        titre="Hébergement"
        sousTitre="Vue consolidée par site : plateforme, domaine, SSL et coût réel comparé au prix facturé."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi libelle="Coût réel mensuel" valeur={euros(coutTotal)} detail={`${hebergements.length} instance(s)`} />
        <Kpi libelle="Facturé mensuel" valeur={euros(factureTotal)} ton="positif" />
        <Kpi
          libelle="Marge des abonnements"
          valeur={euros(margeAbonnements)}
          detail="Prix facturé − coût d'hébergement réel"
          ton={margeAbonnements > 0 ? 'positif' : 'alerte'}
        />
      </div>

      <Carte className="mt-4">
        <TitreSection>Instances</TitreSection>
        {hebergements.length === 0 ? (
          <Vide message="Aucune instance d'hébergement." />
        ) : (
          <Tableau
            entetes={['Site', 'Plateforme', 'Domaine', 'SSL', 'DNS', 'Coût réel', 'Facturé', 'Marge', 'Vérifié']}
          >
            {hebergements.map((h) => {
              const marge = h.prix_facture_mensuel - h.cout_mensuel_reel;
              return (
                <tr key={h.id}>
                  <td className="px-2 py-2">
                    <span className="font-medium">{h.site?.nom ?? '—'}</span>
                    {h.site && (
                      <span className="mt-0.5 block">
                        <BadgeSite statut={h.site.statut} />
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-ardoise-700">{h.plateforme}</td>
                  <td className="px-2 py-2 text-xs">
                    {h.domaine ?? h.sous_domaine ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <span className={h.statut_ssl === 'actif' ? 'text-emerald-600' : 'text-amber-600'}>
                      {h.statut_ssl}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs">{h.dns_configure ? '✅' : '⏳'}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(h.cout_mensuel_reel)}</td>
                  <td className="px-2 py-2 tabular-nums">{euros(h.prix_facture_mensuel)}</td>
                  <td className={`px-2 py-2 tabular-nums ${marge <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {euros(marge)}
                  </td>
                  <td className="px-2 py-2 text-xs text-ardoise-500">{dateFr(h.derniere_verification)}</td>
                </tr>
              );
            })}
          </Tableau>
        )}
      </Carte>
    </>
  );
}
