import { describe, expect, it } from 'vitest';
import { verifierUrlBase } from '../scripts/env.mjs';

const VALIDE = 'postgresql://postgres:MonMotDePasse@db.abcdefgh.supabase.co:5432/postgres';

describe('vérification de la chaîne de connexion', () => {
  it('accepte une chaîne Supabase complète', () => {
    expect(verifierUrlBase(VALIDE)).toBeNull();
  });

  it('accepte le schéma court postgres://', () => {
    expect(verifierUrlBase('postgres://user:mdp@serveur.fr:5432/base')).toBeNull();
  });

  it('signale une chaîne absente', () => {
    expect(verifierUrlBase('')).toContain('DATABASE_URL absent');
    expect(verifierUrlBase(undefined)).toContain('DATABASE_URL absent');
  });

  it('signale le mot de passe laissé entre crochets', () => {
    // Le piège numéro un : la chaîne copiée depuis Supabase telle quelle.
    const message = verifierUrlBase(
      'postgresql://postgres:[YOUR-PASSWORD]@db.abcdefgh.supabase.co:5432/postgres',
    );
    expect(message).toContain('crochets');
    expect(message).toContain('YOUR-PASSWORD');
  });

  it('signale une URL qui n’en est pas une', () => {
    expect(verifierUrlBase('mon mot de passe secret')).toContain("n'est pas une URL valide");
  });

  it('refuse un protocole étranger', () => {
    expect(verifierUrlBase('mysql://user:mdp@serveur.fr:3306/base')).toContain('postgresql://');
  });

  it('reconnaît l’hôte « postgres », symptôme d’une URL mal formée', () => {
    // C'est exactement ce qui produit « ENOTFOUND postgres » à l'exécution :
    // le nom d'utilisateur a été pris pour le nom du serveur.
    const message = verifierUrlBase('postgresql://postgres');
    expect(message).toContain('aucun serveur valide');
    expect(message).toContain('Supabase');
  });
});
