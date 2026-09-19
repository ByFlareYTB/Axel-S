import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { deployerEnTest } from '@/lib/pipeline/site';

const Corps = z.object({ siteId: z.string().min(1) });

/** Met en ligne la version déjà générée, sans nouvel appel à l'IA. */
export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Requête invalide.');
    return ok(await deployerEnTest(corps.data.siteId));
  } catch (err) {
    return erreurInterne(err);
  }
}
