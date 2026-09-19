// ---------------------------------------------------------------------------
// Utilitaires communs aux routes d'API : réponses normalisées et garde
// d'authentification.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { sessionCourante } from '@/lib/auth/session';

export function ok<T>(donnees: T, statut = 200): NextResponse {
  return NextResponse.json(donnees, { status: statut });
}

export function erreur(message: string, statut = 400): NextResponse {
  return NextResponse.json({ erreur: message }, { status: statut });
}

/** Convertit une exception en réponse HTTP lisible côté UI. */
export function erreurInterne(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : 'Erreur inconnue.';
  console.error('[api]', err);
  return erreur(message, 500);
}

/** Routes d'administration : réservées à l'utilisateur connecté. */
export async function exigerSession(): Promise<NextResponse | null> {
  return (await sessionCourante()) ? null : erreur('Authentification requise.', 401);
}
