# Nocturne — Le dernier refuge

Un refuge persistant à faire grandir dans une forêt étrange. L’accueil `/` (ou `/refuge.html`) propose une première boucle jouable : partir avec un habitant, choisir quoi faire lors d’une rencontre, rentrer avec ses découvertes, construire et passer la nuit. Le plateau d’enquête et le prototype d’action restent accessibles depuis **Menu**, avec leurs sauvegardes et les ateliers existants.

## Le refuge

Le premier jour commence avec Mara, Abel et Sile, une auberge et deux chemins. Les bois proposent de secourir un renardeau ; la rivière permet de découvrir une source de braises. Les choix ouvrent deux autres lieux, et accueillir Brume ajoute un compagnon ainsi qu’une règle de récolte temporaire. Chaque lieu reste exploitable ensuite. Le talent du compagnon et l’atelier modifient les récoltes.

Cliquer sur un bâtiment permet de l’aménager ou de l’améliorer jusqu’au niveau 3 : l’auberge augmente les actions quotidiennes, le jardin produit des vivres, l’atelier améliore les récoltes de bois, le fanal soutient l’espoir. Les réserves vont de 0 à 99 et l’espoir de 0 à 10. Les nuits consomment un vivre pour deux habitants, arrondi au supérieur ; un repas incomplet réduit l’espoir, sans bloquer la reprise de l’exploration. Cette première version privilégie la découverte et la construction : l’espoir n’est pas encore une condition de défaite.

**La suite avec Ollama** écrit une rencontre à partir des habitants, lieux, souvenirs et événements en attente. Elle apparaît dans un lieu existant et propose deux ou trois choix, dont un gratuit. Les effets validés peuvent donner des ressources, modifier l’espoir, accueillir un habitant, découvrir un lieu ou ajouter une règle temporaire. Une règle modifie une récolte ou un stock à l’aube, pendant une à cinq nuits. Les effets sont réellement exécutés par le moteur ; aucun code du modèle n’est exécuté. Une seule rencontre Ollama attend à la fois. Les identités déjà présentes ou réservées par d’autres rencontres sont protégées. Ce format initial limite le monde à 30 habitants et 30 lieux.

**Façonner ce lieu**, ou **Dessin et animation** sur un habitant/bâtiment, permet de choisir un dessin et une animation dans le carnet, de dessiner avec Ollama ou de créer une variante. Les panoramas réutilisent la chaîne de composition / volumes / détails en 256 × 144. Les personnages et bâtiments sont en 64 × 64 et peuvent recevoir une animation au repos en quatre poses. Les anciens dessins et toutes les animations restent dans le carnet. Une illustration n’est remplacée qu’après validation. Les silhouettes et décors d’attente rendent le village jouable dès le départ ; aucune génération payante ne se lance automatiquement.

Chaque action est sauvegardée côté serveur dans `.private/dungeons/refuge/world.json`, y compris un choix d’expédition en attente de retour, les dessins et l’animation choisie. Il y a un refuge partagé par cette installation. Deux fenêtres concurrentes ne peuvent pas appliquer la même action : une révision dépassée est refusée et la vue est rechargée. Les sauvegardes illisibles ne sont pas réinitialisées silencieusement. Le refuge conserve les 200 derniers souvenirs et les 100 dernières lignes de journal ; le contexte envoyé au modèle reprend les 20 derniers souvenirs. Les générations de panoramas sont suivies après rechargement via les tâches persistantes de l’atelier. Une interruption du serveur impose de relancer la génération, en conservant le dessin précédent.

## Enquêter

La page `/enquete.html`, accessible dans **Menu → Les enquêtes**, ouvre le jeu de cartes. Chaque tour offre trois actions. Cliquez sur les lieux pour vous déplacer ; enquêtez pour réunir six indices, combattez ou esquivez les ennemis, puis gagnez le dernier lieu pour choisir une fin. Les règles complètes sont accessibles depuis le plateau. Une partie se sauvegarde automatiquement dans ce navigateur ; charger une autre enquête ou recommencer demande confirmation.

Le plateau présente les quatre lieux sous forme de cartes reliées en permanence. Les lignes sont issues du graphe de déplacement du moteur : les trajets depuis votre lieu sont dorés, les accès verrouillés sont en pointillés. Un pion indique votre position, et chaque lieu affiche ses indices et ses ennemis présents. Le bouton **Se déplacer** coûte une action ; cliquer sur l’illustration ouvre la fiche avec les liaisons nommées. La carte entière se cadre selon la largeur et la hauteur disponibles, en conservant la disposition des connexions.

Le plateau occupe la fenêtre sur ordinateur : investigateur, compteurs et équipement à gauche, lieux au centre, objectif, menace et ennemis à droite, puis main, pioche et défausse en bas. Les huit cartes possibles en main se partagent la largeur ; un clic ouvre leur fiche complète. L’histoire et le journal sont accessibles dans une fenêtre dédiée. Sur téléphone en portrait, les zones s’empilent et la main défile horizontalement pour conserver des cibles lisibles. Cliquer sur la pioche tire une carte pour une action ; la défausse se consulte librement.

Les tests d’enquête, de combat et d’esquive affichent un sac animé au centre du plateau, puis le jeton réellement tiré, le calcul face à la difficulté et les conséquences. **Révéler maintenant** passe l’animation, sans rejouer le test ; le résultat reste affiché jusqu’au retour au plateau. La pioche révèle la nouvelle carte, et la fin de tour présente les attaques, la rencontre et les changements de compteurs. Les autres actions affichent un retour temporaire, avec leur coût et leurs effets ; les compteurs concernés sont mis en évidence. Le réglage système de réduction des animations est respecté. La partie est sauvegardée avant la présentation du résultat.

**Entrer dans le lieu** ouvre sa scène en grand : le décor, l’investigateur et les ennemis y restent visibles et interactifs. Les sorties consomment une action. En attendant les illustrations, des décors et silhouettes d’attente gardent la scène lisible. Les nouveaux dessins de personnages sont demandés en pied sur fond transparent, les lieux en décor complet.

Les lieux se génèrent en **256 × 144, 32 couleurs** et les personnages en **64 × 96, 16 couleurs**. Ollama prépare d’abord la composition et la palette, puis peint une base, et ajoute une couche de détails à cette base. Une génération fait trois appels, avec au maximum un nouvel essai par étape en cas de réponse invalide. La progression est enregistrée dans `.private/sprites/illustration-jobs/` et peut être suivie après un rechargement de la page. Un arrêt du serveur interrompt le travail : il faut alors relancer la génération. Le journal de l’atelier conserve les réponses et les erreurs. L’illustration précédente n’est remplacée qu’une fois le nouveau dessin validé et sauvegardé ; ses pixels restent dans les anciens dessins du carnet. Ces grands formats sont fixes : variantes et animations de l’atelier restent pour l’instant réservées aux sprites carrés.

**Les enquêtes → Écrire une enquête avec Ollama** crée et sauvegarde une nouvelle histoire. Le modèle invente les noms, descriptions, découvertes et dénouements ; le moteur conserve les effets, statistiques et coûts pour garantir leur fonctionnement. Ce premier format utilise six cartes en deux exemplaires, quatre lieux et trois profils ennemis. Il n’inclut pas encore d’éditeur de deck ou de campagne persistante entre plusieurs scénarios.

Cliquez sur une carte, un lieu, un ennemi ou le portrait, puis **Illustrer cette carte** : choisissez un dessin du carnet ou demandez à Ollama une nouvelle illustration. Seule l’image est générée en pixel art ; l’interface affiche le nom, les règles et les coûts. Les nouveaux dessins restent dans le carnet. Les illustrations des cartes sont des copies sauvegardées avec l’enquête dans `.private/dungeons/investigations/`, indépendantes des modifications ultérieures du sprite.

Le bouton **Illustrer l’aventure**, en haut du plateau, lance une file de dessins Ollama pour les 14 illustrations : un investigateur, quatre lieux, six cartes de deck (une image par type, réutilisée pour ses deux exemplaires) et trois ennemis. Choisissez le modèle puis **Compléter les illustrations manquantes** (par défaut) ou **Tout réillustrer**. Le nombre d’appels prévus est affiché avant le lancement : une aventure vide demande 30 appels, hors corrections éventuelles. Les générations se succèdent côté serveur, et chaque résultat est sauvegardé puis affecté immédiatement. Vous pouvez continuer à jouer ou fermer la page. La progression se retrouve au rechargement, avec un bouton d’arrêt après le dessin en cours et une reprise des éléments restants. Une réponse invalide est signalée et la file continue ; un quota atteint ou une panne du fournisseur interrompt la série pour reprise ultérieure. Après un arrêt du serveur, la reprise est manuelle. Les séries sont conservées dans `.private/sprites/illustration-batches/` et les anciens dessins restent dans le carnet.

Quand une génération dépasse sa limite de couleurs (32 pour un panorama, 16 pour les autres dessins), le serveur harmonise sa palette automatiquement. Les coordonnées et les zones entièrement transparentes sont conservées ; certaines nuances peuvent changer. Le journal contient le nombre de couleurs avant/après, les remplacements et le nombre de pixels recolorés. Les commandes enregistrées reproduisent le dessin corrigé. Les dessins déjà sauvegardés ne sont pas modifiés. La sauvegarde locale de partie stocke les règles et la progression ; les illustrations sont rechargées depuis le serveur pour ne pas saturer le stockage du navigateur.

Pour les dessins de cartes et de sprites, les formes qui débordent de la grille sont rognées aux bords lors du rendu, sans déplacer leurs points ni modifier leurs proportions. Les débordements extrêmes et les coordonnées non entières restent rejetés. Le journal indique les commandes concernées et le nombre de pixels hors cadre. L’export des commandes contient `clip: true` lorsque le rognage est nécessaire pour reproduire le dessin.

Le bouton **Plein écran** masque aussi les barres du navigateur ; toutes les fenêtres du jeu restent accessibles dans ce mode. Le prototype d’action se trouve à `/index.html`, et les liens existants `/?level=…`, `/?room=…`, `/?asset=…` et `/?dungeon=selected` continuent d’ouvrir le jeu d’action.

**Aucun modèle IA ne tourne sur le Mac.** Les modèles Ollama Cloud sont sollicités uniquement quand vous lancez une génération dans l’atelier. Le catalogue public des modèles est consulté automatiquement par les ateliers, sans lancer de génération. Jouer au donjon fixe ou à un donjon déjà généré n’appelle aucun modèle. Le jeu n’a pas de dépendances à installer.

## Studio vidéo — prototype

Ouvrez http://127.0.0.1:4173/video.html pour générer un storyboard explicatif avec Ollama. Le modèle produit uniquement un projet JSON validé composé de titres, schémas, graphes, citations et résumés. Le navigateur interprète ce projet, anime son aperçu et permet de parcourir sa timeline, télécharger le JSON ou enregistrer une vidéo ; aucun code fourni par le modèle n’est exécuté. Les formats vertical 9:16, horizontal 16:9 et carré sont disponibles. Un exemple local permet de tester le lecteur sans appel IA. Les storyboards sont conservés dans `.private/dungeons/videos/`. L’export utilise le meilleur format MediaRecorder accepté par le navigateur : MP4/H.264 lorsqu’il est disponible, sinon WebM. Le rendu s’effectue en temps réel et ne contient pas encore de piste audio.

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

Commandes du prototype **Action** :

- ZQSD ou WASD : déplacement.
- Flèches directionnelles, ou clic maintenu en visant à la souris : tir.
- Espace : esquive, avec un court délai de recharge.
- Échap : pause / reprise.
- **Plein écran**, au-dessus de l’arène : agrandit le jeu avec sa vie, son chronomètre et ses commandes. Le bouton **Quitter le plein écran** ou Échap permet de sortir ; la partie se met alors en pause. Si le navigateur ne propose pas cette API, un mode agrandi dans la page prend le relais.
- Sur écran tactile : boutons de déplacement et esquive, visée automatique.

Terminez les trois salles de combat pour ouvrir l’accès au gardien. Marchez sur les reliques au centre des salles pour les ramasser. Chaque combat terminé rend un cœur. Une défaite ou le bouton Recommencer relance le même donjon.

La navigation **Refuge · Enquêtes · Action · Donjons · Sprites · Salles · Codex** est accessible sur toutes les vues, avec la page active indiquée ; sur le plateau d’enquête, elle se trouve dans **Menu**. Lors du test d’un sprite ou d’une salle, le jeu propose aussi un lien de retour vers son atelier.

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

## GitHub Actions

Le workflow **CI** lance `npm test` avec Node.js 22, valide la configuration Compose et construit l’image Docker à chaque push sur `main` et à chaque pull request. Il peut aussi être lancé manuellement. Le projet n’a pas de dépendances npm à installer.

Le workflow **Deploy production** se lance manuellement dans **Actions → Deploy production → Run workflow**, sur la branche `main`. Il met à jour le clone du serveur avec `git pull --ff-only`, puis lance `docker compose up -d --build`. Les déploiements sont exécutés l’un après l’autre.

Pour le préparer :

- Connectez un runner GitHub Actions `self-hosted` au serveur, avec Bash, Git, Docker et Docker Compose disponibles et l’autorisation d’utiliser Docker.
- Créez l’environnement GitHub `production` et définissez `DEPLOY_PATH` comme variable (ou secret) contenant le chemin absolu du clone sur le serveur.
- Le clone doit être sur `main`, avec un accès Git à `origin` sans saisie interactive et sans modifications locales susceptibles de bloquer la mise à jour.
- Créez le réseau Docker externe `proxy` et configurez le reverse proxy pour `nocturne.scarpellino.fr`, comme prévu par `docker-compose.override.yml`.
- Pour Ollama Cloud, configurez `OLLAMA_API_KEY` dans le fichier `.env` du serveur. Ce fichier reste facultatif pour jouer sans IA. Les données restent dans `./private` ; ce dossier doit être accessible en écriture par l’utilisateur `node` du conteneur.

## Vérifications

`npm test` vérifie la connexion des salles, les passages, les limites des données, une expédition complète simulée, la conservation du donjon quotidien et la protection des requêtes locales. Les tests Ollama utilisent un fournisseur simulé et ne consomment pas de quota.

L’équilibrage et la qualité des compositions proposées par chaque modèle restent à évaluer en jouant.
