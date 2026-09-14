import Link from 'next/link';
import { Badge, Carte, TitrePage, Vide } from '@/components/ui';
import { dateFr } from '@/lib/config';
import { compterNonLues, listerNotifications } from '@/lib/notifications';
import { LIBELLES, PRESENTATION } from '@/lib/notifications-types';

export const dynamic = 'force-dynamic';

const TONS = { info: 'neutre', succes: 'succes', alerte: 'danger' } as const;

export default async function NotificationsPage() {
  const [notifications, nonLues] = await Promise.all([listerNotifications(200), compterNonLues()]);

  return (
    <>
      <TitrePage
        titre="Notifications"
        sousTitre={
          nonLues > 0
            ? `${nonLues} non lue(s) sur ${notifications.length} au total.`
            : 'Tout est lu. Les notifications lues sont conservées 30 jours.'
        }
      />

      <Carte>
        {notifications.length === 0 ? (
          <Vide message="Aucune notification. Elles apparaîtront ici dès qu'un client répond, qu'un paiement arrive ou qu'une marge passe sous son seuil." />
        ) : (
          <ul className="divide-y divide-ardoise-100">
            {notifications.map((notification) => {
              const contenu = (
                <div
                  className={`flex gap-3 px-1 py-3 ${notification.lu ? '' : 'font-medium'}`}
                >
                  <span aria-hidden className="mt-0.5 text-lg">
                    {PRESENTATION[notification.type]?.emoji ?? '•'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{notification.titre}</span>
                      <Badge ton={TONS[notification.niveau]}>
                        {LIBELLES[notification.type] ?? notification.type}
                      </Badge>
                      {!notification.lu && <Badge ton="info">Non lue</Badge>}
                    </div>
                    <p className="mt-1 text-sm font-normal text-ardoise-700">{notification.message}</p>
                    <p className="mt-1 text-xs text-ardoise-500">{dateFr(notification.created_at)}</p>
                  </div>
                </div>
              );

              return (
                <li key={notification.id} className={notification.lu ? '' : 'bg-sky-50/40'}>
                  {notification.lien ? (
                    <Link href={notification.lien} className="block hover:bg-ardoise-50">
                      {contenu}
                    </Link>
                  ) : (
                    contenu
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </>
  );
}
