// ---------------------------------------------------------------------------
// Sauvegarde unique par site.
//
// Principe : un site n'a jamais plus de deux états conservés.
//
//     production courante  ←  ce que voit le client
//     sauvegarde           ←  l'état précédent, et lui seul
//
// À chaque modification, la production courante descend en sauvegarde (elle
// écrase l'ancienne) et la nouvelle version devient la production. Restaurer,
// c'est échanger les deux.
//
// Ce choix est délibérément plus pauvre qu'un historique complet : deux états
// se raisonnent de tête, se testent exhaustivement, et ne laissent pas
// s'accumuler des versions intermédiaires dont plus personne ne sait si elles
// sont déployées. Un retour en arrière est toujours à un clic, jamais à
// « laquelle des sept ? ».
// ---------------------------------------------------------------------------

import { db } from '@/lib/db';
import type { Site, SiteVersion } from '@/lib/types';

export interface EtatSauvegarde {
  courante: SiteVersion | null;
  sauvegarde: SiteVersion | null;
}

/** Les deux seules versions conservées pour un site. */
export async function etatSauvegarde(site: Site): Promise<EtatSauvegarde> {
  const [courante, sauvegarde] = await Promise.all([
    db.findOne<SiteVersion>('site_versions', { site_id: site.id, version: site.version_actuelle }),
    site.version_sauvegarde
      ? db.findOne<SiteVersion>('site_versions', { site_id: site.id, version: site.version_sauvegarde })
      : Promise.resolve(null),
  ]);
  return { courante, sauvegarde };
}

export interface ContenuVersion {
  libelle: string;
  contenu: Record<string, unknown>;
  promptUtilise: string | null;
  modeleIa: string | null;
  coutIa: number;
  deployUrl: string | null;
}

export interface ResultatEnregistrement {
  version: SiteVersion;
  /** Version qui vient de descendre en sauvegarde, s'il y en avait une. */
  sauvegardee: number | null;
  /** Versions supprimées pour ne garder que les deux états. */
  purgees: number[];
}

/**
 * Enregistre une nouvelle version et fait tourner la sauvegarde.
 *
 * La rotation se fait avant la purge : à aucun moment le site ne se retrouve
 * sans version courante ni sauvegarde exploitable.
 */
export async function enregistrerVersion(
  site: Site,
  contenu: ContenuVersion,
): Promise<ResultatEnregistrement> {
  const nouvelleVersion = site.version_actuelle + 1;

  const version = await db.insert<SiteVersion>('site_versions', {
    site_id: site.id,
    version: nouvelleVersion,
    libelle: contenu.libelle,
    contenu: contenu.contenu,
    prompt_utilise: contenu.promptUtilise,
    modele_ia: contenu.modeleIa,
    cout_ia: contenu.coutIa,
    deploy_url: contenu.deployUrl,
    cree_par: 'ia',
  });

  // La production courante devient la sauvegarde, et écrase la précédente.
  const sauvegardee = site.version_actuelle > 0 ? site.version_actuelle : null;

  const purgees = await purger(site.id, [nouvelleVersion, sauvegardee]);

  return { version, sauvegardee, purgees };
}

/**
 * Restaure la sauvegarde : elle redevient la production, et l'état qu'elle
 * remplace prend sa place comme nouvelle sauvegarde.
 *
 * L'échange est réversible : restaurer deux fois de suite revient au point de
 * départ, ce qui rend l'opération sans risque même déclenchée par erreur.
 */
export async function restaurerSauvegarde(siteId: string): Promise<{
  site: Site;
  restauree: number;
  remplacee: number;
}> {
  const site = await db.get<Site>('sites', siteId);
  if (!site) throw new Error('Site introuvable.');
  if (!site.version_sauvegarde) {
    throw new Error("Aucune sauvegarde disponible pour ce site : il n'a qu'une seule version.");
  }

  const sauvegarde = await db.findOne<SiteVersion>('site_versions', {
    site_id: siteId,
    version: site.version_sauvegarde,
  });
  if (!sauvegarde) {
    throw new Error('La sauvegarde référencée est absente. Relancez une génération.');
  }

  const ancienneCourante = site.version_actuelle;

  const misAJour = await db.update<Site>('sites', siteId, {
    version_actuelle: site.version_sauvegarde,
    version_sauvegarde: ancienneCourante,
    url_test: sauvegarde.deploy_url ?? site.url_test,
  });

  return {
    site: misAJour!,
    restauree: site.version_sauvegarde,
    remplacee: ancienneCourante,
  };
}

/** Supprime toute version qui n'est ni la courante ni la sauvegarde. */
async function purger(siteId: string, aConserver: (number | null)[]): Promise<number[]> {
  const conserver = new Set(aConserver.filter((v): v is number => v !== null));
  const versions = await db.list<SiteVersion>('site_versions', { site_id: siteId });

  const purgees: number[] = [];
  for (const version of versions) {
    if (conserver.has(version.version)) continue;
    await db.remove('site_versions', version.id);
    purgees.push(version.version);
  }
  return purgees.sort((a, b) => a - b);
}
