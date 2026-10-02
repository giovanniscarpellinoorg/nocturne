# Nocturne — Première expédition

Prototype de roguelike 2D dans le navigateur : sept salles, trois reliques, deux types d’ennemis et un boss à deux phases. Le donjon fixe reste disponible ; l’atelier permet de générer et de jouer d’autres expéditions.

**Aucun modèle IA ne tourne sur le Mac.** Les modèles Ollama Cloud sont sollicités uniquement quand vous lancez une génération dans l’atelier. Le catalogue public des modèles est consulté automatiquement par les ateliers, sans lancer de génération. Jouer au donjon fixe ou à un donjon déjà généré n’appelle aucun modèle. Le jeu n’a pas de dépendances à installer.

## Jouer

Depuis ce dossier, lancez `npm start`, puis ouvrez http://127.0.0.1:4173/ dans votre navigateur. Gardez le serveur ouvert pendant la partie. `Ctrl+C` l’arrête.

### Lancer avec Docker

Docker et Docker Compose permettent de lancer le même serveur sans installer Node.js localement :

```bash
docker compose up --build
```

Ouvrez ensuite http://127.0.0.1:4173/. Les dessins, avis, salles et journaux sont conservés dans le dossier local `./private`, monté dans le conteneur sous `/app/.private`. Pour utiliser Ollama Cloud, exportez `OLLAMA_API_KEY` avant le lancement ou créez un fichier `.env` local ; la clé n’est jamais copiée dans l’image :

```bash
export OLLAMA_API_KEY="votre_cle_ollama"
docker compose up --build
```

Arrêtez le service avec `docker compose down`. Le dossier `./private` reste présent et n’est pas supprimé par cette commande.

Pour un déploiement derrière un reverse proxy, copiez `docker-compose.override.yml` et adaptez `NOCTURNE_ALLOWED_HOSTS` au nom DNS public. L’override retire le port publié et utilise le réseau Docker externe `proxy` : créez-le une fois avec `docker network create proxy`. Le proxy doit transmettre l’en-tête `Host` et l’origine HTTPS du domaine public.

Pour transférer les données de l’ancien `.private` vers le serveur sans envoyer la clé Ollama, utilisez `rsync` :

```bash
rsync -a --exclude 'credentials/' .private/ utilisateur@serveur:/srv/nocturne/private/
```

- ZQSD ou WASD : déplacement.
- Flèches directionnelles, ou clic maintenu en visant à la souris : tir.
- Espace : esquive, avec un court délai de recharge.
- Échap : pause / reprise.
- **Plein écran**, au-dessus de l’arène : agrandit le jeu avec sa vie, son chronomètre et ses commandes. Le bouton **Quitter le plein écran** ou Échap permet de sortir ; la partie se met alors en pause. Si le navigateur ne propose pas cette API, un mode agrandi dans la page prend le relais.
- Sur écran tactile : boutons de déplacement et esquive, visée automatique.

Terminez les trois salles de combat pour ouvrir l’accès au gardien. Marchez sur les reliques au centre des salles pour les ramasser. Chaque combat terminé rend un cœur. Une défaite ou le bouton Recommencer relance le même donjon.

La navigation **Jouer · Donjons · Sprites · Salles · Codex** est identique sur toutes les vues, avec la page active indiquée. Lors du test d’un sprite ou d’une salle, le jeu propose aussi un lien de retour vers son atelier.

## Atelier Ollama

Ouvrez **Atelier Ollama** depuis le jeu, ou http://127.0.0.1:4173/generator.html.

1. Enregistrez votre clé dans **Connexion Ollama**, si aucune clé n’est configurée.
2. Choisissez un modèle dans le catalogue cloud Ollama, et éventuellement une ambiance.
3. Choisissez **Essai libre** pour une nouvelle proposition, ou **Donjon du jour** pour créer ou retrouver le donjon daté en heure de Paris.
4. Cliquez sur **Générer**, attendez l’aperçu, puis sur **Jouer ce donjon**.

**Voir l’exemple sans appel IA** permet de parcourir l’interface avec le donjon fixe. Il ne teste pas le fournisseur. Un nouvel essai libre n’écrase jamais le donjon du jour. Le chargement d’un donjon quotidien existant ne relance pas l’IA. Il n’y a pas de planification automatique : le premier clic du jour déclenche sa génération.

La clé est stockée avec des permissions limitées au compte local dans `.private/credentials/`, hors du dossier public `dist/`. Le dossier `.private/` est ignoré par Git et doit rester exclu de tout partage du projet. `OLLAMA_API_KEY` dans l’environnement du serveur est également accepté et prend priorité sur la clé enregistrée. Les donjons générés sont conservés dans `.private/dungeons/`. Le navigateur conserve uniquement le donjon choisi pour jouer, jamais la clé. Les tests de génération utilisent des réponses simulées. La lecture réelle du catalogue ne lance aucune génération.

### Catalogue des modèles cloud

Le serveur lit `https://ollama.com/v1/models` et expose les identifiants via `/api/models`. Donjons, Sprites, Salles et la connexion du Codex utilisent la même liste ; la validation serveur des générations utilise également ce catalogue. Tous les modèles renvoyés sont proposés, sans filtre codé en dur. Leur qualité et leur capacité à respecter le JSON restent variables. Voir la [documentation cloud Ollama](https://docs.ollama.com/cloud).

La liste est mise en cache cinq minutes, dans `.private/credentials/cloud-models.json`. **Actualiser les modèles** force une nouvelle lecture. Les requêtes concurrentes sont regroupées. En cas de panne, la dernière liste reste disponible avec un message explicite ; si aucune liste n’a encore été obtenue, les deux anciens choix servent de secours. Une nouvelle tentative est possible après 30 secondes. Aucun secret n’est nécessaire pour ce catalogue public et la clé de génération reste côté serveur.

Le choix du modèle est mémorisé dans le navigateur et repris à l’ouverture des autres ateliers. Actualiser la liste conserve le choix s’il est toujours disponible. Les donjons déjà enregistrés restent jouables même après le retrait d’un modèle.

## Organisation

### Ollama Designer

Ouvrez http://127.0.0.1:4173/designer.html, ou **Ollama Designer** depuis le jeu. Décrivez un sujet, choisissez la taille et lancez le dessin avec la connexion Ollama existante. Les grilles disponibles sont **8, 16, 24, 32, 48 et 64 pixels** de côté. Les tailles de 32 à 64 sont expérimentales ; leur génération dispose d’un délai de cinq minutes.

Le sélecteur **Méthode de dessin** propose **Outils de dessin** par défaut et **Pixels directs** pour comparer avec le mode précédent. La réutilisation automatique est décochée par défaut pour produire un nouvel essai. En mode outils, Ollama dessine avec `pixel`, `rectangle`, `ellipse`, `ligne` et `polygone`, exécutés dans l’ordre sur un fond transparent. Le moteur convertit ces formes en pixels nets. Une couleur transparente efface ; les superpositions remplacent les pixels précédents. Aucun code généré n’est exécuté. Les commandes sont limitées à 256, les polygones à 32 sommets, et toutes les formes doivent tenir dans la grille.

Les commandes sont conservées avec le dessin : **Voir les commandes de dessin** permet de les inspecter, et **Exporter les commandes** de les télécharger. PNG et JSON de pixels restent disponibles. Une référence issue du mode outils transmet ses commandes à Ollama pour faciliter les retouches. Les journaux indiquent les outils employés et les superpositions. La réutilisation automatique en mode outils ne sélectionne que des créations issues de ce même mode. La qualité artistique reste à évaluer ; aucune boucle d’autocritique visuelle n’est ajoutée.

Ollama dessine les pixels sans bibliothèque de sprites prédessinés. En mode Pixels directs, pour les petites tailles, il renvoie des coordonnées et des couleurs. À partir de 32 pixels, le prompt demande une palette et des lignes compactes, un caractère par pixel, pour réduire la longueur de la réponse. Le serveur convertit cette représentation en `{x, y, rgba: "#RRGGBBAA"}` pour l’aperçu, la sauvegarde et l’export JSON. L’export PNG conserve la taille native et la transparence. Si plusieurs entrées ciblent le même pixel, **la dernière couleur remplace les précédentes** ; le journal indique les doublons et les couleurs remplacées. Pour les grilles compactes, les marges transparentes en excès à droite ou en bas sont retirées et les marges manquantes sont complétées. Les positions et couleurs des pixels dessinés restent inchangées ; chaque correction est journalisée. Un débordement coloré, une couleur invalide ou une réponse interrompue restent rejetés.

Le carnet conserve les dessins dans `.private/sprites/`. Vous pouvez les consulter sans appel IA, les utiliser comme références ou laisser Ollama réutiliser à l’identique un dessin pertinent parmi les douze créations récentes de même taille. Le bouton **Tester en jeu** charge un sprite typé dans le donjon de test avec ses statistiques. Le générateur de donjons ne compose pas encore automatiquement une expédition avec plusieurs de ces sprites.

### Carnet, avis et variantes

Le carnet propose une recherche dans les noms, descriptions, commentaires et tags, des filtres par type, taille, modèle, statut, note minimale et famille, ainsi qu’un tri par date, note ou nom.

Chaque sprite dispose d’une **note sur 5**, d’un statut **À revoir / Validé / Écarté**, de tags et de deux commentaires : **Ce qui fonctionne** et **À améliorer**. Enregistrez l’avis avant de lancer une variante. Ces modifications ne consomment pas de quota. Une variante est un nouveau dessin relié à son parent et à sa famille ; l’original et ses avis sont conservés. **Voir la famille** affiche les versions ensemble. La variante commence sans note, pour l’évaluer indépendamment.

**Transmettre mes notes et retours** est activé par défaut. Le prompt reprend les avis de la référence et jusqu’à trois bons exemples et trois exemples à améliorer du même type (noms, descriptions et avis). La référence fournit aussi son dessin ou ses commandes. Ce contexte guide la prochaine demande ; il ne réentraîne pas Ollama. La case permet de le désactiver. Les sprites écartés ou notés 1–2 ne sont jamais réutilisés automatiquement à l’identique. Le journal indique les identifiants des avis transmis.

### Atelier de salles

Ouvrez **Salles** depuis le jeu ou le Designer : http://127.0.0.1:4173/rooms.html.

1. Choisissez un personnage du carnet ou le héros de base.
2. Sélectionnez un sprite à gauche et cliquez dans la grille pour le placer. **Placer les bases** propose une disposition avec les types disponibles, dont deux ennemis si le carnet en contient un.
3. Utilisez **Déplacer**, le glisser-déposer, ou les champs X/Y ; **Retirer la sélection** et **Annuler** permettent de corriger la disposition.
4. **Enregistrer la salle**, puis **Jouer cette salle**. Éliminez tous les ennemis, récupérez les objets, puis rejoignez la sortie à droite.

Une salle peut contenir jusqu’à 40 éléments, avec plusieurs instances d’un même sprite, plusieurs objets et un boss au maximum. Les collisions et la résistance des murs sont indépendantes. Les récompenses deviennent récupérables une fois le combat terminé et ne s’appliquent qu’une fois. Recommencer restaure la salle entière. Le validateur vérifie les limites, les superpositions et l’accessibilité du départ, des ennemis, des récompenses et de la sortie avec les murs intacts. La sortie est fixe ; les sprites de portes restent utilisables dans le test individuel, pas dans cet éditeur.

**Proposer un plan avec Ollama** choisit des sprites existants du carnet en tenant compte de leurs avis, parmi les 40 mieux notés hors sprites écartés. Un plan invalide déclenche au maximum un deuxième essai. Le plan reçu reste modifiable avant sauvegarde. Cette fonction ne dessine pas encore les sprites manquants : créez-les dans le Designer. La génération partage le verrou et le délai de 20 secondes avec les autres ateliers.

Les salles sont stockées dans `.private/rooms/` et jouables par `/?room=<id>`. Elles embarquent une copie des sprites et des statistiques utilisés. Les modifications ultérieures du carnet ne changent pas ces copies, y compris lors d’une modification de la disposition. Pour employer une nouvelle version d’un sprite, créez une variante et placez-la. Cet atelier compose une salle ; le générateur historique de donjons reste distinct.

### Types de sprites et jeu

Choisissez un **Type de sprite à créer** : personnage, ennemi, décor, mur, objet interactif ou boss. Ollama fournit le dessin et une fiche de statistiques adaptée au type. **Dessin libre** conserve le fonctionnement sans fiche jouable. Le carnet peut être filtré par type ; la réutilisation automatique respecte le type demandé.

Sous chaque dessin, **Fiche de jeu** permet de changer le type et ses valeurs, puis de les enregistrer sans appel IA. Les anciens dessins peuvent être classés de cette façon. Les modifications doivent être enregistrées avant **Tester en jeu**. Le lien `/?asset=<id>` charge le sprite depuis le serveur et lance le donjon de test :

- **Personnage** : remplace le héros ; cœurs, dégâts, vitesse et délai entre tirs modifiables.
- **Ennemi** : vie, dégâts, vitesse, cadence et comportement : poursuivre, tirer à distance, charger avec avertissement ou patrouiller. Test dans la salle de départ.
- **Décor** : plante ou mobilier dans la salle de départ, avec collision facultative. Une porte habille les passages existants, ouverts ou fermés selon les combats ; ses dimensions et son option de collision ne modifient pas ces passages.
- **Mur** : obstacle dans la salle de départ, dimensions et résistance réglables. Un mur destructible disparaît sous les tirs du joueur et libère le passage.
- **Objet interactif** : posé dans la salle de départ, ramassé en marchant dessus ; soin, cœurs supplémentaires, dégâts, vitesse, cadence, tirs multiples ou traversants. L'effet n'est appliqué qu'une fois par partie. Le test d'un objet de soin commence avec deux cœurs manquants.
- **Boss** : test immédiat dans l'arène finale ; vie, dégâts, motif, vitesse des projectiles et délai entre attaques sont réglables. La deuxième phase accélère les attaques sous 45 % de vie.

Le test porte sur un sprite à la fois ; les autres éléments restent ceux du donjon fixe. Recommencer restaure les stats et l'état initial (objet disponible, mur intact, boss en vie). Les sprites sont des images fixes avec les mouvements du moteur, pas encore des animations dessinées image par image. Les fiches sont sauvegardées avec les sprites et leurs commandes ; les statistiques sont validées côté serveur et dans le moteur.

Le **Journal de génération** affiche les 30 dernières tentatives : étapes horodatées, durée, modèle, taille, statut HTTP, compteurs de tokens lorsqu’Ollama les fournit, corrections et réponse brute. Il s’actualise pendant le dessin et peut être exporté. Chaque tentative est conservée dans `.private/sprites/logs/<id>.json` avec des permissions privées, et ses étapes sont aussi écrites dans le terminal du serveur. La clé API et les en-têtes d’autorisation ne sont pas enregistrés. Les journaux contiennent la consigne et la réponse du modèle. Les tentatives antérieures à l’ajout du journal ne sont pas récupérables.

Après une modification du serveur, redémarrez `npm start`, puis rechargez la page. Les tests du Designer utilisent un fournisseur simulé, sans consommer de quota.

### Fichiers

- `dist/dungeon.mjs` : donjon de test, objets et boss.
- `dist/engine.mjs` : déplacements, collisions, projectiles, combats et progression.
- `dist/render.mjs` : affichage du jeu et carte.
- `dist/game.mjs` : commandes et interface.
- `dist/fullscreen.mjs` : plein écran, mode agrandi de secours et dimensions de l’arène.
- `dist/model-picker.mjs` : sélecteur de modèles partagé et préférence locale.
- `scripts/models.mjs` : catalogue cloud, validation des identifiants et cache.
- `dist/generator.html` et `dist/generator.mjs` : atelier de génération et aperçu.
- `dist/core.mjs` : format des donjons et vérifications réutilisables pour la future génération IA.
- `scripts/server.mjs` et `scripts/cloud.mjs` : serveur local et connexion Ollama Cloud, liés uniquement à 127.0.0.1.
- `dist/designer.html`, `dist/designer.mjs`, `dist/designer.css` : atelier de dessin et journal.
- `dist/rooms.html`, `dist/rooms.mjs`, `dist/rooms.css` : éditeur et gestion des salles.
- `dist/scene.mjs`, `dist/scene-run.mjs`, `dist/enemies.mjs` : validation des salles et comportements jouables.
- `scripts/rooms.mjs` : composition Ollama et sauvegardes avec copies des sprites.
- `dist/sprite-review.mjs` : avis, filtres et sélection du contexte artistique.
- `dist/assets.mjs` : types, fiches de jeu, limites et effets des objets.
- `dist/pixels.mjs` : validation, correction des doublons, formats de pixels et affichage.
- `scripts/designer.mjs` et `scripts/designer-logs.mjs` : génération, archivage et diagnostics du Designer.

Les polices sont chargées depuis Google Fonts quand le réseau est disponible, avec des polices de secours sinon. Le jeu n’a pas besoin d’un service IA ni d’une clé API.

## Versionner le projet

À inclure dans Git : `dist/` (code du jeu et images), `scripts/`, `package.json`, `README.md` et `.gitignore`. Malgré son nom, `dist/` contient les sources du navigateur : aucune étape de compilation ne le recrée.

À garder en local : `.private/` (clé Ollama et donjons générés), `.env*` hors éventuel `.env.example`, `.openai/`, `.sites-runtime/`, `node_modules/`, les journaux et `.DS_Store`. Ces fichiers sont exclus par `.gitignore`. Après un clonage, lancer `npm start` puis renseigner sa propre clé dans l’atelier si nécessaire.

## Vérifications

`npm test` vérifie la connexion des salles, les passages, les limites des données, une expédition complète simulée, la conservation du donjon quotidien et la protection des requêtes locales. Les tests Ollama utilisent un fournisseur simulé et ne consomment pas de quota.

L’équilibrage et la qualité des compositions proposées par chaque modèle restent à évaluer en jouant.
