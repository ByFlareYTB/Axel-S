// ---------------------------------------------------------------------------
// API Vercel : création du projet, déploiement preview (test) puis production.
// Aucune manipulation manuelle n'est requise côté exploitant.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';
import { requeteJson } from './http';

const API = 'https://api.vercel.com';

function params(): string {
  return config.vercel.teamId ? `?teamId=${encodeURIComponent(config.vercel.teamId)}` : '';
}

function entetes(): Record<string, string> {
  return {
    authorization: `Bearer ${config.vercel.token}`,
    'content-type': 'application/json',
  };
}

export interface FichierDeploiement {
  chemin: string;
  contenu: string;
}

export interface Deploiement {
  id: string;
  url: string;
  environnement: 'preview' | 'production';
}

export async function creerProjet(nom: string): Promise<{ id: string; nom: string }> {
  const reponse = await requeteJson<{ id: string; name: string }>(
    'Vercel',
    `${API}/v11/projects${params()}`,
    { method: 'POST', headers: entetes(), body: JSON.stringify({ name: nom }) },
  );
  return { id: reponse.id, nom: reponse.name };
}

/** Déploie un ensemble de fichiers statiques et renvoie l'URL obtenue. */
export async function deployer(
  nomProjet: string,
  fichiers: FichierDeploiement[],
  environnement: 'preview' | 'production',
): Promise<Deploiement> {
  const reponse = await requeteJson<{ id: string; url: string }>(
    'Vercel',
    `${API}/v13/deployments${params()}`,
    {
      method: 'POST',
      headers: entetes(),
      body: JSON.stringify({
        name: nomProjet,
        target: environnement === 'production' ? 'production' : undefined,
        files: fichiers.map((f) => ({ file: f.chemin, data: f.contenu, encoding: 'utf-8' })),
        projectSettings: { framework: null },
      }),
      timeoutMs: 60_000,
    },
  );
  return { id: reponse.id, url: `https://${reponse.url}`, environnement };
}

/** Rattache un domaine personnalisé au projet (bascule en production). */
export async function ajouterDomaine(projetId: string, domaine: string): Promise<void> {
  try {
    await requeteJson('Vercel', `${API}/v10/projects/${projetId}/domains${params()}`, {
      method: 'POST',
      headers: entetes(),
      body: JSON.stringify({ name: domaine }),
    });
  } catch (err) {
    // Un domaine déjà rattaché n'est pas une erreur : c'est le cas normal
    // d'une remise en production du même site.
    const message = err instanceof Error ? err.message : String(err);
    if (!/domain_already_in_use|already exists|conflict/i.test(message)) throw err;
  }
}

/**
 * État réel d'un domaine rattaché au projet.
 *
 * Rattacher un domaine ne le rend pas joignable : tant que le DNS ne pointe
 * pas vers l'hébergeur, Vercel le déclare non vérifié et ne délivre aucun
 * certificat. Le distinguer évite d'annoncer au client un site en ligne qui
 * ouvre sur une erreur.
 */
export async function etatDomaine(
  projetId: string,
  domaine: string,
): Promise<{ verifie: boolean; raison: string | null }> {
  const reponse = await requeteJson<{ verified?: boolean; verification?: { reason?: string }[] }>(
    'Vercel',
    `${API}/v9/projects/${projetId}/domains/${encodeURIComponent(domaine)}${params()}`,
    { headers: entetes() },
  );
  return {
    verifie: reponse.verified === true,
    raison: reponse.verification?.[0]?.reason ?? null,
  };
}
