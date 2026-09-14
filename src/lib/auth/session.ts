// ---------------------------------------------------------------------------
// Authentification mono-utilisateur : mot de passe scrypt + 2FA TOTP,
// session portée par un cookie signé HMAC (aucune table de sessions).
// ---------------------------------------------------------------------------

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { hashMotDePasse, secretTotp, verifierHash } from './identifiants';
import { DUREE_SESSION_MS, NOM_COOKIE, creerJeton, verifierJeton } from './token';
import { verifierCode } from './totp';

export { creerJeton, verifierJeton };

export { verifierHash as verifierMotDePasse } from './identifiants';

export interface TentativeConnexion {
  email: string;
  motDePasse: string;
  code2fa?: string;
}

export async function authentifier(
  tentative: TentativeConnexion,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (tentative.email.toLowerCase() !== config.auth.email.toLowerCase()) {
    return { ok: false, erreur: 'Identifiants invalides.' };
  }

  const hash = await hashMotDePasse();

  // En démo, un mot de passe fixe suffit : aucune donnée réelle n'est exposée.
  const motDePasseValide = hash
    ? verifierHash(tentative.motDePasse, hash)
    : config.demo && tentative.motDePasse === config.auth.demoPassword;

  if (!motDePasseValide) return { ok: false, erreur: 'Identifiants invalides.' };

  const secret = await secretTotp();
  if (secret) {
    if (!tentative.code2fa) return { ok: false, erreur: 'Code 2FA requis.' };
    if (!verifierCode(secret, tentative.code2fa)) {
      return { ok: false, erreur: 'Code 2FA invalide.' };
    }
  }

  return { ok: true };
}

export async function ouvrirSession(email: string): Promise<void> {
  const store = await cookies();
  store.set(NOM_COOKIE, await creerJeton(email, config.auth.sessionSecret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DUREE_SESSION_MS / 1000,
  });
}

export async function fermerSession(): Promise<void> {
  const store = await cookies();
  store.delete(NOM_COOKIE);
}

export async function sessionCourante(): Promise<{ email: string } | null> {
  const store = await cookies();
  return verifierJeton(store.get(NOM_COOKIE)?.value, config.auth.sessionSecret);
}

export function nomCookie(): string {
  return NOM_COOKIE;
}

/** Secret de session jetable, pour le message d'avertissement en production. */
export function secretParDefaut(): boolean {
  return config.auth.sessionSecret === 'dev-session-secret-change-me-please-32chars';
}

export function genererSecret(): string {
  return randomBytes(32).toString('base64url');
}
