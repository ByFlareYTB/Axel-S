// ---------------------------------------------------------------------------
// Identifiants de l'utilisateur unique.
//
// Deux sources, dans cet ordre :
//   1. AUTH_PASSWORD_HASH dans l'environnement — prioritaire, pour un
//      déploiement où les secrets sont gérés hors de l'application.
//   2. la table `parametres`, alimentée à la première connexion.
//
// La seconde existe pour qu'une installation neuve soit utilisable
// immédiatement : au premier lancement, l'écran de connexion propose de
// choisir un mot de passe au lieu d'exiger un hash généré en ligne de commande.
// ---------------------------------------------------------------------------

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '@/lib/config';
import { db } from '@/lib/db';

const CLE_MOT_DE_PASSE = 'auth_password_hash';
const CLE_TOTP = 'auth_totp_secret';

async function parametre(cle: string): Promise<string | null> {
  const ligne = await db.get<{ cle: string; valeur: string }>('parametres', cle);
  return ligne?.valeur?.trim() || null;
}

/** Hash au format `scrypt:<sel>:<empreinte>`. */
export function hacher(motDePasse: string): string {
  const sel = randomBytes(16).toString('hex');
  return `scrypt:${sel}:${scryptSync(motDePasse, sel, 64).toString('hex')}`;
}

export function verifierHash(motDePasse: string, hash: string): boolean {
  const [algo, sel, empreinte] = hash.split(':');
  if (algo !== 'scrypt' || !sel || !empreinte) return false;

  const calcule = scryptSync(motDePasse, sel, 64);
  const attendu = Buffer.from(empreinte, 'hex');
  return calcule.length === attendu.length && timingSafeEqual(calcule, attendu);
}

export async function hashMotDePasse(): Promise<string | null> {
  return config.auth.passwordHash || (await parametre(CLE_MOT_DE_PASSE));
}

export async function secretTotp(): Promise<string | null> {
  return config.auth.totpSecret || (await parametre(CLE_TOTP));
}

/**
 * Vrai tant qu'aucun mot de passe n'a été défini : l'écran de connexion bascule
 * alors en création de compte.
 */
export async function installationRequise(): Promise<boolean> {
  if (config.demo) return false;
  return (await hashMotDePasse()) === null;
}

async function ecrireParametre(cle: string, valeur: string, description: string): Promise<void> {
  const existant = await db.get('parametres', cle);
  if (existant) {
    await db.update('parametres', cle, { valeur });
  } else {
    await db.insert('parametres', { cle, valeur, description });
  }
}

/**
 * Définit le mot de passe initial.
 *
 * Refuse de s'exécuter si un mot de passe existe déjà : sans cette garde, la
 * route d'installation — nécessairement publique — permettrait à n'importe qui
 * de reprendre la main sur l'application.
 */
export async function definirMotDePasseInitial(motDePasse: string): Promise<void> {
  if (!(await installationRequise())) {
    throw new Error('Un mot de passe est déjà défini pour cette application.');
  }
  if (motDePasse.length < 10) {
    throw new Error('Le mot de passe doit faire au moins 10 caractères.');
  }

  await ecrireParametre(
    CLE_MOT_DE_PASSE,
    hacher(motDePasse),
    "Hash scrypt du mot de passe de l'utilisateur unique",
  );
}

/** Change le mot de passe, l'actuel devant être fourni. */
export async function changerMotDePasse(actuel: string, nouveau: string): Promise<void> {
  const hash = await hashMotDePasse();
  if (!hash || !verifierHash(actuel, hash)) {
    throw new Error('Mot de passe actuel incorrect.');
  }
  if (nouveau.length < 10) {
    throw new Error('Le nouveau mot de passe doit faire au moins 10 caractères.');
  }
  if (config.auth.passwordHash) {
    throw new Error(
      'Le mot de passe est défini par AUTH_PASSWORD_HASH : modifiez cette variable d’environnement.',
    );
  }

  await ecrireParametre(
    CLE_MOT_DE_PASSE,
    hacher(nouveau),
    "Hash scrypt du mot de passe de l'utilisateur unique",
  );
}

/** Active la double authentification en enregistrant le secret TOTP. */
export async function activerDeuxFacteurs(secret: string): Promise<void> {
  await ecrireParametre(CLE_TOTP, secret, 'Secret TOTP de la double authentification');
}

export async function desactiverDeuxFacteurs(): Promise<void> {
  if (config.auth.totpSecret) {
    throw new Error('La 2FA est imposée par AUTH_TOTP_SECRET : retirez cette variable.');
  }
  await db.remove('parametres', CLE_TOTP);
}
