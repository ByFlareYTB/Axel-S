'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BadgeSite, Carte, TitreSection } from '@/components/ui';
import { dateFr, euros } from '@/lib/config';
import type { Site, SiteStatut, SiteVersion, ValidationClient } from '@/lib/types';

const STATUTS: SiteStatut[] = ['brouillon', 'test', 'production', 'maintenance', 'hors_ligne'];

/** Changement de statut, historique des versions et rollback. */
export function GestionSite({
  site,
  versions,
  validations,
}: {
  site: Site;
  versions: SiteVersion[];
  validations: ValidationClient[];
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
                demarrer(() => appeler({ statut: e.target.value }, `Statut passé à « ${e.target.value} ».`))
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
          <p className="mb-2 text-xs font-medium text-ardoise-500 uppercase">Historique des versions</p>
          <ul className="space-y-2 text-sm">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-medium">v{version.version}</span> — {version.libelle ?? '—'}
                  <span className="block text-xs text-ardoise-500">
                    {dateFr(version.created_at)} · {version.modele_ia ?? 'ia'} ·{' '}
                    {euros(version.cout_ia)}
                  </span>
                </span>
                {version.version !== site.version_actuelle && (
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() =>
                      demarrer(() =>
                        appeler({ rollbackVersion: version.version }, `Retour à la version ${version.version}.`),
                      )
                    }
                    className="rounded border border-ardoise-300 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    Revenir à cette version
                  </button>
                )}
              </li>
            ))}
            {versions.length === 0 && <li className="text-ardoise-500">Aucune version générée.</li>}
          </ul>
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
            {validations.length === 0 && <li className="text-ardoise-500">Aucune validation envoyée.</li>}
          </ul>
        </div>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {erreur && <p className="mt-3 text-sm text-rose-600">{erreur}</p>}
    </Carte>
  );
}
