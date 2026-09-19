// ---------------------------------------------------------------------------
// API Cloudflare : sous-domaine de test, domaine de production, SSL.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';
import { requeteJson } from './http';

const API = 'https://api.cloudflare.com/client/v4';

function entetes(): Record<string, string> {
  return {
    authorization: `Bearer ${config.cloudflare.token}`,
    'content-type': 'application/json',
  };
}

interface ReponseCf<T> {
  success: boolean;
  errors: { message: string }[];
  result: T;
}

export interface EnregistrementDns {
  id: string;
  nom: string;
  contenu: string;
  proxifie: boolean;
}

/** Crée (ou met à jour) un CNAME pointant vers l'hébergement Vercel. */
export async function creerCname(sousDomaine: string, cible: string): Promise<EnregistrementDns> {
  const nom = sousDomaine.endsWith(config.cloudflare.rootDomain)
    ? sousDomaine
    : `${sousDomaine}.${config.cloudflare.rootDomain}`;

  const reponse = await requeteJson<ReponseCf<{ id: string; name: string; content: string; proxied: boolean }>>(
    'Cloudflare',
    `${API}/zones/${config.cloudflare.zoneId}/dns_records`,
    {
      method: 'POST',
      headers: entetes(),
      body: JSON.stringify({ type: 'CNAME', name: nom, content: cible, proxied: true, ttl: 1 }),
    },
  );

  if (!reponse.success) {
    throw new Error(`Cloudflare : ${reponse.errors.map((e) => e.message).join(', ')}`);
  }
  return {
    id: reponse.result.id,
    nom: reponse.result.name,
    contenu: reponse.result.content,
    proxifie: reponse.result.proxied,
  };
}

export async function statutSsl(): Promise<string> {
  const reponse = await requeteJson<ReponseCf<{ value: string }>>(
    'Cloudflare',
    `${API}/zones/${config.cloudflare.zoneId}/settings/ssl`,
    { headers: entetes() },
  );
  return reponse.success ? reponse.result.value : 'inconnu';
}

export async function supprimerEnregistrement(recordId: string): Promise<void> {
  await requeteJson('Cloudflare', `${API}/zones/${config.cloudflare.zoneId}/dns_records/${recordId}`, {
    method: 'DELETE',
    headers: entetes(),
  });
}
