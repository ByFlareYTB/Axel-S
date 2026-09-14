'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BadgeSite, Carte, TitreSection } from '@/components/ui';
import { dateFr, euros } from '@/lib/config';
import type { Site, SiteStatut, SiteVersion, ValidationClient } from '@/lib/types';

const STATUTS: SiteStatut[] = ['brouillon', 'test', 'production', 'maintenance', 'hors_ligne'];

/**
 * Pilotage d'un site : changement de statut, état de la sauvegarde unique et
 * restauration en un clic.
 */
export function GestionSite({
  site,
  courante,
  sauvegarde,
  validations,
  lienValidation,
}: {
  site: Site;
  courante: SiteVersion | null;
  sauvegarde: SiteVersion | null;
  validations: ValidationClient[];
  lienValidation: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  async function appeler(corps: Record<string, unknown>, succes: string) {
    setMessage(null);
    setErreur(null);
    const reponse = await fetch(`/api/sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) {
      setErreur(donnees.erreur ?? 'Opération impossible.');
      return;
    }
    setMessage(succes);
    router.refresh();
  }

  return (
    <Carte>
      <TitreSection
        action={
          <div className="flex items-center gap-2">
            <BadgeSite statut={site.statut} />
            <select
              value={site.statut}
              disabled={enCours}
              onChange={(e) =>
                demarrer(() =>
                  appeler({ statut: e.target.value }, `Statut passé à « ${e.target.value} ».`),
                )
              }
              className="rounded-lg border border-ardoise-200 px-2 py-1 text-xs"
            >
              {STATUTS.map((statut) => (
                <option key={statut} value={statut}>
                  {statut}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {site.nom}
      </TitreSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-ardoise-500 uppercase">
            Production et sauvegarde
          </p>

          <div className="space-y-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-xs font-medium text-emerald-800">
                🟢 En production — version {site.version_actuelle}
              </p>
              {courante ? (
                <p className="mt-1 text-xs text-ardoise-600">
                  {courante.libelle ?? '—'} · {dateFr(courante.created_at)} ·{' '}
                  {euros(courante.cout_ia)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-ardoise-500">Aucune version générée.</p>
              )}
            </div>

            <div className="rounded-lg border border-ardoise-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ardoise-700">
                    💾 Sauvegarde{' '}
                    {site.version_sauvegarde ? `— version ${site.version_sauvegarde}` : ''}
                  </p>
                  {sauvegarde ? (
                    <p className="mt-1 text-xs text-ardoise-500">
                      {sauvegarde.libelle ?? '—'} · {dateFr(sauvegarde.created_at)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ardoise-500">
                      Aucune sauvegarde : ce site n&apos;a encore qu&apos;un seul état.
                    </p>
                  )}
                </div>

                {sauvegarde && (
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() =>
                      demarrer(() =>
                        appeler(
                          { restaurerSauvegarde: true },
                          `Sauvegarde restaurée : la version ${site.version_sauvegarde} est de nouveau en production.`,
                        ),
                      )
                    }
                    className="shrink-0 rounded border border-ardoise-300 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    Restaurer
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs text-ardoise-500">
            Une seule sauvegarde est conservée : chaque nouvelle mise en production remplace la
            précédente. Restaurer échange les deux — l&apos;opération est réversible.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ardoise-500 uppercase">Validations client</p>
          <ul className="space-y-2 text-sm">
            {validations.map((validation) => (
              <li key={validation.id}>
                v{validation.version} — {validation.statut}
                <span className="block text-xs text-ardoise-500">
                  envoyée le {dateFr(validation.envoye_le)}
                  {validation.commentaire ? ` · « ${validation.commentaire} »` : ''}
                </span>
              </li>
            ))}
            {validations.length === 0 && (
              <li className="text-ardoise-500">Aucune validation envoyée.</li>
            )}
          </ul>

          {lienValidation && (
            <div className="mt-3 rounded-lg bg-ardoise-100 p-2.5">
              <p className="text-xs font-medium text-ardoise-700">Lien de validation en attente</p>
              <a
                href={lienValidation}
                className="mt-1 block truncate text-xs text-sky-700 hover:underline"
              >
                {lienValidation}
              </a>
              <p className="mt-1 text-[11px] text-ardoise-500">
                C&apos;est la page que reçoit votre client. Ouvrez-la pour vérifier le parcours ou
                répondre à sa place.
              </p>
            </div>
          )}
        </div>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {erreur && <p className="mt-3 text-sm text-rose-600">{erreur}</p>}
    </Carte>
  );
}
