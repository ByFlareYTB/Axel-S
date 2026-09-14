// ---------------------------------------------------------------------------
// Point d'entrée unique de l'accès aux données.
// Le choix de l'adaptateur (démo en mémoire ou PostgreSQL) est fait ici et
// nulle part ailleurs : le reste du code ignore d'où viennent les lignes.
// ---------------------------------------------------------------------------

import { DEMO_MODE } from '@/lib/config';
import { demoSource } from './demo-source';
import { pgSource } from './pg-source';
import type { DataSource } from './schema';

export const db: DataSource = DEMO_MODE ? demoSource : pgSource;

export type { DataSource, TableName } from './schema';
export { TABLES } from './schema';
