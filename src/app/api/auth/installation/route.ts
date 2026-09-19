import { z } from 'zod';
import { erreur, erreurInterne, ok } from '@/lib/api';
import { ouvrirSession } from '@/lib/auth/session';
import { definirMotDePasseInitial, installationRequise } from '@/lib/auth/identifiants';
import { config } from '@/lib/config';

const Corps = z.object({ motDePasse: z.string().min(10) });

/** Indique si l'application attend encore la définition d'un mot de passe. */
export async function GET() {
  return ok({ installationRequise: await installationRequise() });
}

/**
 * Définit le mot de passe au premier lancement et ouvre la session.
 *
 * Route publique par nécessité — c'est le seul moment où l'on ne peut pas
 * être authentifié. `definirMotDePasseInitial` refuse donc tout second appel
 * une fois un mot de passe en place.
 */
export async function POST(requete: Request) {
  try {
    const corps = Corps.safeParse(await requete.json());
    if (!corps.success) {
      return erreur('Le mot de passe doit faire au moins 10 caractères.');
    }

    await definirMotDePasseInitial(corps.data.motDePasse);
    await ouvrirSession(config.auth.email);
    return ok({ ok: true }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('déjà défini')) {
      return erreur(err.message, 409);
    }
    return erreurInterne(err);
  }
}
