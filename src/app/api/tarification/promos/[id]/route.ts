import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import type { OffrePromo } from '@/lib/types';

const Corps = z.object({
  libelle: z.string().optional(),
  valeur: z.number().min(0).optional(),
  duree_mois: z.number().int().min(0).optional(),
  actif: z.boolean().optional(),
  date_debut: z.string().nullable().optional(),
  date_fin: z.string().nullable().optional(),
});

export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Valeurs invalides.');

    const promo = await db.update<OffrePromo>('offres_promo', id, corps.data);
    if (!promo) return erreur('Offre introuvable.', 404);
    return ok({ promo });
  } catch (err) {
    return erreurInterne(err);
  }
}
