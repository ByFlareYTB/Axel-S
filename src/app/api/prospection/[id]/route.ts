import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { convertirEnClient } from '@/lib/pipeline/prospection';
import type { Prospect } from '@/lib/types';

const Corps = z.object({
  statut: z.enum(['non_vu', 'en_attente', 'client', 'refuse']).optional(),
  prix_concurrence_min: z.number().nullable().optional(),
  prix_concurrence_max: z.number().nullable().optional(),
  notes_ia: z.string().nullable().optional(),
});

export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Requête invalide.');

    const prospect = await db.update<Prospect>('prospects', id, corps.data);
    if (!prospect) return erreur('Prospect introuvable.', 404);

    // Le passage au statut ✅ crée la fiche client et ouvre le pipeline de génération.
    if (corps.data.statut === 'client') {
      const { clientId } = await convertirEnClient(id);
      return ok({ prospect, clientId });
    }

    if (prospect.siret) {
      const historique = await db.findOne<{ id: string }>('prospects_history', { siret: prospect.siret });
      if (historique) {
        await db.update('prospects_history', historique.id, {
          dernier_statut: prospect.statut,
          dernier_contact: new Date().toISOString(),
        });
      }
    }

    return ok({ prospect });
  } catch (err) {
    return erreurInterne(err);
  }
}
