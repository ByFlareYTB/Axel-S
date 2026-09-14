#!/usr/bin/env node
/** Génère un secret TOTP base32 + l'URI otpauth:// à scanner. */
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const bytes = randomBytes(20);
let bits = '';
for (const b of bytes) bits += b.toString(2).padStart(8, '0');
let secret = '';
for (let i = 0; i + 5 <= bits.length; i += 5) {
  secret += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
}

const label = encodeURIComponent(process.argv[2] ?? 'contact@siteforge.ai');
console.log(`AUTH_TOTP_SECRET=${secret}`);
console.log(`otpauth://totp/SiteForge%20AI:${label}?secret=${secret}&issuer=SiteForge%20AI&digits=6&period=30`);
