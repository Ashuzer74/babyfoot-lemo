# BabyFoot LEMO

Site statique pour un groupe Teams de babyfoot, avec sauvegarde partagée Supabase.

## Fonctions principales

### Joueurs
- Ajout de prénoms depuis l'app
- Suppression des joueurs depuis l'app
- Sauvegarde partagée en ligne via Supabase

### Match standard
- 1v1 ou 2v2
- Équipes aléatoires
- Score final direct
- Gagnant calculé automatiquement selon le plus gros score
- Pari vainqueur facultatif
- Archive dédiée aux matchs standards
- Classement dédié aux matchs standards

### Tournoi
- Générateur de tournoi 1v1 ou 2v2
- Format élimination directe
- Format championnat / tous contre tous
- Sélection simple du gagnant
- Mise à jour automatique de l'arbre
- Archive dédiée au tournoi
- Classement dédié au tournoi

## Sauvegarde partagée

L'app utilise maintenant Supabase pour stocker les données dans une table commune :

- joueurs
- matchs standards
- classement standard
- tournoi en cours
- archive tournoi
- classement tournoi

Tout est stocké dans une seule table Supabase : `babyfoot_state`.

Le fichier `config.js` doit être complété avec :

- Project URL
- anon public key

Important : ne jamais utiliser la clé `service_role` dans `config.js`.

## Mise en place Supabase

1. Créer un projet Supabase.
2. Aller dans `SQL Editor`.
3. Coller le contenu du fichier `supabase-setup.sql`.
4. Cliquer sur `Run`.
   - Le script crée la table, donne les droits nécessaires et active les règles RLS simples.
5. Aller dans `Project Settings` > `Data API` ou `API`.
6. Copier :
   - Project URL
   - anon public key
7. Ouvrir `config.js`.
8. Remplacer les valeurs d'exemple.
9. Envoyer les fichiers sur GitHub.

## Publication GitHub Pages

1. Créer ou ouvrir le dépôt GitHub.
2. Déposer tous les fichiers à la racine du dépôt.
3. Aller dans `Settings` > `Pages`.
4. Choisir `Deploy from a branch`.
5. Sélectionner `main` et `/root`.
6. Copier l'URL GitHub Pages dans Teams via un onglet `Site web`.

## Test rapide

1. Ouvrir le site depuis un navigateur.
2. Vérifier le message sous l'en-tête : `Synchronisé avec la sauvegarde partagée`.
3. Ajouter un joueur.
4. Ouvrir le site sur un autre PC ou navigateur.
5. Le joueur doit apparaître aussi.

## Limite connue

Cette version est volontairement simple : une seule sauvegarde partagée est utilisée.
Si deux personnes modifient exactement au même moment, la dernière sauvegarde peut remplacer la précédente.
Pour un babyfoot interne, c'est généralement suffisant.
