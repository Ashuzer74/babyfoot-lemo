# BabyFoot LEMO

Site statique pour un onglet Teams, avec sauvegarde partagée Supabase.

## Fichiers à publier à la racine GitHub

- index.html
- app.js
- styles.css
- config.js
- supabase-setup.sql
- README.md
- assets/

## Nouveautés incluses

- Connexion Supabase conservée via `config.js`.
- Suppression des boutons de vidage, reset et suppression d'historique.
- Page `Matchs & tournois` :
  - matchs directs 1v1 / 2v2 avec date et score,
  - tournoi à élimination directe 1v1 / 2v2,
  - championnat tous contre tous 1v1 / 2v2 avec date et score par match,
  - archives lecture seule.
- Page `Statistiques` :
  - classement officiel par points,
  - classement Elo,
  - pourcentage de victoire,
  - buts marqués + moyenne par match,
  - buts pris + moyenne par match,
  - synthèse complémentaire.

## Règles de classement

- Classement officiel : victoire = 3 points, défaite = 0 point.
- Match nul interdit : il faut un gagnant.
- Elo de départ : 1000.
- Formule Elo : `delta = 32 × (résultat - probabilité attendue)`.
- En 2v2, la cote de l'équipe est la moyenne Elo des deux joueurs.
- Battre un joueur ou une équipe mieux coté rapporte donc plus de points Elo.

## Mise en place Supabase

Si la table existe déjà, il n'est pas obligatoire de relancer le SQL. Le nouveau site sait reprendre l'ancienne structure et ajouter les nouveaux champs.

Pour une première installation :

1. Ouvrir le projet Supabase.
2. Aller dans SQL Editor > New query.
3. Coller tout le contenu de `supabase-setup.sql`.
4. Cliquer sur Run.
5. Aller dans Table Editor.
6. Vérifier que la table `babyfoot_state` existe.
7. Vérifier qu'il y a une ligne avec `id = main`.

Ne pas utiliser Import table dans Table Editor.

## Configuration

Dans `config.js` :

- `url` = Project URL Supabase, sans `/rest/v1/`
- `anonKey` = Publishable key, jamais Secret key

## Publication GitHub Pages

1. Mettre tous les fichiers à la racine du dépôt.
2. Settings > Pages.
3. Source : Deploy from a branch.
4. Branch : main.
5. Folder : /root.
6. Attendre la republication.

## Important sécurité

Les boutons de suppression ont été retirés de l'interface. Avec une clé Supabase publishable côté navigateur, un utilisateur très technique pourrait toujours tenter de modifier les données directement s'il connaît le projet. Pour une protection stricte, il faudra ensuite ajouter une authentification ou passer par des fonctions Supabase contrôlées côté serveur.
