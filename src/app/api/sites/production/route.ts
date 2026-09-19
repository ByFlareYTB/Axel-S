import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { mettreEnProduction } from '@/lib/pipeline/site';

const Corps = z.object({ siteId: z.string().min(1), domaine: z.string().optional() });

export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Requête invalide.');
    return ok(await mettreEnProduction(corps.data.siteId, corps.data.domaine));
  } catch (err) {
    return erreurInterne(err);
  }
}
