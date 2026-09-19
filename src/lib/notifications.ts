// ---------------------------------------------------------------------------
// Notifications internes.
//
// Tout ce qui se produit sans que vous soyez devant l'écran remonte ici :
// un email reçu, un client qui confirme, un paiement encaissé ou échoué, une
// marge sous le seuil. La cloche de la barre de navigation affiche le nombre
// de notifications non lues.
//
// Règle de conception : une notification décrit un fait déjà arrivé et pointe
// vers l'endroit où agir. Elle ne remplace jamais une alerte temps réel
// (Telegram/Slack), qui sert, elle, à vous joindre hors de l'application.
// ---------------------------------------------------------------------------

import { db } from '@/lib/db';
import { alerter } from '@/lib/integrations/alertes';
import { PRESENTATION, type Notification, type TypeNotification } from './notifications-types';

export { LIBELLES, PRESENTATION } from './notifications-types';
export type { NiveauNotification, Notification, TypeNotification } from './notifications-types';

export interface NouvelleNotification {
  type: TypeNotification;
  titre: string;
  message: string;
  lien?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  /** Pousse aussi vers Telegram/Slack. Réservé à ce qui ne peut pas attendre. */
  urgent?: boolean;
}

/**
 * Enregistre une notification.
 *
 * Volontairement tolérante aux pannes : une notification qui échoue ne doit
 * jamais faire échouer l'action métier qui l'a déclenchée. Un paiement
 * encaissé reste encaissé même si la cloche ne s'allume pas.
 */
export async function notifier(nouvelle: NouvelleNotification): Promise<Notification | null> {
  try {
    const presentation = PRESENTATION[nouvelle.type];
    const notification = await db.insert<Notification>('notifications', {
      type: nouvelle.type,
      niveau: presentation.niveau,
      titre: nouvelle.titre,
      message: nouvelle.message,
      lien: nouvelle.lien ?? null,
      client_id: nouvelle.clientId ?? null,
      site_id: nouvelle.siteId ?? null,
      lu: false,
      lu_le: null,
      created_at: new Date().toISOString(),
    });

    if (nouvelle.urgent) {
      await alerter(`${presentation.emoji} ${nouvelle.titre} — ${nouvelle.message}`);
    }

    return notification;
  } catch (err) {
    console.error('[notifications] enregistrement impossible :', err);
    return null;
  }
}

export async function listerNotifications(limite = 50): Promise<Notification[]> {
  return db.list<Notification>('notifications', {}, {
    orderBy: 'created_at',
    dir: 'desc',
    limit: limite,
  });
}

export async function compterNonLues(): Promise<number> {
  return db.count('notifications', { lu: false });
}

export async function marquerLue(id: string): Promise<Notification | null> {
  return db.update<Notification>('notifications', id, {
    lu: true,
    lu_le: new Date().toISOString(),
  });
}

export async function toutMarquerLu(): Promise<number> {
  const nonLues = await db.list<Notification>('notifications', { lu: false });
  const maintenant = new Date().toISOString();
  for (const notification of nonLues) {
    await db.update('notifications', notification.id, { lu: true, lu_le: maintenant });
  }
  return nonLues.length;
}

/**
 * Purge les notifications lues au-delà de la durée de conservation.
 * Appelée à la lecture de la liste : pas de tâche planifiée à maintenir.
 */
export async function purgerAnciennes(): Promise<number> {
  const jours = Number(process.env.NOTIFICATIONS_RETENTION_JOURS ?? 30);
  if (!Number.isFinite(jours) || jours <= 0) return 0;

  const limite = Date.now() - jours * 86_400_000;
  const lues = await db.list<Notification>('notifications', { lu: true });
  let supprimees = 0;
  for (const notification of lues) {
    if (new Date(notification.created_at).getTime() < limite) {
      await db.remove('notifications', notification.id);
      supprimees++;
    }
  }
  return supprimees;
}
