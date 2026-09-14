#!/usr/bin/env node
/** Génère le hash scrypt à placer dans AUTH_PASSWORD_HASH. */
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage : node scripts/hash-password.mjs "monMotDePasse"');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
console.log(`AUTH_PASSWORD_HASH=scrypt:${salt}:${hash}`);
