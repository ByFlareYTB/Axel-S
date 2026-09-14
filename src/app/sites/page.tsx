import { BadgeSite, Carte, Tableau, TitrePage, TitreSection, Vide } from '@/components/ui';
import { GestionSite } from '@/components/gestion-site';
import { config, dateFr, euros } from '@/lib/config';
import { db } from '@/lib/db';
import { etatSauvegarde } from '@/lib/pipeline/sauvegarde';
import { getSites, getValidations } from '@/lib/repositories';
import type { Client } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const [sites, validations, clients] = await Promise.all([
    getSites(),
    getValidations(),
    db.list<Client>('clients'),
  ]);

  // Un seul aller-retour par site pour ses deux états conservés.
  const etats = await Promise.all(sites.map((site) => etatSauvegarde(site)));

  return (
    <>
      <TitrePage
        titre="Sites créés"
        sousTitre="Statuts, production courante et sauvegarde unique restaurable en un clic."
      />

      <Carte>
        <TitreSection>{sites.length} site(s)</TitreSection>
        {sites.length === 0 ? (
          <Vide message="Aucun site pour le moment. Ouvrez une fiche client et lancez la génération en un clic." />
        ) : (
          <Tableau
            entetes={['Site', 'Client', 'Statut', 'Prod', 'Sauvegarde', 'URL', 'Coût IA', 'Dernière génération']}
          >
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
                <td className="px-2 py-2 tabular-nums text-ardoise-500">
                  {site.version_sauvegarde ? `v${site.version_sauvegarde}` : '—'}
                </td>
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
        {sites.map((site, index) => {
          const validationsSite = validations.filter((v) => v.site_id === site.id);
          // Le lien de validation en attente est affiché pour vous permettre de
          // vérifier le parcours client, ou de répondre si le client vous
          // sollicite par téléphone plutôt que par email.
          const enAttente = validationsSite.find((v) => v.statut === 'envoyee');
          return (
            <GestionSite
              key={site.id}
              site={site}
              courante={etats[index].courante}
              sauvegarde={etats[index].sauvegarde}
              validations={validationsSite}
              lienValidation={enAttente ? `${config.appBaseUrl}/validation/${enAttente.token}` : null}
            />
          );
        })}
      </div>
    </>
  );
}
