/**
 * Interprétation des enregistrements DNS lus pour le domaine racine.
 *
 * Séparé de la résolution elle-même pour être testable sans réseau : le
 * diagnostic est ici, les requêtes sont dans check-dns.mjs.
 *
 * Deux erreurs silencieuses à attraper. La première : une cible saisie sans
 * point final, que certaines interfaces — OVH notamment — suffixent du domaine,
 * donnant un enregistrement qui existe, résout, et ne mène nulle part. La
 * seconde : des entrées créées chez le registrar alors que la zone est
 * déléguée ailleurs, auquel cas elles n'ont simplement aucun effet.
 */

export const CIBLE_VERCEL = 'cname.vercel-dns.com';

const OK = 'ok';
const MANQUANT = 'manquant';
const ERRONE = 'errone';

/**
 * Juge un CNAME attendu vers l'hébergeur.
 *
 * `valeurs` est ce que le résolveur a renvoyé : une liste vide signifie que le
 * nom n'existe pas, ce qui n'a pas la même correction qu'une cible fausse.
 */
function jugerCname(nom, valeurs, racine, role) {
  if (!valeurs || valeurs.length === 0) {
    return {
      nom,
      etat: MANQUANT,
      role,
      constat: "L'enregistrement n'existe pas.",
      correction:
        `Créez un CNAME « ${nom} » vers « ${CIBLE_VERCEL}. » — point final compris — ` +
        'dans le tableau de bord qui fait autorité sur la zone (voir les serveurs de noms ci-dessus).',
    };
  }

  const cible = valeurs[0].replace(/\.$/, '').toLowerCase();

  if (cible === CIBLE_VERCEL) {
    return { nom, etat: OK, role, constat: `Pointe vers ${cible}.`, correction: null };
  }

  // Le symptôme du point final oublié : OVH a concaténé le domaine racine.
  if (cible === `${CIBLE_VERCEL}.${racine}`.toLowerCase()) {
    return {
      nom,
      etat: ERRONE,
      role,
      constat:
        `Pointe vers « ${cible} », qui n'existe pas : le domaine « .${racine} » a été ajouté ` +
        'à la fin parce que la cible a été saisie sans point final.',
      correction: `Rouvrez l'entrée et saisissez « ${CIBLE_VERCEL}. » — point final compris.`,
    };
  }

  return {
    nom,
    etat: ERRONE,
    role,
    constat: `Pointe vers « ${cible} » au lieu de « ${CIBLE_VERCEL} ».`,
    correction: `Corrigez la cible chez OVH : « ${CIBLE_VERCEL}. »`,
  };
}

/**
 * Sous-domaines qu'un service tiers réclame pour lui-même.
 *
 * Ils doivent être déclarés explicitement, car l'enregistrement générique les
 * capterait sinon : un générique ne s'applique qu'aux noms qui n'ont pas
 * d'enregistrement propre, mais il s'applique à TOUS les autres. Un
 * sous-domaine attendu ailleurs et non déclaré ne produit donc pas une erreur
 * visible — il répond, et répond faux.
 */
export const SOUS_DOMAINES_RESERVES = ['send', 'rsend'];

/**
 * Juge l'autorisation d'envoi.
 *
 * Resend propose deux dispositions. L'ancienne ajoute un `include:` au SPF du
 * domaine. La nouvelle délègue un sous-domaine d'envoi entier par CNAME : le
 * SPF vérifié est alors celui que Resend publie sur ce sous-domaine, et celui
 * du domaine principal ne concerne plus que votre messagerie. Les confondre
 * conduit à « corriger » un SPF qui n'avait rien à se reprocher.
 */
function jugerEnvoi(lectures, racine) {
  const role = 'Autorise votre fournisseur à écrire en votre nom.';
  const cible = (lectures.sendCname ?? [])[0]?.replace(/\.$/, '').toLowerCase();

  // Le générique répond à la place du sous-domaine d'envoi : l'enregistrement
  // que Resend réclame n'a pas été créé, et rien ne le signale.
  if (cible === CIBLE_VERCEL) {
    return {
      nom: 'Envoi (sous-domaine délégué)',
      etat: ERRONE,
      role,
      constat:
        `« send.${racine} » pointe vers l'hébergeur du site, pas vers Resend. ` +
        "C'est l'enregistrement générique « * » qui répond à sa place : il capte tout nom " +
        "qui n'a pas d'enregistrement propre.",
      correction:
        `Créez des CNAME explicites « send » et « rsend » vers les cibles que ` +
        'resend.com/domains affiche. Déclarés nommément, ils passent devant le générique.',
    };
  }

  if (cible) {
    return {
      nom: 'Envoi (sous-domaine délégué)',
      etat: OK,
      role,
      constat: `« send.${racine} » est délégué à « ${cible} ».`,
      correction: null,
    };
  }

  // Aucune délégation : c'est le SPF du domaine principal qui fait foi.
  const spf = (lectures.spf ?? []).find((v) => v.includes('v=spf1'));

  if (!spf) {
    return {
      nom: 'SPF',
      etat: MANQUANT,
      role,
      constat: 'Aucun SPF, et aucun sous-domaine d’envoi délégué.',
      correction: 'Suivez la disposition que resend.com/domains affiche pour votre domaine.',
    };
  }

  if (/include:.*(resend|amazonses)/i.test(spf)) {
    return { nom: 'SPF', etat: OK, role, constat: `Autorise Resend : « ${spf} ».`, correction: null };
  }

  const ferme = /[-~]all\s*$/.test(spf.trim());
  return {
    nom: 'SPF',
    etat: ERRONE,
    role,
    constat:
      `« ${spf} » n'autorise pas Resend` +
      (ferme ? ', et se termine par un refus ferme : vos emails échoueront au contrôle SPF.' : '.'),
    correction:
      'Sur resend.com/domains, suivez la disposition affichée : soit un sous-domaine ' +
      'd’envoi délégué par CNAME, soit un « include: » à ajouter au SPF existant. ' +
      'N’ajoutez jamais un second enregistrement SPF — un domaine n’en accepte qu’un.',
  };
}

/**
 * Juge l'ensemble des enregistrements du domaine.
 *
 * `lectures` porte ce que le résolveur a trouvé, chaque clé pouvant être
 * absente (nom inexistant) ou une liste de valeurs.
 */
export function interpreter(lectures, racine) {
  const resultats = [
    jugerCname('app', lectures.app, racine, "L'application elle-même."),
    jugerCname('*', lectures.wildcard, racine, 'Tous les sites clients.'),
  ];

  // Le générique se teste sur un nom qui n'a jamais été créé : s'il résout,
  // c'est que l'enregistrement « * » couvre bien tout le domaine.
  if (lectures.wildcard?.length) {
    resultats.push({
      nom: 'sondage générique',
      etat: OK,
      role: 'Vérification que le générique couvre un nom jamais créé.',
      constat: `Un sous-domaine inédit résout déjà : les sites clients seront joignables.`,
      correction: null,
    });
  }

  const acme = lectures.acme;
  resultats.push(
    acme?.length
      ? {
          nom: '_acme-challenge',
          etat: OK,
          role: 'Certificat SSL générique.',
          constat: `Délègue la validation à « ${acme[0].replace(/\.$/, '')} ».`,
          correction: null,
        }
      : {
          nom: '_acme-challenge',
          etat: MANQUANT,
          role: 'Certificat SSL générique.',
          constat:
            "Sans lui, aucun certificat ne couvre « *." + racine + " » : " +
            'les sites clients s’ouvriront sur un avertissement de sécurité.',
          correction:
            `Vercel → Settings → Domains → ajoutez « *.${racine} » : la cible exacte s'affiche ` +
            'à ce moment-là. Recopiez-la en CNAME dans votre zone, avec le point final.',
        },
  );

  // --- Emailing ------------------------------------------------------------
  // Resend impose la forme exacte de ces valeurs et la fait varier ; on
  // constate leur présence sans prétendre en valider le contenu.

  resultats.push(jugerEnvoi(lectures, racine));

  resultats.push(
    lectures.dkim?.length
      ? { nom: 'DKIM', etat: OK, role: 'Signe vos emails.', constat: 'Présent.', correction: null }
      : {
          nom: 'DKIM',
          etat: MANQUANT,
          role: 'Signe vos emails.',
          constat: 'Aucune clé DKIM trouvée sur resend._domainkey.',
          correction: 'Copiez le TXT que resend.com/domains affiche — c’est une très longue valeur.',
        },
  );

  resultats.push(
    (lectures.dmarc ?? []).some((v) => v.includes('v=DMARC1'))
      ? { nom: 'DMARC', etat: OK, role: 'Politique de traitement des usurpations.', constat: 'Présent.', correction: null }
      : {
          nom: 'DMARC',
          etat: MANQUANT,
          role: 'Politique de traitement des usurpations.',
          constat: 'Aucun DMARC sur _dmarc.',
          correction: 'Créez un TXT « _dmarc » valant « v=DMARC1; p=none; ».',
        },
  );

  return resultats;
}

export { OK, MANQUANT, ERRONE };
