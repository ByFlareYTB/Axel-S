import type { Metadata } from 'next';
import './globals.css';
import { BandeauEtat } from '@/components/bandeau-etat';
import { Navigation } from '@/components/navigation';

export const metadata: Metadata = {
  title: 'SiteForge AI — pilotage',
  description:
    'Prospection, génération de sites par IA, hébergement automatisé et facturation, dans une seule application.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <BandeauEtat />
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Navigation />
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
