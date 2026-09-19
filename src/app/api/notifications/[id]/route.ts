import { erreur, erreurInterne, ok } from '@/lib/api';
import { marquerLue } from '@/lib/notifications';

export async function PATCH(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const notification = await marquerLue(id);
    if (!notification) return erreur('Notification introuvable.', 404);
    return ok({ notification });
  } catch (err) {
    return erreurInterne(err);
  }
}
