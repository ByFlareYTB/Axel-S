import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSource } from '@/lib/db/demo-source';

vi.mock('@/lib/db', async () => {
  const { demoSource } = await import('@/lib/db/demo-source');
  return { db: demoSource };
});
vi.mock('@/lib/integrations/alertes', () => ({ alerter: vi.fn(async () => {}) }));

import { POST as creerClient } from '@/app/api/clients/route';
import { DELETE as supprimerClient, PATCH as modifierClient } from '@/app/api/clients/[id]/route';
import type { Client } from '@/lib/types';

function requete(corps: unknown): Request {
  return new Request('http://localhost/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });
}

function parametres(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Le store de test est celui du mode démo, déjà peuplé : on choisit donc des
// identifiants qui n'entrent pas en collision avec ses fiches fictives.
const FICHE = {
  raison_sociale: 'Boulangerie Le Fournil',
  email: 'Contact@Fournil.FR',
  siret: '123 456 789 000 11',
  ville: 'Monts',
};

describe('saisie manuelle des clients', () => {
  beforeEach(() => {
    delete (globalThis as { __siteforgeDemo?: unknown }).__siteforgeDemo;
  });

  it('crée une fiche en normalisant email et SIRET', async () => {
    const reponse = await creerClient(requete(FICHE));
    expect(reponse.status).toBe(201);

    const { client } = (await reponse.json()) as { client: Client };
    // L'email sert de destinataire : il doit être comparable sans ambiguïté.
    expect(client.email).toBe('contact@fournil.fr');
    // Les espaces de saisie ne doivent pas casser la déduplication.
    expect(client.siret).toBe('12345678900011');
  });

  it('refuse un SIRET déjà rattaché à un autre client', async () => {
    await creerClient(requete(FICHE));
    const doublon = await creerClient(
      requete({ ...FICHE, raison_sociale: 'Autre entreprise', email: 'autre@test.fr' }),
    );

    expect(doublon.status).toBe(409);
    const { erreur } = (await doublon.json()) as { erreur: string };
    expect(erreur).toContain('Boulangerie Le Fournil');
  });

  it('refuse un SIRET qui n’a pas 14 chiffres', async () => {
    const reponse = await creerClient(requete({ ...FICHE, siret: '12345' }));
    expect(reponse.status).toBe(400);
  });

  it('accepte une fiche sans SIRET', async () => {
    const reponse = await creerClient(
      requete({ raison_sociale: 'Client sans SIRET', email: 'sans@siret.fr' }),
    );
    expect(reponse.status).toBe(201);
    const { client } = (await reponse.json()) as { client: Client };
    expect(client.siret).toBeNull();
  });

  it('exige une raison sociale et un email valide', async () => {
    expect((await creerClient(requete({ email: 'a@b.fr' }))).status).toBe(400);
    expect((await creerClient(requete({ raison_sociale: 'X', email: 'pas-un-email' }))).status).toBe(
      400,
    );
  });

  it('corrige une faute dans l’email', async () => {
    const { client } = (await (await creerClient(requete(FICHE))).json()) as { client: Client };

    const reponse = await modifierClient(
      requete({ email: '  Bon@Email.FR ' }),
      parametres(client.id),
    );
    const modifie = ((await reponse.json()) as { client: Client }).client;
    expect(modifie.email).toBe('bon@email.fr');
  });

  it('refuse de déplacer un SIRET vers un client qui a déjà le sien', async () => {
    const premier = ((await (await creerClient(requete(FICHE))).json()) as { client: Client }).client;
    const second = (
      (await (
        await creerClient(requete({ raison_sociale: 'Garage', email: 'g@test.fr' }))
      ).json()) as { client: Client }
    ).client;

    const conflit = await modifierClient(
      requete({ siret: premier.siret }),
      parametres(second.id),
    );
    expect(conflit.status).toBe(409);
  });

  it('supprime une fiche créée par erreur', async () => {
    const { client } = (await (await creerClient(requete(FICHE))).json()) as { client: Client };
    const reponse = await supprimerClient(requete({}), parametres(client.id));

    expect(reponse.status).toBe(200);
    expect(await demoSource.get('clients', client.id)).toBeNull();
  });

  it('protège un client qui a des pièces comptables', async () => {
    const { client } = (await (await creerClient(requete(FICHE))).json()) as { client: Client };
    await demoSource.insert('factures', {
      numero: 'FAC-2026-0001',
      client_id: client.id,
      total_ttc: 249,
    });

    const reponse = await supprimerClient(requete({}), parametres(client.id));
    expect(reponse.status).toBe(409);
    // La fiche doit toujours exister : supprimer aurait orphelin une facture.
    expect(await demoSource.get('clients', client.id)).not.toBeNull();
  });
});
