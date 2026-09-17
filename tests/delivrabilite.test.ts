import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_INITIAL = { ...process.env };

async function charger() {
  vi.resetModules();
  return import('@/lib/integrations/delivrabilite');
}

describe('diagnostic de délivrabilité', () => {
  afterEach(() => {
    process.env = { ...ENV_INITIAL };
  });

  it('reconnaît l’expéditeur de test partagé du fournisseur', async () => {
    const { estExpediteurPartage } = await charger();
    expect(estExpediteurPartage('SiteForge <onboarding@resend.dev>')).toBe(true);
    expect(estExpediteurPartage('onboarding@resend.dev')).toBe(true);
    expect(estExpediteurPartage('SiteForge <contact@siteforge.fr>')).toBe(false);
  });

  it('extrait le domaine avec ou sans nom affiché', async () => {
    const { domaineExpediteur } = await charger();
    expect(domaineExpediteur('SiteForge AI <contact@Siteforge.FR>')).toBe('siteforge.fr');
    expect(domaineExpediteur('contact@siteforge.fr')).toBe('siteforge.fr');
    expect(domaineExpediteur('pas-une-adresse')).toBeNull();
  });

  it('explique le classement en indésirables d’une configuration de démarrage', async () => {
    // Exactement la configuration du premier envoi : expéditeur de test et
    // application non déployée.
    process.env.EMAIL_FROM = 'SiteForge AI <onboarding@resend.dev>';
    process.env.APP_BASE_URL = 'http://localhost:3000';

    const { diagnosticDelivrabilite } = await charger();
    const points = diagnosticDelivrabilite();

    const domaine = points.find((p) => p.code === 'domaine_expediteur')!;
    expect(domaine.conforme).toBe(false);
    expect(domaine.correction).toMatch(/resend\.com\/domains/);

    const liens = points.find((p) => p.code === 'liens_publics')!;
    expect(liens.conforme).toBe(false);
    expect(liens.correction).toMatch(/APP_BASE_URL/);
  });

  it('ne réclame rien quand le domaine est propre et l’application déployée', async () => {
    process.env.EMAIL_FROM = 'SiteForge AI <contact@siteforge.fr>';
    process.env.APP_BASE_URL = 'https://app.siteforge.fr';

    const { diagnosticDelivrabilite } = await charger();
    expect(diagnosticDelivrabilite().every((p) => p.conforme)).toBe(true);
  });

  it('signale un expéditeur et des liens sur deux domaines différents', async () => {
    process.env.EMAIL_FROM = 'SiteForge AI <contact@siteforge.fr>';
    process.env.APP_BASE_URL = 'https://autre-domaine.com';

    const { diagnosticDelivrabilite } = await charger();
    const alignement = diagnosticDelivrabilite().find((p) => p.code === 'alignement')!;
    expect(alignement.conforme).toBe(false);
  });

  it('ne reproche pas l’alignement tant que l’expéditeur est celui du fournisseur', async () => {
    // Le domaine partagé est déjà signalé par ailleurs : le répéter noierait
    // le seul point qui compte.
    process.env.EMAIL_FROM = 'SiteForge AI <onboarding@resend.dev>';
    process.env.APP_BASE_URL = 'https://app.siteforge.fr';

    const { diagnosticDelivrabilite } = await charger();
    const alignement = diagnosticDelivrabilite().find((p) => p.code === 'alignement')!;
    expect(alignement.conforme).toBe(true);
  });
});

describe('version texte des emails', () => {
  beforeEach(() => vi.resetModules());

  it('conserve les liens en clair', async () => {
    const { texteDepuisHtml } = await import('@/lib/integrations/email');
    const texte = texteDepuisHtml(
      '<p>Votre site : <a href="https://exemple.fr">voir le site</a></p>',
    );
    expect(texte).toContain('https://exemple.fr');
    expect(texte).toContain('voir le site');
    expect(texte).not.toContain('<');
  });

  it('sépare les paragraphes et décode les entités', async () => {
    const { texteDepuisHtml } = await import('@/lib/integrations/email');
    const texte = texteDepuisHtml('<p>Bonjour,</p><p>L&apos;offre &amp; les options</p>');
    expect(texte).toBe("Bonjour,\nL'offre & les options");
  });
});

describe('en-têtes de désinscription', () => {
  afterEach(() => {
    process.env = { ...ENV_INITIAL };
  });

  it('annonce un lien HTTPS en un clic et une adresse de secours', async () => {
    process.env.APP_BASE_URL = 'https://app.siteforge.fr';
    process.env.ENTREPRISE_EMAIL = 'contact@siteforge.fr';
    vi.resetModules();

    const { enTetesDesinscription } = await import('@/lib/integrations/email');
    const entetes = enTetesDesinscription('jeton-123');

    // Le POST est ce que Gmail appelle : la route doit exister et désinscrire
    // sans confirmation, sinon l'en-tête promet ce qu'il ne tient pas.
    expect(entetes['List-Unsubscribe']).toContain(
      '<https://app.siteforge.fr/api/desinscription/jeton-123>',
    );
    expect(entetes['List-Unsubscribe']).toContain('mailto:contact@siteforge.fr');
    expect(entetes['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
