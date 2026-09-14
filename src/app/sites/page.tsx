import { BadgeSite, Carte, Tableau, TitrePage, TitreSection, Vide } from '@/components/ui';
import { GestionSite } from '@/components/gestion-site';
import { dateFr, euros } from '@/lib/config';
import { db } from '@/lib/db';
import { getSites, getValidations } from '@/lib/repositories';
import type { Client, SiteVersion } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const [sites, validations, clients, versions] = await Promise.all([
    getSites(),
    getValidations(),
    db.list<Client>('clients'),
    db.list<SiteVersion>('site_versions'),
  ]);

  return (
    <>
      <TitrePage
        titre="Sites créés"
        sousTitre="Statuts brouillon / test / production / maintenance / hors ligne, historique des versions et rollback."
      />

      <Carte>
        <TitreSection>{sites.length} site(s)</TitreSection>
        {sites.length === 0 ? (
          <Vide message="Aucun site généré pour le moment." />
        ) : (
          <Tableau entetes={['Site', 'Client', 'Statut', 'Version', 'URL', 'Coût IA', 'Dernière génération']}>
            {sites.map((site) => (
              <tr key={site.id} id={site.id}>
                <td className="px-2 py-2 font-medium">{site.nom}</td>
                <td className="px-2 py-2 text-ardoise-700">
                  {clients.find((c) => c.id === site.client_id)?.raison_sociale ?? '—'}
                </td>
                <td className="px-2 py-2">
                  <BadgeSite statut={site.statut} />
                </td>
                <td className="px-2 py-2 tabular-nums">v{site.version_actuelle}</td>
                <td className="px-2 py-2 text-xs">
                  {site.url_production ? (
                    <a href={site.url_production} className="text-sky-700 hover:underline">
                      Production
                    </a>
                  ) : site.url_test ? (
                    <a href={site.url_test} className="text-sky-700 hover:underline">
                      Test
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2 py-2 tabular-nums">{euros(site.cout_generation_ia)}</td>
                <td className="px-2 py-2 text-ardoise-500">{dateFr(site.derniere_generation)}</td>
              </tr>
            ))}
          </Tableau>
        )}
      </Carte>

      <div className="mt-4 space-y-4">
        {sites.map((site) => (
          <GestionSite
            key={site.id}
            site={site}
            versions={versions.filter((v) => v.site_id === site.id).sort((a, b) => b.version - a.version)}
            validations={validations.filter((v) => v.site_id === site.id)}
          />
        ))}
      </div>
    </>
  );
}
