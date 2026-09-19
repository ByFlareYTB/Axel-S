// ---------------------------------------------------------------------------
// TOTP (RFC 6238) implémenté avec node:crypto — compatible Google
// Authenticator, Authy, 1Password. Aucune dépendance externe.
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function decoderBase32(secret: string): Buffer {
  const propre = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const caractere of propre) {
    const index = ALPHABET.indexOf(caractere);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const octets: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    octets.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(octets);
}

export function genererCode(secret: string, compteur: number): string {
  const cle = decoderBase32(secret);
  const tampon = Buffer.alloc(8);
  tampon.writeBigUInt64BE(BigInt(compteur));

  const hmac = createHmac('sha1', cle).update(tampon).digest();
  const decalage = hmac[hmac.length - 1] & 0x0f;
  const binaire =
    ((hmac[decalage] & 0x7f) << 24) |
    ((hmac[decalage + 1] & 0xff) << 16) |
    ((hmac[decalage + 2] & 0xff) << 8) |
    (hmac[decalage + 3] & 0xff);

  return String(binaire % 1_000_000).padStart(6, '0');
}

/**
 * Vérifie un code à 6 chiffres. Une fenêtre de ±1 pas (30 s) absorbe la
 * dérive d'horloge du téléphone.
 */
export function verifierCode(secret: string, code: string, fenetre = 1): boolean {
  const propre = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(propre)) return false;

  const pas = Math.floor(Date.now() / 1000 / 30);
  for (let decalage = -fenetre; decalage <= fenetre; decalage++) {
    const attendu = genererCode(secret, pas + decalage);
    if (
      attendu.length === propre.length &&
      timingSafeEqual(Buffer.from(attendu), Buffer.from(propre))
    ) {
      return true;
    }
  }
  return false;
}
