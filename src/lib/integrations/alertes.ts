// ---------------------------------------------------------------------------
// Alertes temps réel (Telegram / Slack). Silencieuses si non configurées :
// une alerte qui échoue ne doit jamais interrompre le pipeline.
// ---------------------------------------------------------------------------

import { config } from '@/lib/config';

export async function alerter(message: string): Promise<void> {
  if (config.demo) return;

  const envois: Promise<unknown>[] = [];

  if (config.alertes.telegramToken && config.alertes.telegramChatId) {
    envois.push(
      fetch(`https://api.telegram.org/bot${config.alertes.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: config.alertes.telegramChatId, text: message }),
      }),
    );
  }

  if (config.alertes.slackWebhook) {
    envois.push(
      fetch(config.alertes.slackWebhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: message }),
      }),
    );
  }

  const resultats = await Promise.allSettled(envois);
  for (const resultat of resultats) {
    if (resultat.status === 'rejected') {
      console.warn('[alertes] échec de notification :', resultat.reason);
    }
  }
}
