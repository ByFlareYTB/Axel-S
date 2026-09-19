'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Carte, TitreSection } from '@/components/ui';
import type { Client } from '@/lib/types';

type Champs = {
  raison_sociale: string;
  contact_nom: string;
  email: string;
  telephone: string;
  siret: string;
  secteur: string;
  adresse: string;
  code_postal: string;
  ville: string;
};

const VIDE: Champs = {
  raison_sociale: '',
  contact_nom: '',
  email: '',
  telephone: '',
  siret: '',
  secteur: '',
  adresse: '',
  code_postal: '',
  ville: '',
};

function depuisClient(client: Client): Champs {
  return {
    raison_sociale: client.raison_sociale,
    contact_nom: client.contact_nom ?? '',
    email: client.email,
    telephone: client.telephone ?? '',
    siret: client.siret ?? '',
    secteur: client.secteur ?? '',
    adresse: client.adresse ?? '',
    code_postal: client.code_postal ?? '',
    ville: client.ville ?? '',
  };
}

/**
 * Saisie ou correction d'une fiche client.
 *
 * Tous les clients ne viennent pas de la prospection : un appel, une
 * recommandation ou un formulaire de contact amènent des clients qu'aucune
 * recherche SIRENE ne fera remonter.
 */
export function FormulaireClient({ client }: { client?: Client }) {
  const router = useRouter();
  const edition = Boolean(client);
  const [champs, setChamps] = useState<Champs>(client ? depuisClient(client) : VIDE);
  const [ouvert, setOuvert] = useState(edition);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function modifier(champ: keyof Champs, valeur: string) {
    setChamps((actuels) => ({ ...actuels, [champ]: valeur }));
  }

  async function enregistrer() {
    setMessage(null);
    setErreur(null);

    const reponse = await fetch(edition ? `/api/clients/${client!.id}` : '/api/clients', {
      method: edition ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(champs),
    });
    const donnees = await reponse.json();

    if (!reponse.ok) {
      setErreur(donnees.erreur ?? 'Enregistrement impossible.');
      return;
    }

    if (edition) {
      setMessage('Fiche mise à jour.');
      router.refresh();
    } else {
      setChamps(VIDE);
      setOuvert(false);
      router.push(`/clients/${donnees.client.id}`);
    }
  }

  const champ = (
    cle: keyof Champs,
    libelle: string,
    options: { type?: string; requis?: boolean; aide?: string } = {},
  ) => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-ardoise-500">
        {libelle}
        {options.requis && <span className="text-rose-600"> *</span>}
      </span>
      <input
        type={options.type ?? 'text'}
        value={champs[cle]}
        onChange={(e) => modifier(cle, e.target.value)}
        className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
      />
      {options.aide && <span className="mt-0.5 block text-xs text-ardoise-400">{options.aide}</span>}
    </label>
  );

  if (!ouvert) {
    return (
      <Carte>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Ajouter un client</p>
            <p className="mt-0.5 text-xs text-ardoise-500">
              Pour un client qui vous a appelé, une recommandation, ou toute entreprise que la
              recherche n&apos;a pas remontée.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="shrink-0 rounded-lg bg-ardoise-900 px-4 py-2 text-sm font-medium text-white"
          >
            Nouveau client
          </button>
        </div>
      </Carte>
    );
  }

  return (
    <Carte>
      <TitreSection
        action={
          !edition && (
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="text-xs text-ardoise-500 hover:underline"
            >
              Annuler
            </button>
          )
        }
      >
        {edition ? 'Modifier la fiche' : 'Nouveau client'}
      </TitreSection>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          demarrer(enregistrer);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {champ('raison_sociale', 'Raison sociale', { requis: true })}
          {champ('email', 'Email', {
            type: 'email',
            requis: true,
            aide: 'Sert à envoyer devis, factures et demande de validation.',
          })}
          {champ('contact_nom', 'Nom du contact')}
          {champ('telephone', 'Téléphone')}
          {champ('siret', 'SIRET', { aide: '14 chiffres. Évite les doublons.' })}
          {champ('secteur', 'Secteur', { aide: 'Oriente la génération du site.' })}
        </div>

        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          {champ('adresse', 'Adresse')}
          {champ('code_postal', 'Code postal')}
          {champ('ville', 'Ville')}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={enCours}
            className="rounded-lg bg-ardoise-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {enCours ? 'Enregistrement…' : edition ? 'Enregistrer' : 'Créer la fiche'}
          </button>
          {message && <span className="text-sm text-emerald-700">{message}</span>}
          {erreur && <span className="text-sm text-rose-600">{erreur}</span>}
        </div>
      </form>
    </Carte>
  );
}
