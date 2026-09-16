import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSource } from '@/lib/db/demo-source';

vi.mock('@/lib/db', async () => {
  const { demoSource } = await import('@/lib/db/demo-source');
  return { db: demoSource };
});
vi.mock('@/lib/integrations/alertes', () => ({ alerter: vi.fn(async () => {}) }));

// Génération simulée : coûteuse par nature, elle ne doit jamais être perdue.
const SITE_GENERE = {
  nom: 'Garage Verdier',
  palette: { primaire: '#1d4ed8', secondaire: '#0f172a', fond: '#f8fafc' },
  meta: { titre: 'Garage Verdier', description: 'Garage', motsCles: ['garage'] },
  pages: [
    { slug: 'accueil', titre: 'Accueil', html: '<html><body><h1>Garage</h1></body></html>' },
    { slug: 'contact', titre: 'Contact', html: '<html><body><h1>Contact</h1></body></html>' },
  ],
  modele: 'claude-opus-5',
  coutEuros: 1.42,
  avertissements: [],
};

vi.mock('@/lib/integrations/claude', () => ({
  genererSite: vi.fn(async () => SITE_GENERE),
  genererSiteDemo: vi.fn(() => SITE_GENERE),
}));

const deployer = vi.fn();
vi.mock('@/lib/integrations/vercel', () => ({
  creerProjet: vi.fn(async () => ({ id: 'prj_1', nom: 'projet' })),
  deployer: (...args: unknown[]) => deployer(...args),
  ajouterDomaine: vi.fn(async () => {}),
}));

const envoyerEmail = vi.fn();
vi.mock('@/lib/integrations/email', () => ({
  envoyerEmail: (...args: unknown[]) => envoyerEmail(...args),
  gabaritValidation: () => ({ sujet: 'sujet', html: 'html' }),
  gabaritProspection: () => ({ sujet: 's', html: 'h' }),
  gabaritDevis: () => ({ sujet: 's', html: 'h' }),
  desinscrire: vi.fn(async () => {}),
}));

// L'hébergement et l'emailing sont considérés configurés : on teste ce qui se
// passe quand ils sont configurés MAIS défaillants.
vi.mock('@/lib/integrations/prerequis', () => ({
  estDisponible: () => true,
  exigerCapacite: () => {},
  manquantes: () => [],
  etatCapacites: () => [],
  CapaciteIndisponibleError: class extends Error {},
}));

import { genererEtDeployerTest } from '@/lib/pipeline/site';
import type { Client, Site, SiteVersion } from '@/lib/types';

async function creerClient(): Promise<Client> {
  return demoSource.insert<Client>('clients', {
    raison_sociale: 'Garage Verdier',
    email: 'contact@verdier.fr',
    secteur: 'Garage automobile',
    ville: 'Veigné',
  });
}

describe('une génération payée n’est jamais perdue', () => {
  beforeEach(() => {
    delete (globalThis as { __siteforgeDemo?: unknown }).__siteforgeDemo;
    vi.clearAllMocks();
    deployer.mockResolvedValue({ id: 'dpl_1', url: 'https://test.vercel.app', environnement: 'preview' });
    envoyerEmail.mockResolvedValue({ id: 'msg_1', providerId: null });
  });

  it('enregistre la version et le coût quand tout se passe bien', async () => {
    const client = await creerClient();
    const resultat = await genererEtDeployerTest({ clientId: client.id });

    expect(resultat.deploye).toBe(true);
    expect(resultat.emailEnvoye).toBe(true);
    expect(resultat.coutIa).toBe(1.42);

    const site = await demoSource.get<Site>('sites', resultat.site.id);
    expect(site!.cout_generation_ia).toBe(1.42);
    expect(site!.url_test).toBe('https://test.vercel.app');
  });

  it('conserve la génération quand le déploiement échoue', async () => {
    deployer.mockRejectedValue(new Error('Vercel indisponible'));
    const client = await creerClient();

    const resultat = await genererEtDeployerTest({ clientId: client.id });

    // Le point essentiel : aucune exception, et la version est en base.
    expect(resultat.deploye).toBe(false);
    expect(resultat.version.version).toBe(1);

    const versions = await demoSource.list<SiteVersion>('site_versions', {
      site_id: resultat.site.id,
    });
    expect(versions).toHaveLength(1);
    expect(versions[0].cout_ia).toBe(1.42);

    // Et l'utilisateur sait quoi faire ensuite.
    expect(resultat.avertissements.join(' ')).toContain('Vercel indisponible');
    expect(resultat.avertissements.join(' ')).toContain('Déployer en test');
  });

  it('conserve tout quand l’envoi de l’email échoue', async () => {
    envoyerEmail.mockRejectedValue(new Error('RESEND_API_KEY invalide'));
    const client = await creerClient();

    const resultat = await genererEtDeployerTest({ clientId: client.id });

    // Le site est généré ET en ligne : l'email est la dernière étape, la moins
    // critique. Elle ne peut pas emporter les deux précédentes.
    expect(resultat.deploye).toBe(true);
    expect(resultat.urlTest).toBe('https://test.vercel.app');
    expect(resultat.emailEnvoye).toBe(false);

    // La demande de validation existe : son lien est transmissible à la main.
    expect(resultat.lienValidation).toContain('/validation/');
    expect(resultat.validation).not.toBeNull();
  });

  it('enregistre la version avant de tenter quoi que ce soit d’autre', async () => {
    // Le store de démo est pré-peuplé : on mesure l'écart, pas le total.
    const avant = (await demoSource.list('site_versions')).length;

    let versionsAuDeploiement = -1;
    deployer.mockImplementation(async () => {
      versionsAuDeploiement = (await demoSource.list('site_versions')).length;
      throw new Error('panne');
    });

    const client = await creerClient();
    await genererEtDeployerTest({ clientId: client.id });

    // Au moment du déploiement, la génération était déjà persistée.
    expect(versionsAuDeploiement).toBe(avant + 1);
  });

  it('cumule le coût des générations successives sur le site', async () => {
    const client = await creerClient();
    const premier = await genererEtDeployerTest({ clientId: client.id });
    await genererEtDeployerTest({ clientId: client.id, siteId: premier.site.id });

    const site = await demoSource.get<Site>('sites', premier.site.id);
    expect(site!.cout_generation_ia).toBeCloseTo(2.84, 2);
    expect(site!.version_actuelle).toBe(2);
    expect(site!.version_sauvegarde).toBe(1);
  });
});
