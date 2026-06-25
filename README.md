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

## Mise en place Supabase

1. Ouvrir le projet Supabase.
2. Aller dans SQL Editor > New query.
3. Coller tout le contenu de supabase-setup.sql.
4. Cliquer sur Run.
5. Aller dans Table Editor.
6. Vérifier que la table babyfoot_state existe.
7. Vérifier qu'il y a une ligne avec id = main.

Ne pas utiliser Import table dans Table Editor.

## Configuration

Dans config.js :

- url = Project URL Supabase, sans /rest/v1/
- anonKey = Publishable key, jamais Secret key

## Publication GitHub Pages

1. Mettre tous les fichiers à la racine du dépôt.
2. Settings > Pages.
3. Source : Deploy from a branch.
4. Branch : main.
5. Folder : /root.
6. Attendre la republication.

## Test

1. Ouvrir le site GitHub Pages.
2. Le statut doit indiquer Synchronisé ou Sauvegardé en ligne.
3. Ajouter un joueur.
4. Ouvrir le site dans un autre navigateur.
5. Vérifier que le joueur apparaît.
