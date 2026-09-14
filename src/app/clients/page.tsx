import Link from 'next/link';
import { Carte, Tableau, TitrePage, Vide } from '@/components/ui';
import { dateFr } from '@/lib/config';
import { db } from '@/lib/db';
import { getClients } from '@/lib/repositories';
import type { Site } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const clients = await getClients();
  const sites = await db.list<Site>('sites');

  return (
    <>
      <TitrePage titre="Clients" sousTitre="Fiches CRM : coordonnées, sites, devis, factures et abonnement." />
      <Carte>
        {clients.length === 0 ? (
          <Vide message="Aucun client. Convertissez un prospect depuis la recherche client." />
        ) : (
          <Tableau entetes={['Client', 'Secteur', 'Ville', 'Sites', 'Client depuis', '']}>
            {clients.map((client) => {
              const sitesClient = sites.filter((s) => s.client_id === client.id);
              return (
                <tr key={client.id}>
                  <td className="px-2 py-2">
                    <Link href={`/clients/${client.id}`} className="font-medium hover:underline">
                      {client.raison_sociale}
                    </Link>
                    <span className="block text-xs text-ardoise-500">{client.email}</span>
                  </td>
                  <td className="px-2 py-2 text-ardoise-700">{client.secteur ?? '—'}</td>
                  <td className="px-2 py-2 text-ardoise-700">{client.ville ?? '—'}</td>
                  <td className="px-2 py-2 tabular-nums">{sitesClient.length}</td>
                  <td className="px-2 py-2 text-ardoise-500">{dateFr(client.created_at)}</td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/clients/${client.id}`} className="text-sm text-sky-700 hover:underline">
                      Ouvrir
                    </Link>
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
