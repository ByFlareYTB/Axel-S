// ---------------------------------------------------------------------------
// Adaptateur de production « sans infrastructure ».
//
// Les données sont conservées dans un fichier JSON sur disque : l'application
// est immédiatement utilisable en production, avec de vraies données qui
// survivent aux redémarrages, sans exiger de base PostgreSQL.
//
// Dès que DATABASE_URL est renseigné, c'est l'adaptateur PostgreSQL qui prend
// le relais (voir src/lib/db/index.ts) : ce store est le point de départ, pas
// une impasse.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DataSource, QueryOptions, TableName } from './schema';
import { PRIMARY_KEYS, TABLES } from './schema';
import { donneesInitiales } from '@/lib/demo/seed';

type Row = Record<string, unknown>;
type Contenu = Partial<Record<TableName, Row[]>>;

/**
 * Plateformes dont le système de fichiers est éphémère et non partagé entre
 * instances : Vercel, AWS Lambda, Netlify.
 *
 * Y écrire des données donne l'illusion de fonctionner — les écritures
 * réussissent — puis tout disparaît au redéploiement suivant ou sur une autre
 * instance. Pour une comptabilité, c'est la pire panne possible : silencieuse.
 */
function plateformeEphemere(): string | null {
  if (process.env.VERCEL) return 'Vercel';
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 'AWS Lambda';
  if (process.env.NETLIFY) return 'Netlify';
  return null;
}

/**
 * Le chemin est résolu à chaque appel, jamais figé au chargement du module :
 * cela évite une dépendance silencieuse à l'ordre des imports, et permet de
 * changer DATA_FILE sans redémarrer le processus.
 */
function chemin(): string {
  return resolve(process.env.DATA_FILE?.trim() || resolve(process.cwd(), '.data', 'siteforge.json'));
}

/**
 * Le contenu est gardé en mémoire et réécrit intégralement à chaque mutation.
 * À l'échelle d'une microentreprise (quelques milliers de lignes au plus), le
 * coût est négligeable et la simplicité évite toute une classe de bugs.
 *
 * Le cache retient le chemin dont il provient : si DATA_FILE change, il est
 * rechargé au lieu de servir les données de l'ancien fichier.
 */
const global_ = globalThis as unknown as {
  __siteforgeFichier?: { chemin: string; tables: Map<TableName, Row[]> };
};

function charger(): Map<TableName, Row[]> {
  const plateforme = plateformeEphemere();
  if (plateforme) {
    throw new Error(
      `Stockage fichier impossible sur ${plateforme} : son système de fichiers est éphémère, ` +
        'vos clients, devis et factures seraient effacés au prochain déploiement. ' +
        'Renseignez DATABASE_URL avec une base PostgreSQL (Supabase propose une offre gratuite), ' +
        'puis lancez les migrations avec `npm run db:migrate`.' +
        // Le piège d'après : la variable existe, mais pas pour l'environnement
        // qui exécute ce déploiement. Une préproduction ne voit pas les
        // variables réservées à la production, et l'erreur est la même.
        (plateforme === 'Vercel'
          ? ' Si DATABASE_URL y figure déjà, vérifiez qu’elle est cochée pour TOUS les ' +
            'environnements — Production, Preview et Development : un déploiement de ' +
            'préproduction ne voit pas les variables réservées à la production.'
          : ''),
    );
  }

  const fichier = chemin();
  const cache = global_.__siteforgeFichier;
  if (cache && cache.chemin === fichier) return cache.tables;

  let contenu: Contenu = {};
  try {
    contenu = JSON.parse(readFileSync(fichier, 'utf8')) as Contenu;
  } catch {
    // Premier démarrage : on amorce avec la configuration seule (grille
    // tarifaire, offres, paramètres). Aucune donnée commerciale fictive.
    contenu = donneesInitiales();
  }

  const tables = new Map<TableName, Row[]>();
  for (const table of TABLES) tables.set(table, contenu[table] ?? []);
  global_.__siteforgeFichier = { chemin: fichier, tables };
  ecrire();
  return tables;
}

/** Écriture atomique : fichier temporaire puis renommage, jamais de fichier tronqué. */
function ecrire(): void {
  const cache = global_.__siteforgeFichier;
  if (!cache) return;

  const contenu: Contenu = {};
  for (const [table, lignes] of cache.tables) contenu[table] = lignes;

  mkdirSync(dirname(cache.chemin), { recursive: true });
  const temporaire = `${cache.chemin}.tmp`;
  writeFileSync(temporaire, JSON.stringify(contenu, null, 2), 'utf8');
  renameSync(temporaire, cache.chemin);
}

function lignes(table: TableName): Row[] {
  const tables = charger();
  const existantes = tables.get(table);
  if (existantes) return existantes;
  const creees: Row[] = [];
  tables.set(table, creees);
  return creees;
}

function correspond(ligne: Row, filtre: Record<string, unknown>): boolean {
  return Object.entries(filtre).every(([cle, valeur]) => {
    if (Array.isArray(valeur)) return valeur.includes(ligne[cle] as never);
    return ligne[cle] === valeur;
  });
}

function trier<T>(liste: Row[], options?: QueryOptions<T>): Row[] {
  if (!options?.orderBy) return liste;
  const cle = options.orderBy as string;
  const sens = options.dir === 'desc' ? -1 : 1;
  return [...liste].sort((a, b) => {
    const va = a[cle];
    const vb = b[cle];
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return (va < vb ? -1 : 1) * sens;
  });
}

export const fileSource: DataSource = {
  kind: 'fichier',

  async list<T>(table: TableName, filtre: Record<string, unknown> = {}, options?: QueryOptions<T>) {
    let resultat = lignes(table).filter((ligne) => correspond(ligne, filtre));
    resultat = trier(resultat, options);
    if (options?.limit) resultat = resultat.slice(0, options.limit);
    return resultat.map((ligne) => ({ ...ligne })) as T[];
  },

  async get<T>(table: TableName, id: string) {
    const cle = PRIMARY_KEYS[table];
    const trouvee = lignes(table).find((ligne) => ligne[cle] === id);
    return trouvee ? ({ ...trouvee } as T) : null;
  },

  async findOne<T>(table: TableName, filtre: Record<string, unknown>) {
    const trouvee = lignes(table).find((ligne) => correspond(ligne, filtre));
    return trouvee ? ({ ...trouvee } as T) : null;
  },

  async insert<T>(table: TableName, ligne: Record<string, unknown>) {
    const cle = PRIMARY_KEYS[table];
    const maintenant = new Date().toISOString();
    const enregistrement: Row = {
      ...(cle === 'id' ? { id: randomUUID() } : {}),
      created_at: maintenant,
      updated_at: maintenant,
      ...ligne,
    };
    lignes(table).push(enregistrement);
    ecrire();
    return { ...enregistrement } as T;
  },

  async update<T>(table: TableName, id: string, patch: Record<string, unknown>) {
    const cle = PRIMARY_KEYS[table];
    const cible = lignes(table).find((ligne) => ligne[cle] === id);
    if (!cible) return null;
    Object.assign(cible, patch, { updated_at: new Date().toISOString() });
    ecrire();
    return { ...cible } as T;
  },

  async remove(table: TableName, id: string) {
    const cle = PRIMARY_KEYS[table];
    const liste = lignes(table);
    const index = liste.findIndex((ligne) => ligne[cle] === id);
    if (index === -1) return false;
    liste.splice(index, 1);
    ecrire();
    return true;
  },

  async count(table: TableName, filtre: Record<string, unknown> = {}) {
    return lignes(table).filter((ligne) => correspond(ligne, filtre)).length;
  },
};

/** Chemin du fichier de données, affiché dans les Paramètres. */
export function cheminFichierDonnees(): string {
  return chemin();
}
