import { NextResponse, type NextRequest } from 'next/server';
import { NOM_COOKIE, verifierJeton } from '@/lib/auth/token';

/**
 * Toute l'application est privée sauf les pages destinées au client final
 * (validation de site, désinscription) et les webhooks.
 */
const PUBLICS = [
  '/login',
  '/validation',
  '/desinscription',
  '/api/auth/login',
  '/api/auth/installation',
  '/api/stripe/webhook',
  '/api/email/entrant',
  '/api/contact',
];

export async function middleware(requete: NextRequest) {
  const chemin = requete.nextUrl.pathname;
  if (PUBLICS.some((prefixe) => chemin.startsWith(prefixe))) return NextResponse.next();

  const secret = process.env.SESSION_SECRET?.trim() || 'dev-session-secret-change-me-please-32chars';
  if (await verifierJeton(requete.cookies.get(NOM_COOKIE)?.value, secret)) return NextResponse.next();

  if (chemin.startsWith('/api/')) {
    return NextResponse.json({ erreur: 'Authentification requise.' }, { status: 401 });
  }

  const redirection = requete.nextUrl.clone();
  redirection.pathname = '/login';
  return NextResponse.redirect(redirection);
}

export const config = {
  // Exclut les assets statiques et le dossier _next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
