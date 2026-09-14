// ---------------------------------------------------------------------------
// Briques d'interface partagées : cartes de KPI, tableaux, badges de statut,
// jauges de marge. Aucune dépendance graphique externe.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import type { ReactNode } from 'react';
import { euros } from '@/lib/config';
import type { DevisStatut, FactureStatut, ProspectStatut, SiteStatut } from '@/lib/types';
import { PROSPECT_STATUTS } from '@/lib/types';

export function TitrePage({
  titre,
  sousTitre,
  action,
}: {
  titre: string;
  sousTitre?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-ardoise-500">{sousTitre}</p>}
      </div>
      {action}
    </header>
  );
}

export function Carte({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-ardoise-200 bg-white p-4 lg:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function TitreSection({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-ardoise-700">{children}</h2>
      {action}
    </div>
  );
}

export function Kpi({
  libelle,
  valeur,
  detail,
  ton = 'neutre',
}: {
  libelle: string;
  valeur: string;
  detail?: string;
  ton?: 'neutre' | 'positif' | 'alerte';
}) {
  const couleur =
    ton === 'positif' ? 'text-emerald-600' : ton === 'alerte' ? 'text-rose-600' : 'text-ardoise-900';
  return (
    <Carte>
      <p className="text-xs font-medium tracking-wide text-ardoise-500 uppercase">{libelle}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${couleur}`}>{valeur}</p>
      {detail && <p className="mt-1 text-xs text-ardoise-500">{detail}</p>}
    </Carte>
  );
}

export function Tableau({ entetes, children }: { entetes: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-ardoise-200 text-left">
            {entetes.map((entete) => (
              <th key={entete} className="px-2 py-2 text-xs font-medium text-ardoise-500 uppercase">
                {entete}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ardoise-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Vide({ message }: { message: string }) {
  return <p className="px-2 py-6 text-center text-sm text-ardoise-500">{message}</p>;
}

const TONS = {
  neutre: 'bg-ardoise-100 text-ardoise-700',
  info: 'bg-sky-100 text-sky-800',
  succes: 'bg-emerald-100 text-emerald-800',
  alerte: 'bg-amber-100 text-amber-900',
  danger: 'bg-rose-100 text-rose-800',
} as const;

export function Badge({
  children,
  ton = 'neutre',
}: {
  children: ReactNode;
  ton?: keyof typeof TONS;
}) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONS[ton]}`}>
      {children}
    </span>
  );
}

export function BadgeProspect({ statut }: { statut: ProspectStatut }) {
  const tons: Record<ProspectStatut, keyof typeof TONS> = {
    non_vu: 'neutre',
    en_attente: 'alerte',
    client: 'succes',
    refuse: 'danger',
  };
  const { emoji, label } = PROSPECT_STATUTS[statut];
  return (
    <Badge ton={tons[statut]}>
      {emoji} {label}
    </Badge>
  );
}

export function BadgeSite({ statut }: { statut: SiteStatut }) {
  const tons: Record<SiteStatut, keyof typeof TONS> = {
    brouillon: 'neutre',
    test: 'info',
    production: 'succes',
    maintenance: 'alerte',
    hors_ligne: 'danger',
  };
  const libelles: Record<SiteStatut, string> = {
    brouillon: 'Brouillon',
    test: 'Test',
    production: 'Production',
    maintenance: 'Maintenance',
    hors_ligne: 'Hors ligne',
  };
  return <Badge ton={tons[statut]}>{libelles[statut]}</Badge>;
}

export function BadgeDevis({ statut }: { statut: DevisStatut }) {
  const tons: Record<DevisStatut, keyof typeof TONS> = {
    brouillon: 'neutre',
    envoye: 'info',
    accepte: 'succes',
    refuse: 'danger',
    expire: 'alerte',
  };
  const libelles: Record<DevisStatut, string> = {
    brouillon: 'Brouillon',
    envoye: 'Envoyé',
    accepte: 'Accepté',
    refuse: 'Refusé',
    expire: 'Expiré',
  };
  return <Badge ton={tons[statut]}>{libelles[statut]}</Badge>;
}

export function BadgeFacture({ statut }: { statut: FactureStatut }) {
  const tons: Record<FactureStatut, keyof typeof TONS> = {
    brouillon: 'neutre',
    emise: 'info',
    payee: 'succes',
    impayee: 'danger',
    annulee: 'neutre',
  };
  const libelles: Record<FactureStatut, string> = {
    brouillon: 'Brouillon',
    emise: 'Émise',
    payee: 'Payée',
    impayee: 'Impayée',
    annulee: 'Annulée',
  };
  return <Badge ton={tons[statut]}>{libelles[statut]}</Badge>;
}

/** Jauge de marge : verte au-dessus du seuil, rouge en dessous. */
export function JaugeMarge({ pourcentage, seuil }: { pourcentage: number; seuil: number }) {
  const borne = Math.max(0, Math.min(100, pourcentage));
  const sousSeuil = pourcentage < seuil;
  return (
    <div>
      <div className="jauge">
        <span
          style={{ width: `${borne}%` }}
          className={sousSeuil ? 'bg-rose-500' : 'bg-emerald-500'}
        />
      </div>
      <p className={`mt-1 text-xs ${sousSeuil ? 'text-rose-600' : 'text-ardoise-500'}`}>
        {pourcentage.toFixed(1)} % de marge — seuil {seuil} %
      </p>
    </div>
  );
}

/** Histogramme SVG minimaliste, sans librairie de graphiques. */
export function Histogramme({ points }: { points: { label: string; valeur: number }[] }) {
  const max = Math.max(...points.map((p) => p.valeur), 1);
  return (
    <div className="flex h-40 items-end gap-2">
      {points.map((point) => (
        <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] text-ardoise-500 tabular-nums">
            {point.valeur > 0 ? euros(point.valeur, 0) : ''}
          </span>
          <div
            className="w-full rounded-t bg-ardoise-900"
            style={{ height: `${Math.max(2, (point.valeur / max) * 100)}%` }}
          />
          <span className="text-[10px] text-ardoise-500">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export function LienDiscret({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-sky-700 underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
