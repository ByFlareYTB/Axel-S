'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Badge, BadgeProspect, Carte, Tableau, TitreSection, Vide } from '@/components/ui';
import type { Prospect, ProspectStatut, RecherchePerplexity } from '@/lib/types';
import { PROSPECT_STATUTS } from '@/lib/types';

const SECTEURS = [
  'Boulangerie-pâtisserie',
  'Coiffure',
  'Plomberie-chauffage',
  'Garage automobile',
  'Restauration',
  'Électricité générale',
  'Menuiserie',
  'Institut de beauté',
  'Paysagiste',
  'Maçonnerie',
];

const STATUTS: ProspectStatut[] = ['non_vu', 'en_attente', 'client', 'refuse'];

export function TableauProspects({
  prospectsInitiaux,
  dernieresRecherches,
  coutRecherchesEuros,
}: {
  prospectsInitiaux: Prospect[];
  dernieresRecherches: RecherchePerplexity[];
  coutRecherchesEuros: number;
}) {
  const [prospects, setProspects] = useState(prospectsInitiaux);
  const [secteur, setSecteur] = useState(SECTEURS[0]);
  const [codePostal, setCodePostal] = useState('');
  const [filtreStatut, setFiltreStatut] = useState<ProspectStatut | 'tous'>('tous');
  const [filtreSecteur, setFiltreSecteur] = useState('tous');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const secteursPresents = useMemo(
    () => Array.from(new Set(prospects.map((p) => p.secteur).filter(Boolean))) as string[],
    [prospects],
  );

  const affiches = prospects.filter(
    (p) =>
      (filtreStatut === 'tous' || p.statut === filtreStatut) &&
      (filtreSecteur === 'tous' || p.secteur === filtreSecteur),
  );

  async function lancerRecherche() {
    setMessage(null);
    const reponse = await fetch('/api/prospection/recherche', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secteur, codePostal: codePostal || undefined, limite: 10 }),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) {
      setMessage(donnees.erreur ?? 'La recherche a échoué.');
      return;
    }
    setProspects((actuels) => [...donnees.prospects, ...actuels]);
    setMessage(
      `${donnees.prospects.length} prospect(s) ajouté(s)` +
        (donnees.ignoresDoublons ? `, ${donnees.ignoresDoublons} doublon(s) SIRET ignoré(s)` : '') +
        `. Coût de recherche : ${donnees.coutRecherche.toFixed(3)} €.`,
    );
  }

  async function changerStatut(id: string, statut: ProspectStatut) {
    setProspects((actuels) => actuels.map((p) => (p.id === id ? { ...p, statut } : p)));
    const reponse = await fetch(`/api/prospection/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statut }),
    });
    const donnees = await reponse.json();
    if (reponse.ok && donnees.clientId) {
      setMessage(`Prospect converti en client. Fiche créée.`);
    }
  }

  return (
    <div className="space-y-4">
      <Carte>
        <TitreSection>Nouvelle recherche</TitreSection>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-ardoise-500">Secteur d&apos;activité</span>
            <select
              value={secteur}
              onChange={(e) => setSecteur(e.target.value)}
              className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
            >
              {SECTEURS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs text-ardoise-500">Code postal</span>
            <input
              value={codePostal}
              onChange={(e) => setCodePostal(e.target.value)}
              placeholder="37260"
              inputMode="numeric"
              className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
            />
          </label>

          <button
            type="button"
            disabled={enCours}
            onClick={() => demarrer(lancerRecherche)}
            className="self-end rounded-lg bg-ardoise-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {enCours ? 'Recherche…' : 'Lancer la recherche'}
          </button>
        </div>

        {message && <p className="mt-3 text-sm text-sky-700">{message}</p>}

        <p className="mt-3 text-xs text-ardoise-500">
          {dernieresRecherches.length} recherche(s) récente(s) · coût cumulé{' '}
          {coutRecherchesEuros.toFixed(3)} €
        </p>
      </Carte>

      <Carte>
        <TitreSection
          action={
            <div className="flex flex-wrap gap-2">
              <select
                value={filtreSecteur}
                onChange={(e) => setFiltreSecteur(e.target.value)}
                className="rounded-lg border border-ardoise-200 px-2 py-1 text-xs"
              >
                <option value="tous">Tous les secteurs</option>
                {secteursPresents.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <select
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value as ProspectStatut | 'tous')}
                className="rounded-lg border border-ardoise-200 px-2 py-1 text-xs"
              >
                <option value="tous">Tous les statuts</option>
                {STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {PROSPECT_STATUTS[s].emoji} {PROSPECT_STATUTS[s].label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {affiches.length} prospect(s)
        </TitreSection>

        {affiches.length === 0 ? (
          <Vide message="Aucun prospect pour ces filtres. Lancez une recherche." />
        ) : (
          <Tableau
            entetes={['Entreprise', 'Secteur', 'Ville', 'Web', 'Score', 'Concurrence', 'Statut']}
          >
            {affiches.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-2 py-2">
                  <span className="font-medium">{p.raison_sociale}</span>
                  <span className="block text-xs text-ardoise-500">
                    {p.email ?? 'email inconnu'}
                    {p.siret ? ` · SIRET ${p.siret}` : ''}
                  </span>
                </td>
                <td className="px-2 py-2 text-ardoise-700">{p.secteur ?? '—'}</td>
                <td className="px-2 py-2 text-ardoise-700">
                  {p.ville ?? '—'}
                  <span className="block text-xs text-ardoise-500">{p.code_postal ?? ''}</span>
                </td>
                <td className="px-2 py-2">
                  {p.site_web_existant ? (
                    <Badge ton={p.site_obsolete ? 'alerte' : 'neutre'}>
                      {p.site_obsolete ? 'Site obsolète' : 'Site à jour'}
                    </Badge>
                  ) : (
                    <Badge ton="info">Sans site</Badge>
                  )}
                </td>
                <td className="px-2 py-2 tabular-nums">{p.score}</td>
                <td className="px-2 py-2 text-xs text-ardoise-500">
                  {p.prix_concurrence_min && p.prix_concurrence_max
                    ? `${p.prix_concurrence_min} – ${p.prix_concurrence_max} €`
                    : '—'}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <BadgeProspect statut={p.statut} />
                    <div className="flex gap-1">
                      {STATUTS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          title={PROSPECT_STATUTS[s].label}
                          onClick={() => changerStatut(p.id, s)}
                          className={`rounded px-1 text-base leading-none transition ${
                            p.statut === s ? 'opacity-100' : 'opacity-35 hover:opacity-100'
                          }`}
                        >
                          {PROSPECT_STATUTS[s].emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                  {p.statut === 'client' && (
                    <Link href="/clients" className="mt-1 block text-xs text-sky-700 hover:underline">
                      Voir la fiche client
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </Tableau>
        )}
      </Carte>
    </div>
  );
}
