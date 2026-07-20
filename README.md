# BabyFoot LEMO

Site statique pour Teams/GitHub Pages avec sauvegarde partagée dans Supabase.

## Fonctions incluses

### Matchs

- Matchs directs **1v1, 1v2 et 2v2**.
- Date et score obligatoires, sans match nul.
- Les résultats ne peuvent être enregistrés que dans le mois en cours.
- Archives filtrables par mois.
- Les mois précédents sont figés et restent consultables.
- Suppression d’un match du mois en cours via le mode administrateur.

### Statistiques mensuelles

- Chaque mois constitue une nouvelle saison.
- Les saisons précédentes sont consultables dans les onglets mensuels.
- Elo remis à 1000 au début de chaque mois.
- Aucun changement d’Elo pour un joueur qui ne joue pas.
- Minimum de 5 matchs mensuels pour apparaître au classement Elo.
- Une étoile est attribuée au premier du classement Elo lorsque le mois est terminé.
- Les autres statistiques sont également calculées uniquement sur le mois sélectionné.

### Elo

1. Chaque joueur commence le mois à 1000 Elo.
2. La force d’une équipe est la moyenne Elo de ses joueurs.
3. Une victoire inattendue rapporte plus qu’une victoire attendue.
4. L’écart du score n’influence pas l’Elo.
5. Les points gagnés par une équipe sont retirés à l’autre équipe.
6. En 1v2 ou 2v2, la variation de l’équipe est répartie entre ses joueurs.
7. Il n’existe aucune baisse liée à l’inactivité.

### Tournois et championnats

- Sélection indépendante des joueurs pour le tournoi et le championnat.
- Modes 1v1 et 2v2.
- Correction du tableau à élimination directe : les tours suivants sont préparés et les vainqueurs avancent automatiquement.
- Les BYE sont distribués sans créer de match vide bloquant.
- Les championnats peuvent continuer sur plusieurs jours et les résultats des mois précédents deviennent figés.

## Configuration

Dans `config.js` :

- `url` : URL du projet Supabase.
- `anonKey` : Publishable key, jamais une Secret key.
- `adminPin` : code utilisé pour activer les boutons de suppression dans les archives.

Le code administrateur est une protection légère côté navigateur. Il est visible dans les fichiers du site et ne remplace pas une authentification Supabase sécurisée.

## Publication GitHub Pages

Publier à la racine du dépôt :

- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `supabase-setup.sql`
- `README.md`
- `assets/`

Dans GitHub : **Settings > Pages > Deploy from a branch > main > /root**.

## Supabase

La structure SQL ne change pas : toutes les nouvelles propriétés sont enregistrées dans le champ JSON `data` de la ligne `id = main`. Une installation existante reste compatible sans recréer la table.
