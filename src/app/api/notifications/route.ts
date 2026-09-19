import { erreurInterne, ok } from '@/lib/api';
import { compterNonLues, listerNotifications, purgerAnciennes, toutMarquerLu } from '@/lib/notifications';

export async function GET() {
  try {
    // La purge se fait à la lecture : aucune tâche planifiée à maintenir.
    await purgerAnciennes();
    const [notifications, nonLues] = await Promise.all([listerNotifications(), compterNonLues()]);
    return ok({ notifications, nonLues });
  } catch (err) {
    return erreurInterne(err);
  }
}

/** Marque toutes les notifications comme lues. */
export async function POST() {
  try {
    return ok({ marquees: await toutMarquerLu() });
  } catch (err) {
    return erreurInterne(err);
  }
}
