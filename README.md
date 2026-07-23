# BabyFoot LEMO — version 3.3

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
- À la fin du mois, une étoile d’or est attribuée au 1er, une étoile d’argent au 2e et une étoile de bronze au 3e.
- Les étoiles restent affichées sur le nom des joueurs et se cumulent automatiquement au fil des saisons terminées.
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
- En mode administrateur, les résultats de tournoi et de championnat du mois en cours peuvent être supprimés depuis le tableau ou l’historique.
- La suppression d’un résultat de tournoi réinitialise les tours suivants qui en dépendent ; la suppression d’un résultat de championnat remet le match à jouer.

## Configuration

Dans `config.js` :

- `url` : URL du projet Supabase.
- `publishableKey` : Publishable key, jamais une Secret key.
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


## Connexion Supabase

Cette version utilise directement l’API REST Supabase et ne dépend plus du CDN `supabase-js`. En cas de coupure réseau, trois tentatives sont effectuées puis la sauvegarde locale du navigateur est affichée sans être supprimée.


## Sécurité des clés Supabase

Le navigateur doit utiliser uniquement `publishableKey` dans `config.js`. Une clé `sb_secret_...` ne doit jamais être ajoutée au site ou publiée sur GitHub. Si une clé secrète a été copiée dans un message ou un dépôt, elle doit être révoquée puis recréée dans Supabase > Settings > API Keys.

## Mouvements Elo dans l’historique

- Le « dernier mouvement » du classement correspond maintenant au dernier match joué par le joueur.
- Lorsque plusieurs matchs ont la même date, l’heure réelle d’enregistrement détermine leur ordre.
- Chaque résultat affiche le mouvement Elo de tous les joueurs : vainqueurs en vert et perdants en rouge.


## Version 3.5

- `index.html` charge désormais `app.js?v=3.5.0` et `styles.css?v=3.5.0` afin d’éviter l’ancien cache navigateur.
- Chaque ligne d’historique possède un bloc visible « Mouvements Elo ».
- La correspondance utilise l’identifiant du match et une signature de secours (date, équipes, score et vainqueur).
- Le classement conserve comme dernier mouvement celui du dernier match joué dans la saison.
