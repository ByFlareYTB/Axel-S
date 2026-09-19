import { describe, expect, it } from 'vitest';
import { DOMAINE_EXEMPLE, SECRET_EXEMPLE, verifierProduction } from '../scripts/prod.mjs';

/** Un environnement complet et correct, que chaque test dégrade sur un point. */
const SAIN = {
  DEMO_MODE: 'false',
  DATABASE_URL: 'postgresql://postgres:MonMotDePasse@db.abcdefgh.supabase.co:5432/postgres',
  SESSION_SECRET: 'a'.repeat(64),
  APP_BASE_URL: 'https://app.siteforgeai.fr',
  ANTHROPIC_API_KEY: 'sk-ant-xxx',
  RESEND_API_KEY: 're_xxx',
  EMAIL_FROM: 'SiteForge AI <contact@siteforgeai.fr>',
  SIREN: '911151264',
  ENTREPRISE_NOM: 'SiteForge AI',
  ENTREPRISE_EXPLOITANT: 'Axel S.',
  ENTREPRISE_ADRESSE: '37260 Monts',
  ENTREPRISE_EMAIL: 'contact@siteforgeai.fr',
  ROOT_DOMAIN: 'siteforgeai.fr',
};

/** Les variables signalées, pour comparer sans dépendre de la formulation. */
function signalees(env: Record<string, string>, niveau?: string) {
  return verifierProduction(env)
    .filter((p) => !niveau || p.niveau === niveau)
    .map((p) => p.variable);
}

describe('contrôle de la configuration de production', () => {
  it('ne reproche rien à une configuration complète', () => {
    expect(verifierProduction(SAIN)).toEqual([]);
  });

  it('refuse le secret de session de l’exemple, qui est public sur GitHub', () => {
    // Le pire défaut possible : l'application fonctionne parfaitement, et
    // n'importe qui peut forger un cookie de session valide.
    const problemes = verifierProduction({ ...SAIN, SESSION_SECRET: SECRET_EXEMPLE });
    expect(problemes).toHaveLength(1);
    expect(problemes[0].niveau).toBe('bloquant');
    expect(problemes[0].variable).toBe('SESSION_SECRET');
  });

  it('refuse un secret de session trop court', () => {
    expect(signalees({ ...SAIN, SESSION_SECRET: 'court' }, 'bloquant')).toEqual(['SESSION_SECRET']);
  });

  it('refuse une base absente : sur Vercel le disque ne survit pas', () => {
    expect(signalees({ ...SAIN, DATABASE_URL: '' }, 'bloquant')).toEqual(['DATABASE_URL']);
  });

  it('refuse le mode démo', () => {
    expect(signalees({ ...SAIN, DEMO_MODE: 'true' }, 'bloquant')).toEqual(['DEMO_MODE']);
  });

  it('refuse une adresse publique restée en localhost', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', '']) {
      expect(signalees({ ...SAIN, APP_BASE_URL: url }, 'bloquant')).toEqual(['APP_BASE_URL']);
    }
  });

  it('refuse une adresse publique en clair', () => {
    expect(signalees({ ...SAIN, APP_BASE_URL: 'http://app.siteforgeai.fr' }, 'bloquant')).toEqual([
      'APP_BASE_URL',
    ]);
  });

  it('signale l’expéditeur de test du fournisseur sans bloquer', () => {
    const problemes = verifierProduction({
      ...SAIN,
      EMAIL_FROM: 'SiteForge AI <onboarding@resend.dev>',
    });
    expect(problemes).toHaveLength(1);
    expect(problemes[0].niveau).toBe('avertissement');
    expect(problemes[0].constat).toMatch(/indésirables/);
  });

  it('signale un expéditeur et des liens sur deux domaines différents', () => {
    expect(
      signalees({ ...SAIN, EMAIL_FROM: 'SiteForge AI <contact@autre-domaine.fr>' }),
    ).toEqual(['EMAIL_FROM']);
  });

  it('accepte un sous-domaine de l’adresse d’expédition', () => {
    // contact@siteforgeai.fr et app.siteforgeai.fr sont bien alignés.
    expect(verifierProduction({ ...SAIN, APP_BASE_URL: 'https://siteforgeai.fr' })).toEqual([]);
  });

  it('signale un SIREN fictif, mention légale obligatoire sur les factures', () => {
    expect(signalees({ ...SAIN, SIREN: '000000000' })).toEqual(['SIREN']);
    expect(signalees({ ...SAIN, SIREN: '' })).toEqual(['SIREN']);
  });

  it('signale l’absence de clé de génération ou d’emailing sans bloquer', () => {
    expect(signalees({ ...SAIN, ANTHROPIC_API_KEY: '', RESEND_API_KEY: '' })).toEqual([
      'ANTHROPIC_API_KEY',
      'RESEND_API_KEY',
    ]);
  });

  it('accepte Brevo à la place de Resend', () => {
    expect(verifierProduction({ ...SAIN, RESEND_API_KEY: '', BREVO_API_KEY: 'xkeysib-xxx' })).toEqual(
      [],
    );
  });

  it('refuse le domaine d’exemple, qui appartient à un tiers', () => {
    // Laissé en place, il ferait annoncer les sous-domaines des clients sur
    // une zone que l'utilisateur ne contrôle pas.
    const problemes = verifierProduction({ ...SAIN, ROOT_DOMAIN: DOMAINE_EXEMPLE });
    expect(problemes).toHaveLength(1);
    expect(problemes[0].variable).toBe('ROOT_DOMAIN');
    expect(problemes[0].constat).toMatch(/tiers/);
  });

  it('lit encore l’ancien nom de variable pour le domaine racine', () => {
    const env = { ...SAIN, ROOT_DOMAIN: '', CLOUDFLARE_ROOT_DOMAIN: 'siteforgeai.fr' };
    expect(verifierProduction(env)).toEqual([]);
  });

  it('signale un domaine racine absent', () => {
    expect(signalees({ ...SAIN, ROOT_DOMAIN: '' })).toEqual(['ROOT_DOMAIN']);
  });

  it('propose une correction pour chaque problème', () => {
    // Un diagnostic sans consigne oblige à chercher ailleurs.
    for (const probleme of verifierProduction({})) {
      expect(probleme.correction.length).toBeGreaterThan(10);
      expect(probleme.constat.length).toBeGreaterThan(10);
    }
  });
});
