'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Carte, TitreSection } from '@/components/ui';
import type { Site } from '@/lib/types';

const OPTIONS = [
  { code: 'module_reservation', label: 'Réservation en ligne (89 €)' },
  { code: 'boutique_stripe', label: 'Boutique en ligne (199 €)' },
  { code: 'refonte_premium', label: 'Design premium (99 €)' },
  { code: 'redaction_photo_ia', label: 'Rédaction & photo IA (49 €)' },
  { code: 'livraison_express', label: 'Livraison express 48 h (79 €)' },
  { code: 'pack_visibilite', label: 'Pack visibilité (59 €)' },
  { code: 'multilingue', label: 'Multilingue (39 €/langue)' },
];

/**
 * Génération de site en un clic depuis la fiche client, puis boucle de
 * retouches ciblées sur un site déjà généré.
 */
export function GenerationSite({ clientId, sites }: { clientId: string; sites: Site[] }) {
  const router = useRouter();
  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? '');
  const [nbPages, setNbPages] = useState(5);
  const [options, setOptions] = useState<string[]>(sites[0]?.options_actives ?? []);
  const [retours, setRetours] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function basculer(code: string) {
    setOptions((actuelles) =>
      actuelles.includes(code) ? actuelles.filter((c) => c !== code) : [...actuelles, code],
    );
  }

  async function appeler<T>(url: string, corps: Record<string, unknown>, succes: (donnees: T) => string) {
    setMessage(null);
    setErreur(null);
    setAvertissements([]);
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) {
      setErreur(donnees.erreur ?? 'Opération impossible.');
      return;
    }
    setMessage(succes(donnees as T));
    router.refresh();
  }

  const generer = () =>
    appeler(
      '/api/sites/generer',
      { clientId, siteId: siteId || undefined, nbPages, options, retours: retours || undefined },
      (d: {
        urlTest: string | null;
        apercu: string;
        deploye: boolean;
        emailEnvoye: boolean;
        lienValidation: string | null;
        coutIa: number;
        avertissements: string[];
      }) => {
        setApercu(d.apercu);
        setAvertissements(d.avertissements ?? []);

        const cout = `Coût IA ${d.coutIa.toFixed(2)} €.`;
        if (!d.deploye) {
          return `Site généré et conservé. ${cout} Ouvrez l'aperçu ci-dessous. Rien n'a été envoyé au client.`;
        }
        if (d.emailEnvoye) {
          return `Site en ligne : ${d.urlTest}. Demande de validation envoyée au client. ${cout}`;
        }
        return `Site en ligne : ${d.urlTest}. ${cout} Transmettez ce lien au client : ${d.lienValidation}`;
      },
    );

  const deployerEnTest = () =>
    appeler(
      '/api/sites/deployer',
      { siteId },
      (d: {
        urlTest: string;
        emailEnvoye: boolean;
        lienValidation: string;
        raisonNonEnvoye: string | null;
      }) => {
        if (d.emailEnvoye) {
          return `Site en ligne : ${d.urlTest}. Demande de validation envoyée au client.`;
        }
        setAvertissements(
          d.raisonNonEnvoye ? [`L'email de validation n'est pas parti : ${d.raisonNonEnvoye}`] : [],
        );
        return `Site en ligne : ${d.urlTest}. Transmettez ce lien au client : ${d.lienValidation}`;
      },
    );

  const mettreEnProduction = () =>
    appeler(
      '/api/sites/production',
      { siteId },
      (d: { urlProduction: string; facture: { numero: string } }) =>
        `Site en production : ${d.urlProduction}. Devis et facture ${d.facture.numero} générés automatiquement.`,
    );

  return (
    <Carte>
      <TitreSection>Génération de site en un clic</TitreSection>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ardoise-500">Site</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
            >
              <option value="">Nouveau site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.nom} — v{site.version_actuelle} ({site.statut})
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ardoise-500">
              Nombre de pages (5 incluses dans la base)
            </span>
            <input
              type="number"
              min={3}
              max={20}
              value={nbPages}
              onChange={(e) => setNbPages(Number(e.target.value))}
              className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ardoise-500">
              Retouches demandées par le client (boucle de modifications)
            </span>
            <textarea
              value={retours}
              onChange={(e) => setRetours(e.target.value)}
              rows={3}
              placeholder="Remonter les tarifs en page d'accueil, ajouter les horaires du samedi…"
              className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
            />
          </label>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs text-ardoise-500">Options vendues</legend>
          {OPTIONS.map((option) => (
            <label key={option.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.includes(option.code)}
                onChange={() => basculer(option.code)}
                className="rounded border-ardoise-400"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enCours}
          onClick={() => demarrer(generer)}
          className="rounded-lg bg-ardoise-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {enCours ? 'Génération…' : 'Générer et déployer en test'}
        </button>

        <button
          type="button"
          disabled={enCours || !siteId}
          onClick={() => demarrer(deployerEnTest)}
          className="rounded-lg border border-ardoise-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          title="Met en ligne la version déjà générée, sans nouvel appel à l'IA"
        >
          Déployer en test
        </button>

        <button
          type="button"
          disabled={enCours || !siteId}
          onClick={() => demarrer(mettreEnProduction)}
          className="rounded-lg border border-ardoise-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          title="Déploiement production, DNS/SSL, puis devis et facture automatiques"
        >
          Mettre en production
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}

      {avertissements.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {avertissements.map((avertissement) => (
            <li key={avertissement}>⚠️ {avertissement}</li>
          ))}
        </ul>
      )}

      {apercu && (
        <a
          href={apercu}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block rounded-lg border border-ardoise-300 px-4 py-2 text-sm font-medium"
        >
          Ouvrir l&apos;aperçu du site →
        </a>
      )}

      {erreur && <p className="mt-3 text-sm text-rose-600">{erreur}</p>}
    </Carte>
  );
}
