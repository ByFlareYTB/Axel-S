import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import type { PricingRule } from '@/lib/types';

const Corps = z.object({
  nom: z.string().optional(),
  prix: z.number().min(0).optional(),
  cout_ia_estime: z.number().min(0).optional(),
  cout_hebergement_mensuel: z.number().min(0).optional(),
  description: z.string().nullable().optional(),
  actif: z.boolean().optional(),
  ordre: z.number().int().optional(),
});

/** Ajustement de la grille sans redéploiement (tests de prix, promotions). */
export async function PATCH(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Valeurs invalides.');

    const regle = await db.update<PricingRule>('pricing_rules', id, corps.data);
    if (!regle) return erreur('Ligne tarifaire introuvable.', 404);
    return ok({ regle });
  } catch (err) {
    return erreurInterne(err);
  }
}
