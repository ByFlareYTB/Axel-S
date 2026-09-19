import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_INITIAL = { ...process.env };

async function charger() {
  vi.resetModules();
  return import('@/lib/integrations/dns');
}

describe('mode de publication des sous-domaines', () => {
  afterEach(() => {
    process.env = { ...ENV_INITIAL };
  });

  it('privilégie l’API Cloudflare quand elle est configurée', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'cf-token';
    process.env.CLOUDFLARE_ZONE_ID = 'zone-123';
    process.env.DNS_WILDCARD = 'true';

    // Les deux sont configurés : l'API, plus précise, l'emporte.
    expect((await charger()).modeDns()).toBe('cloudflare');
  });

  it('retombe sur l’enregistrement générique sans API DNS', async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ZONE_ID;
    process.env.DNS_WILDCARD = 'true';

    expect((await charger()).modeDns()).toBe('wildcard');
  });

  it('ne prétend rien quand rien n’est configuré', async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ZONE_ID;
    process.env.DNS_WILDCARD = 'false';

    expect((await charger()).modeDns()).toBe('aucun');
  });

  it('exige les deux variables Cloudflare, pas une seule', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'cf-token';
    delete process.env.CLOUDFLARE_ZONE_ID;
    process.env.DNS_WILDCARD = 'false';

    expect((await charger()).modeDns()).toBe('aucun');
  });
});

describe('enregistrements DNS à créer chez le registrar', () => {
  afterEach(() => {
    process.env = { ...ENV_INITIAL };
  });

  it('décrit le générique qui remplace toute API DNS', async () => {
    process.env.ROOT_DOMAIN = 'siteforgeai.fr';
    const { enregistrementsRequis } = await charger();
    const generique = enregistrementsRequis().find((e) => e.nom === '*');

    expect(generique?.type).toBe('CNAME');
    expect(generique?.valeur).toBe('cname.vercel-dns.com');
  });

  it('n’invente pas la cible de validation du certificat', async () => {
    // Elle est propre à chaque projet : une valeur inventée produirait un
    // enregistrement inerte et un certificat qui n'arrive jamais.
    const { enregistrementsRequis } = await charger();
    const acme = enregistrementsRequis().find((e) => e.nom === '_acme-challenge');

    expect(acme?.valeur).toBeNull();
    expect(acme?.ou).toMatch(/Vercel/);
  });

  it('construit le sous-domaine client sur le domaine racine configuré', async () => {
    process.env.ROOT_DOMAIN = 'siteforgeai.fr';
    const { sousDomaineClient } = await charger();
    expect(sousDomaineClient('boulangerie-durand')).toBe('boulangerie-durand.siteforgeai.fr');
  });

  it('accepte encore l’ancien nom de variable', async () => {
    // CLOUDFLARE_ROOT_DOMAIN précède l'abandon de Cloudflare : une
    // configuration existante ne doit pas se retrouver sur le mauvais domaine.
    delete process.env.ROOT_DOMAIN;
    process.env.CLOUDFLARE_ROOT_DOMAIN = 'ancien-domaine.fr';
    const { sousDomaineClient } = await charger();
    expect(sousDomaineClient('client')).toBe('client.ancien-domaine.fr');
  });
});
