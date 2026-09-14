// ---------------------------------------------------------------------------
// Emailing conforme au régime opt-out B2B validé par la CNIL :
//   · contact professionnel uniquement,
//   · objet en lien avec l'activité du destinataire,
//   · identité de l'expéditeur clairement affichée,
//   · lien de désinscription effectif sous 24 h,
//   · table unsubscribed_emails consultée avant TOUT envoi.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { estDesinscrit } from '@/lib/repositories';
import { requeteJson } from './http';

export interface EnvoiEmail {
  destinataire: string;
  sujet: string;
  html: string;
  gabarit?: string;
  prospectId?: string | null;
  clientId?: string | null;
}

export class EmailBloqueError extends Error {
  constructor(destinataire: string) {
    super(`Envoi bloqué : ${destinataire} figure dans la liste de désinscription.`);
    this.name = 'EmailBloqueError';
  }
}

function piedRgpd(token: string): string {
  const lien = `${config.appBaseUrl}/desinscription/${token}`;
  return [
    '<hr style="margin:32px 0;border:none;border-top:1px solid #e2e8f0">',
    '<p style="font-size:12px;color:#64748b;line-height:1.5">',
    `Message professionnel envoyé par ${config.entreprise.nom} — ${config.entreprise.exploitant}, `,
    `microentreprise, SIREN ${config.entreprise.siren}, ${config.entreprise.adresse}.<br>`,
    `Vous recevez cet email à votre adresse professionnelle au titre de votre activité. `,
    `<a href="${lien}">Se désinscrire en un clic</a> — prise en compte sous 24 h.`,
    '</p>',
  ].join('');
}

async function envoyerViaResend(envoi: EnvoiEmail, html: string): Promise<string> {
  const reponse = await requeteJson<{ id: string }>('Resend', 'https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.email.resendKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.email.from,
      to: [envoi.destinataire],
      subject: envoi.sujet,
      html,
    }),
  });
  return reponse.id;
}

async function envoyerViaBrevo(envoi: EnvoiEmail, html: string): Promise<string> {
  const correspondance = config.email.from.match(/^(.*?)\s*<(.+)>$/);
  const reponse = await requeteJson<{ messageId: string }>('Brevo', 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.email.brevoKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: correspondance?.[1] ?? config.entreprise.nom, email: correspondance?.[2] ?? config.entreprise.email },
      to: [{ email: envoi.destinataire }],
      subject: envoi.sujet,
      htmlContent: html,
    }),
  });
  return reponse.messageId;
}

/**
 * Envoie un email après contrôle de la liste de désinscription et journalise
 * l'envoi. En mode démo, rien ne part : l'envoi est seulement enregistré.
 */
export async function envoyerEmail(envoi: EnvoiEmail): Promise<{ id: string; providerId: string | null }> {
  if (await estDesinscrit(envoi.destinataire)) {
    throw new EmailBloqueError(envoi.destinataire);
  }

  const token = randomUUID();
  const html = envoi.html + piedRgpd(token);

  let providerId: string | null = null;
  if (!config.demo) {
    providerId =
      config.email.provider === 'brevo'
        ? await envoyerViaBrevo(envoi, html)
        : await envoyerViaResend(envoi, html);
  }

  const journal = await db.insert<{ id: string }>('emails_envoyes', {
    prospect_id: envoi.prospectId ?? null,
    client_id: envoi.clientId ?? null,
    destinataire: envoi.destinataire,
    sujet: envoi.sujet,
    gabarit: envoi.gabarit ?? null,
    statut: config.demo ? 'simule' : 'envoye',
    ouvert: false,
    clique: false,
    token_desinscription: token,
    provider_id: providerId,
    envoye_le: new Date().toISOString(),
  });

  return { id: journal.id, providerId };
}

/** Désinscription effective : l'adresse est bloquée pour tout envoi ultérieur. */
export async function desinscrire(email: string, motif = 'Lien de désinscription'): Promise<void> {
  const normalise = email.toLowerCase();
  if (await estDesinscrit(normalise)) return;
  await db.insert('unsubscribed_emails', {
    email: normalise,
    motif,
    source: 'lien_desinscription',
    desinscrit_le: new Date().toISOString(),
  });
}

// --- Gabarits ---------------------------------------------------------------

export function gabaritProspection(params: {
  raisonSociale: string;
  secteur: string;
  ville: string | null;
  argumentaire: string | null;
}): { sujet: string; html: string } {
  return {
    // L'objet doit être en rapport direct avec l'activité du destinataire.
    sujet: `Votre visibilité en ligne — ${params.raisonSociale}`,
    html: [
      `<p>Bonjour,</p>`,
      `<p>Je suis ${config.entreprise.exploitant}, je crée des sites internet pour les ${params.secteur.toLowerCase()}`,
      params.ville ? ` autour de ${params.ville}` : '',
      `.</p>`,
      `<p>Un site vitrine complet, en ligne en quelques jours, à partir de 249 € puis 19 €/mois d'hébergement et de maintenance.</p>`,
      params.argumentaire ? `<p>${params.argumentaire}</p>` : '',
      `<p>Si cela vous intéresse, je peux vous envoyer une maquette de votre site sans engagement.</p>`,
      `<p>Bien cordialement,<br>${config.entreprise.exploitant}<br>${config.entreprise.nom}</p>`,
    ].join(''),
  };
}

export function gabaritValidation(params: {
  raisonSociale: string;
  urlTest: string;
  token: string;
}): { sujet: string; html: string } {
  const base = `${config.appBaseUrl}/validation/${params.token}`;
  return {
    sujet: `Votre site est prêt à être validé — ${params.raisonSociale}`,
    html: [
      `<p>Bonjour,</p>`,
      `<p>Votre site est en ligne en version de test : <a href="${params.urlTest}">${params.urlTest}</a></p>`,
      `<p>Merci de nous indiquer si vous l'approuvez :</p>`,
      `<p><a href="${base}?reponse=approuve" style="background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">J'approuve</a>`,
      `&nbsp;&nbsp;`,
      `<a href="${base}?reponse=modifications" style="background:#e2e8f0;color:#0f172a;padding:12px 20px;border-radius:6px;text-decoration:none">Je souhaite des modifications</a></p>`,
      `<p>Après approbation, la mise en production est automatique : nom de domaine, certificat SSL et mentions légales sont configurés sans intervention de votre part.</p>`,
      `<p>Bien cordialement,<br>${config.entreprise.exploitant}</p>`,
    ].join(''),
  };
}

export function gabaritDevis(params: { raisonSociale: string; numero: string; total: string; mensuel: string | null }): {
  sujet: string;
  html: string;
} {
  return {
    sujet: `Votre devis ${params.numero} — ${params.raisonSociale}`,
    html: [
      `<p>Bonjour,</p>`,
      `<p>Veuillez trouver votre devis <strong>${params.numero}</strong> d'un montant de <strong>${params.total}</strong>`,
      params.mensuel ? `, puis <strong>${params.mensuel}</strong> par mois d'hébergement et de maintenance` : '',
      `.</p>`,
      `<p>Le devis complet est joint en PDF. Il est valable 30 jours.</p>`,
      `<p>Bien cordialement,<br>${config.entreprise.exploitant}<br>${config.entreprise.nom}</p>`,
    ].join(''),
  };
}
