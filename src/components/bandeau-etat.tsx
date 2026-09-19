import { config } from '@/lib/config';

/**
 * Bandeau d'état, affiché uniquement quand quelque chose mérite votre
 * attention : mode démo actif, ou secret de session encore celui du dépôt.
 * En production correctement configurée, aucun bandeau n'apparaît.
 */
export function BandeauEtat() {
  if (config.demo) {
    return (
      <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
        Mode démo — données fictives non persistées, aucune API externe appelée. Retirez
        DEMO_MODE=true pour repasser en production.
      </div>
    );
  }

  const secretParDefaut =
    config.auth.sessionSecret === 'dev-session-secret-change-me-please-32chars';

  if (secretParDefaut && process.env.NODE_ENV === 'production') {
    return (
      <div className="bg-rose-600 px-4 py-1.5 text-center text-xs font-medium text-white">
        SESSION_SECRET est encore la valeur d&apos;exemple. Remplacez-la avant d&apos;exposer
        l&apos;application sur Internet.
      </div>
    );
  }

  return null;
}
