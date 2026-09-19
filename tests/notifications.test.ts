import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSource } from '@/lib/db/demo-source';

vi.mock('@/lib/db', async () => {
  const { demoSource } = await import('@/lib/db/demo-source');
  return { db: demoSource };
});

// Les alertes sortantes (Telegram/Slack) ne doivent jamais partir en test.
vi.mock('@/lib/integrations/alertes', () => ({ alerter: vi.fn(async () => {}) }));

import { alerter } from '@/lib/integrations/alertes';
import {
  compterNonLues,
  listerNotifications,
  marquerLue,
  notifier,
  purgerAnciennes,
  toutMarquerLu,
} from '@/lib/notifications';

describe('notifications internes', () => {
  beforeEach(() => {
    delete (globalThis as { __siteforgeDemo?: unknown }).__siteforgeDemo;
    vi.clearAllMocks();
  });

  it('enregistre une notification non lue avec son niveau', async () => {
    const notification = await notifier({
      type: 'paiement_encaisse',
      titre: 'Paiement reçu',
      message: '249 € encaissés',
    });

    expect(notification).not.toBeNull();
    expect(notification!.lu).toBe(false);
    // Le niveau vient de la table de présentation, pas de l'appelant.
    expect(notification!.niveau).toBe('succes');
    expect(await compterNonLues()).toBe(1);
  });

  it('déduit le niveau alerte des événements à traiter', async () => {
    const echec = await notifier({
      type: 'paiement_echoue',
      titre: 'Prélèvement refusé',
      message: 'Carte expirée',
    });
    expect(echec!.niveau).toBe('alerte');
  });

  it('ne pousse vers Telegram/Slack que si urgent', async () => {
    await notifier({ type: 'email_envoye', titre: 'Email parti', message: 'Devis envoyé' });
    expect(alerter).not.toHaveBeenCalled();

    await notifier({
      type: 'client_confirme',
      titre: 'Nouveau client',
      message: 'Boulangerie Durand',
      urgent: true,
    });
    expect(alerter).toHaveBeenCalledTimes(1);
  });

  it('liste les notifications de la plus récente à la plus ancienne', async () => {
    await notifier({ type: 'email_recu', titre: 'Première', message: 'a' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await notifier({ type: 'email_recu', titre: 'Seconde', message: 'b' });

    const liste = await listerNotifications();
    expect(liste[0].titre).toBe('Seconde');
  });

  it('marque une notification comme lue et met à jour le compteur', async () => {
    const notification = await notifier({ type: 'email_recu', titre: 'Message', message: 'a' });
    expect(await compterNonLues()).toBe(1);

    const lue = await marquerLue(notification!.id);
    expect(lue!.lu).toBe(true);
    expect(lue!.lu_le).not.toBeNull();
    expect(await compterNonLues()).toBe(0);
  });

  it('marque tout comme lu en une fois', async () => {
    await notifier({ type: 'email_recu', titre: 'A', message: 'a' });
    await notifier({ type: 'email_recu', titre: 'B', message: 'b' });
    await notifier({ type: 'email_recu', titre: 'C', message: 'c' });

    expect(await toutMarquerLu()).toBe(3);
    expect(await compterNonLues()).toBe(0);
  });

  it('ne purge que les notifications lues et anciennes', async () => {
    const ancienneLue = await notifier({ type: 'email_recu', titre: 'Vieille lue', message: 'a' });
    const ancienneNonLue = await notifier({
      type: 'email_recu',
      titre: 'Vieille non lue',
      message: 'b',
    });
    await notifier({ type: 'email_recu', titre: 'Récente', message: 'c' });

    // On vieillit artificiellement les deux premières de 60 jours.
    const vieux = new Date(Date.now() - 60 * 86_400_000).toISOString();
    await demoSource.update('notifications', ancienneLue!.id, { created_at: vieux, lu: true });
    await demoSource.update('notifications', ancienneNonLue!.id, { created_at: vieux });

    expect(await purgerAnciennes()).toBe(1);

    const restantes = await listerNotifications();
    expect(restantes.map((n) => n.titre).sort()).toEqual(['Récente', 'Vieille non lue']);
  });

  it('ne fait jamais échouer l’action métier qui la déclenche', async () => {
    // Une notification est un effet de bord : si le store refuse l'écriture,
    // l'appel renvoie null au lieu de propager l'erreur.
    const echec = vi.spyOn(demoSource, 'insert').mockRejectedValueOnce(new Error('disque plein'));

    const resultat = await notifier({ type: 'email_recu', titre: 'A', message: 'a' });
    expect(resultat).toBeNull();

    echec.mockRestore();
  });
});
