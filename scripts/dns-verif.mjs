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
 * Juge le SPF.
 *
 * Sa présence ne suffit pas : un SPF qui n'autorise pas le fournisseur d'envoi
 * est pire que pas de SPF du tout, puisqu'il le désigne explicitement comme
 * non autorisé. C'est le cas du SPF que pose un hébergeur de messagerie par
 * défaut — il n'autorise que ses propres serveurs, et se termine souvent par
 * « -all », un refus ferme.
 */
function jugerSpf(valeurs) {
  const role = 'Autorise votre fournisseur à écrire en votre nom.';
  const spf = valeurs.find((v) => v.includes('v=spf1'));

  if (!spf) {
    return {
      nom: 'SPF',
      etat: MANQUANT,
      role,
      constat: 'Aucun enregistrement SPF trouvé.',
      correction: 'Copiez le TXT que resend.com/domains affiche, sans le recomposer.',
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
      'Sur resend.com/domains, Resend indique où poser son SPF — le plus souvent sur un ' +
      'sous-domaine d’envoi dédié, ce qui laisse intact le SPF de votre messagerie. ' +
      'Suivez sa consigne plutôt que de modifier le SPF existant à la main.',
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

  resultats.push(jugerSpf((lectures.spf ?? []).concat(lectures.spfSend ?? [])));

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
