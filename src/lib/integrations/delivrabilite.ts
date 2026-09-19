// ---------------------------------------------------------------------------
// Délivrabilité : pourquoi un email part correctement et arrive quand même
// dans les indésirables.
//
// Un envoi accepté par Resend n'est pas un envoi lu. Gmail et Outlook classent
// sur la réputation de l'expéditeur, pas sur le succès de l'appel d'API. Ce
// module énumère, sans deviner, ce qui dans la configuration actuelle pousse
// un message vers les indésirables, et ce qu'il faut faire pour le corriger.
// ---------------------------------------------------------------------------

import { applicationLocaleUniquement, config } from '@/lib/config';

export interface PointDelivrabilite {
  /** Identifiant stable, pour les tests et l'affichage. */
  code: string;
  /** Vrai quand ce point est correctement configuré. */
  conforme: boolean;
  libelle: string;
  /** Ce que le point implique concrètement, quand il n'est pas conforme. */
  consequence: string;
  /** L'action qui le corrige. */
  correction: string;
}

/** Extrait le domaine d'un `EMAIL_FROM`, avec ou sans nom affiché. */
export function domaineExpediteur(from: string): string | null {
  const adresse = from.match(/<([^>]+)>/)?.[1] ?? from;
  const domaine = adresse.trim().split('@')[1];
  return domaine ? domaine.toLowerCase().replace(/>$/, '') : null;
}

/**
 * Expéditeurs partagés des fournisseurs, utilisés tant qu'aucun domaine n'est
 * vérifié. Ils fonctionnent pour un test mais n'ont ni SPF, ni DKIM, ni DMARC
 * rattachés à vous : les messages sont signés par un domaine commun à des
 * milliers d'expéditeurs, dont la réputation ne vous appartient pas.
 */
const DOMAINES_PARTAGES = ['resend.dev', 'sendinblue.com', 'brevo.com'];

export function estExpediteurPartage(from: string): boolean {
  const domaine = domaineExpediteur(from);
  return domaine !== null && DOMAINES_PARTAGES.includes(domaine);
}

/**
 * Passe en revue ce qui décide du classement en indésirables.
 *
 * L'ordre est celui de l'impact réel : le domaine d'expédition pèse plus que
 * tout le reste réuni.
 */
export function diagnosticDelivrabilite(): PointDelivrabilite[] {
  const from = config.email.from;
  const domaine = domaineExpediteur(from);
  const partage = estExpediteurPartage(from);
  const locale = applicationLocaleUniquement();

  const points: PointDelivrabilite[] = [
    {
      code: 'domaine_expediteur',
      conforme: !partage && domaine !== null,
      libelle: `Domaine d'expédition${domaine ? ` — ${domaine}` : ''}`,
      consequence:
        "L'expéditeur de test du fournisseur est partagé par des milliers de comptes : " +
        "vos messages ne sont ni signés ni authentifiés à votre nom, et Gmail les classe " +
        'presque systématiquement en indésirables.',
      correction:
        'Achetez un nom de domaine, ajoutez-le sur resend.com/domains, publiez les ' +
        'enregistrements DNS proposés (SPF, DKIM, DMARC), puis passez EMAIL_FROM sur une ' +
        'adresse de ce domaine.',
    },
    {
      code: 'liens_publics',
      conforme: !locale,
      libelle: 'Liens contenus dans les emails',
      consequence:
        `Les emails contiennent des liens vers ${config.appBaseUrl}, qui ne désigne que votre ` +
        'machine. Le destinataire ne peut pas les ouvrir, et un lien local est un signal ' +
        'de spam reconnu.',
      correction:
        "Déployez l'application, puis renseignez APP_BASE_URL avec son adresse publique.",
    },
    {
      code: 'alignement',
      conforme: partage || !domaine || alignementOk(domaine),
      libelle: "Cohérence entre l'expéditeur et les liens",
      consequence:
        `L'expéditeur utilise le domaine ${domaine}, alors que les liens pointent vers ` +
        `${config.appBaseUrl}. Un écart entre les deux affaiblit la confiance accordée au message.`,
      correction:
        'Utilisez le même domaine des deux côtés, par exemple contact@votredomaine.fr et ' +
        'https://app.votredomaine.fr.',
    },
  ];

  return points;
}

/** Vrai quand le domaine de l'expéditeur et celui des liens se recoupent. */
function alignementOk(domaineFrom: string): boolean {
  let hote: string;
  try {
    hote = new URL(config.appBaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  // « siteforge.fr » et « app.siteforge.fr » sont alignés ; deux domaines
  // distincts ne le sont pas.
  const racine = (d: string) => d.split('.').slice(-2).join('.');
  return racine(hote) === racine(domaineFrom);
}
