import { afterEach, describe, expect, it } from 'vitest';
import { optionsConnexion, traduireErreurConnexion } from '@/lib/db/pg-source';

const DIRECTE = 'postgresql://postgres:mdp@db.abcdefgh.supabase.co:5432/postgres';
const CONNECTEUR_SESSION = 'postgresql://postgres.abcd:mdp@aws-0-eu-west-3.pooler.supabase.com:5432/postgres';
const CONNECTEUR_TRANSACTION = 'postgresql://postgres.abcd:mdp@aws-0-eu-west-3.pooler.supabase.com:6543/postgres';

describe('options de connexion', () => {
  afterEach(() => {
    delete process.env.VERCEL;
  });

  it('désactive les requêtes préparées derrière un connecteur', () => {
    // En mode transaction, la session ne survit pas d'une requête à l'autre :
    // une requête préparée échoue dès sa seconde exécution.
    expect(optionsConnexion(CONNECTEUR_TRANSACTION, {}).prepare).toBe(false);
    expect(optionsConnexion(CONNECTEUR_SESSION, {}).prepare).toBe(false);
  });

  it('les conserve sur une connexion directe, où elles sont un gain', () => {
    expect(optionsConnexion(DIRECTE, {}).prepare).toBe(true);
  });

  it('n’ouvre qu’une connexion par instance sans serveur', () => {
    // Chaque instance a son propre lot : cinq par instance épuisent le quota
    // d'une base modeste, alors qu'une instance ne sert qu'une requête à la fois.
    expect(optionsConnexion(DIRECTE, { VERCEL: '1' }).max).toBe(1);
    expect(optionsConnexion(DIRECTE, { AWS_LAMBDA_FUNCTION_NAME: 'f' }).max).toBe(1);
    expect(optionsConnexion(DIRECTE, {}).max).toBe(5);
  });

  it('impose un délai de connexion explicite', () => {
    // Sans lui, une base injoignable consomme tout le temps alloué à la
    // fonction sans jamais rien expliquer.
    expect(optionsConnexion(DIRECTE, {}).connect_timeout).toBe(10);
  });

  it('ne s’effondre pas sur une URL inexploitable', () => {
    expect(() => optionsConnexion('pas une url', {})).not.toThrow();
  });
});

describe('traduction des échecs de connexion', () => {
  it('explique une base joignable en IPv6 seulement', () => {
    const err = Object.assign(new Error('connect ENETUNREACH 2600:1f18::1:5432'), {
      code: 'ENETUNREACH',
    });
    const traduite = traduireErreurConnexion(err);
    expect(traduite.message).toMatch(/IPv6/);
    expect(traduite.message).toMatch(/pooler/);
  });

  it('explique un délai dépassé', () => {
    expect(traduireErreurConnexion(new Error('CONNECT_TIMEOUT')).message).toMatch(/connecteur/);
  });

  it('avertit que le connecteur a son propre nom d’utilisateur', () => {
    // La faute classique : coller le mot de passe de la connexion directe
    // dans la chaîne du connecteur, dont l'utilisateur diffère.
    const traduite = traduireErreurConnexion(new Error('password authentication failed'));
    expect(traduite.message).toMatch(/nom d’utilisateur différent/);
  });

  it('laisse passer intacte une erreur qui n’est pas de connexion', () => {
    const err = new Error('relation « clients » does not exist');
    expect(traduireErreurConnexion(err)).toBe(err);
  });
});
