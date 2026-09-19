import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { genererEtDeployerTest } from '@/lib/pipeline/site';

const Corps = z.object({
  clientId: z.string().min(1),
  siteId: z.string().optional(),
  nbPages: z.number().int().min(3).max(20).optional(),
  options: z.array(z.string()).optional(),
  retours: z.string().optional(),
});

export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Paramètres de génération invalides.');
    return ok(await genererEtDeployerTest(corps.data));
  } catch (err) {
    return erreurInterne(err);
  }
}
