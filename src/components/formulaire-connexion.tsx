'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Connexion, ou création du mot de passe au tout premier lancement.
 *
 * Les deux cas partagent le même écran : une installation neuve ne doit pas
 * envoyer l'utilisateur en ligne de commande avant de pouvoir entrer.
 */
export function FormulaireConnexion({
  emailParDefaut,
  demo,
  deuxFacteurs,
  installation,
}: {
  emailParDefaut: string;
  demo: boolean;
  deuxFacteurs: boolean;
  installation: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(emailParDefaut);
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code2fa, setCode2fa] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  async function soumettre() {
    setErreur(null);

    if (installation) {
      if (motDePasse.length < 10) {
        setErreur('Choisissez un mot de passe d’au moins 10 caractères.');
        return;
      }
      if (motDePasse !== confirmation) {
        setErreur('Les deux mots de passe ne correspondent pas.');
        return;
      }
    }

    const url = installation ? '/api/auth/installation' : '/api/auth/login';
    const corps = installation
      ? { motDePasse }
      : { email, motDePasse, code2fa: code2fa || undefined };

    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = await reponse.json();
    if (!reponse.ok) {
      setErreur(donnees.erreur ?? 'Connexion refusée.');
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        demarrer(soumettre);
      }}
    >
      {!installation && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ardoise-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
            autoComplete="username"
          />
        </label>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-ardoise-500">
          {installation ? 'Choisissez votre mot de passe (10 caractères minimum)' : 'Mot de passe'}
        </span>
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
          autoComplete={installation ? 'new-password' : 'current-password'}
        />
      </label>

      {installation && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ardoise-500">Confirmez le mot de passe</span>
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
            autoComplete="new-password"
          />
        </label>
      )}

      {!installation && deuxFacteurs && (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ardoise-500">Code 2FA (6 chiffres)</span>
          <input
            value={code2fa}
            onChange={(e) => setCode2fa(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            className="w-full rounded-lg border border-ardoise-200 px-3 py-2 tracking-widest"
            autoComplete="one-time-code"
          />
        </label>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="w-full rounded-lg bg-ardoise-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enCours
          ? installation
            ? 'Création…'
            : 'Connexion…'
          : installation
            ? 'Créer mon accès'
            : 'Se connecter'}
      </button>

      {erreur && <p className="text-sm text-rose-600">{erreur}</p>}

      {installation && (
        <p className="text-xs text-ardoise-500">
          Ce mot de passe est chiffré (scrypt) et conservé avec vos données. Vous pourrez le
          remplacer par la variable <code>AUTH_PASSWORD_HASH</code> pour un déploiement en ligne.
        </p>
      )}

      {demo && !installation && (
        <p className="text-xs text-ardoise-500">
          Mode démo : mot de passe <code>demo</code>.
        </p>
      )}
    </form>
  );
}
