import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSource } from '@/lib/db/demo-source';

vi.mock('@/lib/db', async () => {
  const { demoSource } = await import('@/lib/db/demo-source');
  return { db: demoSource };
});
vi.mock('@/lib/integrations/alertes', () => ({ alerter: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifier: vi.fn(async () => null) }));
vi.mock('@/lib/integrations/prerequis', () => ({
  estDisponible: () => true,
  exigerCapacite: () => {},
  manquantes: () => [],
  etatCapacites: () => [],
}));

const requeteJson = vi.fn();
vi.mock('@/lib/integrations/http', () => ({
  requeteJson: (...args: unknown[]) => requeteJson(...args),
  IntegrationError: class extends Error {},
}));

import { envoyerEmail } from '@/lib/integrations/email';

/** Reproduit le corps d'erreur que renvoie réellement Resend. */
function refusResend(message: string) {
  return new Error(`[Resend] ${JSON.stringify({ statusCode: 403, message, name: 'validation_error' })}`);
}

describe('refus de Resend traduits en consignes', () => {
  beforeEach(() => {
    delete (globalThis as { __siteforgeDemo?: unknown }).__siteforgeDemo;
    vi.clearAllMocks();
  });

  it('explique la limite du mode test, la cause la plus fréquente au démarrage', async () => {
    requeteJson.mockRejectedValue(
      refusResend(
        'You can only send testing emails to your own email address (axel@exemple.fr). To send emails to other recipients, please verify a domain at resend.com/domains',
      ),
    );

    await expect(
      envoyerEmail({ destinataire: 'client@exemple.fr', sujet: 'Test', html: '<p>Test</p>' }),
    ).rejects.toThrow(/n'écrit qu'à l'adresse du compte Resend/);
  });

  it('nomme le destinataire refusé', async () => {
    requeteJson.mockRejectedValue(
      refusResend('You can only send testing emails to your own email address (axel@exemple.fr).'),
    );

    await expect(
      envoyerEmail({ destinataire: 'client@exemple.fr', sujet: 'Test', html: '<p>Test</p>' }),
    ).rejects.toThrow(/client@exemple\.fr/);
  });

  it('explique un domaine d’expéditeur non vérifié', async () => {
    requeteJson.mockRejectedValue(refusResend('The siteforge.fr domain is not verified.'));

    await expect(
      envoyerEmail({ destinataire: 'client@exemple.fr', sujet: 'Test', html: '<p>Test</p>' }),
    ).rejects.toThrow(/resend\.com\/domains/);
  });

  it('explique une clé refusée', async () => {
    requeteJson.mockRejectedValue(new Error('[Resend] 401 Unauthorized'));

    await expect(
      envoyerEmail({ destinataire: 'client@exemple.fr', sujet: 'Test', html: '<p>Test</p>' }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('conserve le message d’origine pour un refus non prévu', async () => {
    requeteJson.mockRejectedValue(refusResend('Something entirely unexpected happened'));

    await expect(
      envoyerEmail({ destinataire: 'client@exemple.fr', sujet: 'Test', html: '<p>Test</p>' }),
    ).rejects.toThrow(/Something entirely unexpected/);
  });

  it('bloque toujours un destinataire désinscrit avant tout appel réseau', async () => {
    await demoSource.insert('unsubscribed_emails', {
      email: 'desinscrit@exemple.fr',
      motif: 'test',
      source: 'lien_desinscription',
      desinscrit_le: new Date().toISOString(),
    });

    await expect(
      envoyerEmail({ destinataire: 'desinscrit@exemple.fr', sujet: 'Test', html: '<p>Test</p>' }),
    ).rejects.toThrow(/désinscription/);

    // Obligation RGPD : aucun appel n'a été tenté.
    expect(requeteJson).not.toHaveBeenCalled();
  });
});
