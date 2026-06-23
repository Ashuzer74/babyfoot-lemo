# BabyFoot LEMO

Site statique pour un groupe Teams de babyfoot.

## Fonctions principales

### Joueurs
- Ajout de prénoms
- Suppression des joueurs
- Sauvegarde locale dans le navigateur

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

## Publication GitHub Pages

1. Créer un dépôt GitHub.
2. Déposer tous les fichiers à la racine.
3. Aller dans `Settings` > `Pages`.
4. Choisir `Deploy from a branch`.
5. Sélectionner `main` et `/root`.
6. Copier l'URL GitHub Pages dans Teams via un onglet `Site web`.

## Note

Les données sont stockées dans le navigateur via `localStorage`.
Pour un historique partagé entre tous les utilisateurs Teams, il faudra connecter SharePoint, Excel Online ou une petite base.
