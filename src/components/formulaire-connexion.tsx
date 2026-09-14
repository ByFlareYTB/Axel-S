'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function FormulaireConnexion({
  emailParDefaut,
  demo,
  deuxFacteurs,
}: {
  emailParDefaut: string;
  demo: boolean;
  deuxFacteurs: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(emailParDefaut);
  const [motDePasse, setMotDePasse] = useState('');
  const [code2fa, setCode2fa] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  async function connecter() {
    setErreur(null);
    const reponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, motDePasse, code2fa: code2fa || undefined }),
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
        demarrer(connecter);
      }}
    >
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

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-ardoise-500">Mot de passe</span>
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="w-full rounded-lg border border-ardoise-200 px-3 py-2"
          autoComplete="current-password"
        />
      </label>

      {deuxFacteurs && (
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
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>

      {erreur && <p className="text-sm text-rose-600">{erreur}</p>}

      {demo && (
        <p className="text-xs text-ardoise-500">
          Mode démo : mot de passe <code>demo</code>. Générez un vrai hash avec{' '}
          <code>node scripts/hash-password.mjs</code>.
        </p>
      )}
    </form>
  );
}
