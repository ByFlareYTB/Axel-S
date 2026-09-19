// ---------------------------------------------------------------------------
// Point d'entrée unique de l'accès aux données.
//
// Trois adaptateurs, un seul endroit qui choisit — le reste du code ignore
// d'où viennent les lignes :
//
//   1. DATABASE_URL renseigné  → PostgreSQL (Supabase). Recommandé en ligne.
//   2. sinon                   → fichier JSON local, persistant. Production
//                                immédiate, sans infrastructure à provisionner.
//   3. DEMO_MODE=true          → mémoire volatile, données fictives. Réservé
//                                aux démonstrations et aux essais.
// ---------------------------------------------------------------------------

import { DEMO_MODE, config } from '@/lib/config';
import { demoSource } from './demo-source';
import { fileSource } from './file-source';
import { pgSource } from './pg-source';
import type { DataSource } from './schema';

export const db: DataSource = DEMO_MODE
  ? demoSource
  : config.database.url
    ? pgSource
    : fileSource;

/** Libellé du stockage actif, affiché dans les Paramètres. */
export function stockageActif(): string {
  if (DEMO_MODE) return 'Mémoire (mode démo — données fictives, non persistées)';
  if (config.database.url) return 'PostgreSQL (Supabase)';
  return 'Fichier local persistant';
}

export type { DataSource, TableName } from './schema';
export { TABLES } from './schema';
