import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { restaurer } from '@/lib/pipeline/site';
import type { Site } from '@/lib/types';

const Corps = z.object({
  statut: z.enum(['brouillon', 'test', 'production', 'maintenance', 'hors_ligne']).optional(),
  nom: z.string().optional(),
  /** Restaure la sauvegarde : elle redevient la production. */
  restaurerSauvegarde: z.boolean().optional(),
});

export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Requête invalide.');

    if (corps.data.restaurerSauvegarde) {
      return ok({ site: await restaurer(id) });
    }

    const { restaurerSauvegarde: _ignore, ...patch } = corps.data;
    const site = await db.update<Site>('sites', id, patch);
    if (!site) return erreur('Site introuvable.', 404);
    return ok({ site });
  } catch (err) {
    return erreurInterne(err);
  }
}
