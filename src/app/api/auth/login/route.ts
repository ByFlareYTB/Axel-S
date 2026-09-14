import { z } from 'zod';
import { authentifier, ouvrirSession } from '@/lib/auth/session';
import { erreur, erreurInterne, ok } from '@/lib/api';

const Corps = z.object({
  email: z.string().email(),
  motDePasse: z.string().min(1),
  code2fa: z.string().optional(),
});

export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) return erreur('Requête invalide.');

    const resultat = authentifier(corps.data);
    if (!resultat.ok) return erreur(resultat.erreur, 401);

    await ouvrirSession(corps.data.email);
    return ok({ ok: true });
  } catch (err) {
    return erreurInterne(err);
  }
}
