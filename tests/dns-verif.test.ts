import { describe, expect, it } from 'vitest';
import { CIBLE_VERCEL, interpreter } from '../scripts/dns-verif.mjs';

const RACINE = 'siteforgeai.fr';

interface Resultat {
  nom: string;
  etat: string;
  constat: string;
  correction: string | null;
}

function juger(lectures: Record<string, string[]>, nom: string): Resultat {
  return (interpreter(lectures, RACINE) as Resultat[]).find((r) => r.nom === nom)!;
}

describe('lecture des CNAME vers l’hébergeur', () => {
  it('accepte la bonne cible, avec ou sans point final', () => {
    expect(juger({ app: [CIBLE_VERCEL] }, 'app').etat).toBe('ok');
    expect(juger({ app: [`${CIBLE_VERCEL}.`] }, 'app').etat).toBe('ok');
  });

  it('reconnaît le point final oublié, et le nomme', () => {
    // L'erreur la plus fréquente : l'interface suffixe silencieusement le
    // domaine, et l'enregistrement résout vers un nom qui n'existe pas.
    const resultat = juger({ app: [`${CIBLE_VERCEL}.${RACINE}`] }, 'app');
    expect(resultat.etat).toBe('errone');
    expect(resultat.constat).toContain('point final');
    expect(resultat.correction).toContain(`${CIBLE_VERCEL}.`);
  });

  it('distingue un enregistrement absent d’un enregistrement faux', () => {
    // Les deux corrections diffèrent : créer, ou rouvrir et corriger.
    expect(juger({ app: [] }, 'app').etat).toBe('manquant');
    expect(juger({ app: ['autre-hebergeur.example.com'] }, 'app').etat).toBe('errone');
  });

  it('confirme le générique en sondant un nom jamais créé', () => {
    const resultats = interpreter({ wildcard: [CIBLE_VERCEL] }, RACINE) as Resultat[];
    expect(resultats.find((r) => r.nom === 'sondage générique')?.etat).toBe('ok');
  });

  it('ne confirme aucun générique quand rien ne résout', () => {
    const resultats = interpreter({ wildcard: [] }, RACINE) as Resultat[];
    expect(resultats.find((r) => r.nom === 'sondage générique')).toBeUndefined();
  });
});

describe('lecture du SPF', () => {
  it('refuse un SPF qui n’autorise pas le fournisseur d’envoi', () => {
    // Le SPF posé par défaut par un hébergeur de messagerie : présent,
    // valide, et fermé à tout autre expéditeur.
    const resultat = juger({ spf: ['v=spf1 include:mx.ovh.com -all'] }, 'SPF');
    expect(resultat.etat).toBe('errone');
    expect(resultat.constat).toContain('refus ferme');
  });

  it('signale l’absence d’autorisation sans dramatiser un SPF souple', () => {
    const resultat = juger({ spf: ['v=spf1 include:mx.ovh.com ?all'] }, 'SPF');
    expect(resultat.etat).toBe('errone');
    expect(resultat.constat).not.toContain('refus ferme');
  });

  it('accepte un SPF qui autorise Resend', () => {
    expect(juger({ spf: ['v=spf1 include:amazonses.com ~all'] }, 'SPF').etat).toBe('ok');
    expect(juger({ spfSend: ['v=spf1 include:resend.com ~all'] }, 'SPF').etat).toBe('ok');
  });

  it('signale un SPF absent', () => {
    expect(juger({}, 'SPF').etat).toBe('manquant');
  });
});

describe('lecture des autres enregistrements d’emailing', () => {
  it('constate DKIM et DMARC sans en valider le contenu', () => {
    // Leur forme exacte est imposée par le fournisseur et change ; la
    // recomposer de tête est le meilleur moyen de la casser.
    expect(juger({ dkim: ['p=MIGfMA0...'] }, 'DKIM').etat).toBe('ok');
    expect(juger({ dmarc: ['v=DMARC1; p=none;'] }, 'DMARC').etat).toBe('ok');
  });

  it('signale un DMARC absent ou qui n’en est pas un', () => {
    expect(juger({ dmarc: [] }, 'DMARC').etat).toBe('manquant');
    expect(juger({ dmarc: ['autre chose'] }, 'DMARC').etat).toBe('manquant');
  });

  it('explique ce que coûte un _acme-challenge manquant', () => {
    const resultat = juger({ acme: [] }, '_acme-challenge');
    expect(resultat.etat).toBe('manquant');
    expect(resultat.constat).toContain('avertissement de sécurité');
  });
});
