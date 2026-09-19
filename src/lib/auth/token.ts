// ---------------------------------------------------------------------------
// Jeton de session signé, écrit avec la Web Crypto API : le même code
// fonctionne dans le middleware (runtime Edge) et dans les routes Node.
// ---------------------------------------------------------------------------

const encodeur = new TextEncoder();

export const DUREE_SESSION_MS = 12 * 60 * 60 * 1000;
export const NOM_COOKIE = 'siteforge_session';

function base64url(octets: ArrayBuffer): string {
  let binaire = '';
  for (const octet of new Uint8Array(octets)) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function texteVersBase64url(texte: string): string {
  return btoa(unescape(encodeURIComponent(texte)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlVersTexte(valeur: string): string {
  const complete = valeur.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(valeur.length / 4) * 4,
    '=',
  );
  return decodeURIComponent(escape(atob(complete)));
}

async function cle(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encodeur.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signer(charge: string, secret: string): Promise<string> {
  return base64url(await crypto.subtle.sign('HMAC', await cle(secret), encodeur.encode(charge)));
}

export async function creerJeton(email: string, secret: string): Promise<string> {
  const charge = texteVersBase64url(JSON.stringify({ email, exp: Date.now() + DUREE_SESSION_MS }));
  return `${charge}.${await signer(charge, secret)}`;
}

/** Comparaison à temps constant, sans dépendre de node:crypto. */
function egalite(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function verifierJeton(
  jeton: string | undefined,
  secret: string,
): Promise<{ email: string } | null> {
  if (!jeton) return null;
  const [charge, signature] = jeton.split('.');
  if (!charge || !signature) return null;

  if (!egalite(await signer(charge, secret), signature)) return null;

  try {
    const donnees = JSON.parse(base64urlVersTexte(charge)) as { email: string; exp: number };
    return donnees.exp > Date.now() ? { email: donnees.email } : null;
  } catch {
    return null;
  }
}
