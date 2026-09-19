'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESENTATION, type Notification } from '@/lib/notifications-types';

const TONS: Record<string, string> = {
  info: 'text-sky-700',
  succes: 'text-emerald-700',
  alerte: 'text-rose-700',
};

/** « il y a 5 min », « il y a 2 h », « hier »… */
function ilYA(iso: string): string {
  const secondes = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secondes < 60) return "à l'instant";
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours === 1) return 'hier';
  if (jours < 30) return `il y a ${jours} j`;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(iso));
}

/**
 * Cloche de notifications : compteur de non-lues et panneau déroulant.
 *
 * Rafraîchissement par interrogation toutes les 30 secondes — suffisant pour
 * un usage mono-utilisateur, et sans connexion permanente à maintenir.
 */
export function ClocheNotifications() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch('/api/notifications');
      if (!reponse.ok) return;
      const donnees = await reponse.json();
      setNotifications(donnees.notifications);
      setNonLues(donnees.nonLues);
    } catch {
      // Hors ligne ou session expirée : la cloche garde son dernier état.
    }
  }, []);

  useEffect(() => {
    void charger();
    const minuteur = setInterval(charger, 30_000);
    return () => clearInterval(minuteur);
  }, [charger]);

  // Fermeture au clic extérieur et à la touche Échap.
  useEffect(() => {
    if (!ouvert) return;
    function auClic(evenement: MouseEvent) {
      if (!conteneur.current?.contains(evenement.target as Node)) setOuvert(false);
    }
    function auClavier(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', auClic);
    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('mousedown', auClic);
      document.removeEventListener('keydown', auClavier);
    };
  }, [ouvert]);

  async function toutMarquer() {
    await fetch('/api/notifications', { method: 'POST' });
    await charger();
    router.refresh();
  }

  async function ouvrirNotification(notification: Notification) {
    if (!notification.lu) {
      await fetch(`/api/notifications/${notification.id}`, { method: 'PATCH' });
      await charger();
    }
    setOuvert(false);
    if (notification.lien) router.push(notification.lien);
  }

  return (
    <div ref={conteneur} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((valeur) => !valeur)}
        aria-label={`Notifications${nonLues > 0 ? ` — ${nonLues} non lue(s)` : ''}`}
        aria-expanded={ouvert}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:bg-ardoise-100"
      >
        <span aria-hidden>🔔</span>
        {nonLues > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white tabular-nums">
            {nonLues > 99 ? '99+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute top-11 right-0 z-50 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ardoise-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-ardoise-200 px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {nonLues > 0 && (
              <button
                type="button"
                onClick={toutMarquer}
                className="text-xs text-sky-700 hover:underline"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <ul className="max-h-[52vh] divide-y divide-ardoise-100 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-ardoise-500">
                Aucune notification pour le moment.
              </li>
            )}
            {notifications.slice(0, 15).map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => ouvrirNotification(notification)}
                  className={`flex w-full gap-2.5 px-3 py-2.5 text-left transition hover:bg-ardoise-50 ${
                    notification.lu ? '' : 'bg-sky-50/60'
                  }`}
                >
                  <span aria-hidden className="mt-0.5 text-base">
                    {PRESENTATION[notification.type]?.emoji ?? '•'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm ${notification.lu ? 'font-normal' : 'font-semibold'} ${
                        TONS[notification.niveau] ?? ''
                      }`}
                    >
                      {notification.titre}
                    </span>
                    <span className="mt-0.5 block text-xs text-ardoise-500">{notification.message}</span>
                    <span className="mt-1 block text-[11px] text-ardoise-400">
                      {ilYA(notification.created_at)}
                    </span>
                  </span>
                  {!notification.lu && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-ardoise-200 px-3 py-2">
            <Link
              href="/notifications"
              onClick={() => setOuvert(false)}
              className="text-xs text-sky-700 hover:underline"
            >
              Voir toutes les notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
