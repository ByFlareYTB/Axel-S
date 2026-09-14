import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { getParametres } from '@/lib/repositories';

const Corps = z.object({ cle: z.string().min(1), valeur: z.string() });

export async function GET() {
  return ok(await getParametres());
}

export async function PATCH(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Requête invalide.');

    const existant = await db.get('parametres', corps.data.cle);
    if (existant) {
      await db.update('parametres', corps.data.cle, { valeur: corps.data.valeur });
    } else {
      await db.insert('parametres', { cle: corps.data.cle, valeur: corps.data.valeur, description: null });
    }
    return ok({ ok: true });
  } catch (err) {
    return erreurInterne(err);
  }
}
