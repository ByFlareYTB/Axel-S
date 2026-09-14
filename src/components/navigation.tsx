'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClocheNotifications } from '@/components/cloche-notifications';

const LIENS = [
  { href: '/', label: 'Dashboard', emoji: '📊' },
  { href: '/prospection', label: 'Recherche client', emoji: '🔎' },
  { href: '/clients', label: 'Clients', emoji: '👤' },
  { href: '/sites', label: 'Sites créés', emoji: '🌐' },
  { href: '/facturation', label: 'Facturation', emoji: '🧾' },
  { href: '/hebergement', label: 'Hébergement', emoji: '☁️' },
  { href: '/ads', label: 'Publicité', emoji: '📣' },
  { href: '/parametres', label: 'Paramètres', emoji: '⚙️' },
];

export function Navigation() {
  const chemin = usePathname();

  return (
    <nav className="shrink-0 border-b border-ardoise-200 bg-white lg:w-60 lg:border-r lg:border-b-0">
      <div className="flex items-start justify-between gap-2 px-4 py-4 lg:px-5 lg:py-6">
        <Link href="/" className="block min-w-0">
          <span className="block truncate text-base font-semibold tracking-tight">SiteForge AI</span>
          <span className="mt-0.5 block text-xs text-ardoise-500">Monts, Centre-Val de Loire</span>
        </Link>
        <ClocheNotifications />
      </div>

      <ul className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
        {LIENS.map((lien) => {
          const actif = lien.href === '/' ? chemin === '/' : chemin.startsWith(lien.href);
          return (
            <li key={lien.href} className="shrink-0 lg:shrink">
              <Link
                href={lien.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
                  actif ? 'bg-ardoise-900 text-white' : 'text-ardoise-700 hover:bg-ardoise-100'
                }`}
              >
                <span aria-hidden>{lien.emoji}</span>
                {lien.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
