import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { rechercherProspects } from '@/lib/pipeline/prospection';

const Corps = z.object({
  secteur: z.string().min(2),
  codePostal: z.string().regex(/^\d{5}$/).optional(),
  departement: z.string().optional(),
  limite: z.number().int().min(1).max(25).optional(),
});

export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Critères de recherche invalides.');
    return ok(await rechercherProspects(corps.data));
  } catch (err) {
    return erreurInterne(err);
  }
}
