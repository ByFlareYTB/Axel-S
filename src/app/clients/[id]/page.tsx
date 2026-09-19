import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  BadgeDevis,
  BadgeFacture,
  BadgeSite,
  Carte,
  Tableau,
  TitrePage,
  TitreSection,
  Vide,
} from '@/components/ui';
import { FormulaireClient } from '@/components/formulaire-client';
import { GenerationSite } from '@/components/generation-site';
import { dateFr, euros } from '@/lib/config';
import { getFicheClient } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function FicheClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fiche = await getFicheClient(id);
  if (!fiche) notFound();

  const { client, sites, devis, factures, abonnements, notes, hebergements } = fiche;
  const encaisse = factures
    .filter((f) => f.statut_paiement === 'payee')
    .reduce((s, f) => s + f.total_ttc, 0);
  const coutIa = sites.reduce((s, site) => s + site.cout_generation_ia, 0);
  const coutHebergement = hebergements.reduce((s, h) => s + h.cout_mensuel_reel, 0);

  return (
    <>
      <TitrePage
        titre={client.raison_sociale}
        sousTitre={[client.secteur, client.ville, client.siret ? `SIRET ${client.siret}` : null]
          .filter(Boolean)
          .join(' · ')}
        action={
          <Link href="/clients" className="text-sm text-sky-700 hover:underline">
            ← Tous les clients
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Carte>
          <TitreSection>Coordonnées</TitreSection>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ardoise-500">Contact</dt>
              <dd>{client.contact_nom ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ardoise-500">Email</dt>
              <dd className="text-right">{client.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ardoise-500">Téléphone</dt>
              <dd>{client.telephone ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ardoise-500">Adresse</dt>
              <dd className="text-right">
                {[client.adresse, client.code_postal, client.ville].filter(Boolean).join(', ') || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ardoise-500">Client depuis</dt>
              <dd>{dateFr(client.created_at)}</dd>
            </div>
          </dl>
        </Carte>

        <Carte>
          <TitreSection>Rentabilité du compte</TitreSection>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ardoise-500">Encaissé</dt>
              <dd className="tabular-nums">{euros(encaisse)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ardoise-500">Coût génération IA</dt>
              <dd className="tabular-nums">− {euros(coutIa)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ardoise-500">Hébergement / mois</dt>
              <dd className="tabular-nums">− {euros(coutHebergement)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-ardoise-200 pt-2 font-medium">
              <dt>Marge nette</dt>
              <dd className="tabular-nums">{euros(encaisse - coutIa - coutHebergement)}</dd>
            </div>
          </dl>
        </Carte>

        <Carte>
          <TitreSection>Abonnement</TitreSection>
          {abonnements.length === 0 ? (
            <Vide message="Aucun abonnement actif." />
          ) : (
            <ul className="space-y-2 text-sm">
              {abonnements.map((abo) => (
                <li key={abo.id} className="flex items-center justify-between gap-2">
                  <span>
                    {euros(abo.prix_mensuel)} / mois
                    <span className="block text-xs text-ardoise-500">
                      Prochaine échéance {dateFr(abo.prochaine_echeance)}
                      {abo.promo_code ? ` · ${abo.promo_code}` : ''}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      abo.statut === 'actif' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {abo.statut}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>

      <div className="mt-4">
        <GenerationSite clientId={client.id} sites={sites} />
      </div>

      <div className="mt-4">
        <FormulaireClient client={client} />
      </div>

      <Carte className="mt-4">
        <TitreSection>Sites</TitreSection>
        {sites.length === 0 ? (
          <Vide message="Aucun site pour ce client." />
        ) : (
          <Tableau entetes={['Site', 'Statut', 'Version', 'Test', 'Production', 'Coût IA']}>
            {sites.map((site) => (
              <tr key={site.id}>
                <td className="px-2 py-2 font-medium">{site.nom}</td>
                <td className="px-2 py-2">
                  <BadgeSite statut={site.statut} />
                </td>
                <td className="px-2 py-2 tabular-nums">v{site.version_actuelle}</td>
                <td className="px-2 py-2 text-xs">
                  {site.url_test ? (
                    <a href={site.url_test} className="text-sky-700 hover:underline">
                      Aperçu
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2 py-2 text-xs">
                  {site.url_production ? (
                    <a href={site.url_production} className="text-sky-700 hover:underline">
                      En ligne
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2 py-2 tabular-nums">{euros(site.cout_generation_ia)}</td>
              </tr>
            ))}
          </Tableau>
        )}
      </Carte>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Carte>
          <TitreSection>Devis</TitreSection>
          {devis.length === 0 ? (
            <Vide message="Aucun devis." />
          ) : (
            <Tableau entetes={['Numéro', 'Total', 'Marge', 'Statut', '']}>
              {devis.map((d) => (
                <tr key={d.id}>
                  <td className="px-2 py-2 font-medium">{d.numero}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {euros(d.total_oneshot)}
                    {d.total_mensuel > 0 && (
                      <span className="block text-xs text-ardoise-500">
                        + {euros(d.total_mensuel)}/mois
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-2 py-2 tabular-nums ${d.alerte_marge ? 'text-rose-600' : ''}`}
                  >
                    {d.marge_oneshot_pct.toFixed(0)} %
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
              {factures.map((f) => (
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
        <TitreSection>Notes & historique</TitreSection>
        {notes.length === 0 ? (
          <Vide message="Aucune note." />
        ) : (
          <ul className="space-y-3 text-sm">
            {notes.map((note) => (
              <li key={note.id} className="border-l-2 border-ardoise-200 pl-3">
                <p>{note.contenu}</p>
                <p className="mt-0.5 text-xs text-ardoise-500">
                  {note.auteur} · {dateFr(note.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </>
  );
}
