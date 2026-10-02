# Nocturne — Première expédition

Prototype de roguelike 2D dans le navigateur : sept salles, trois reliques, deux types d’ennemis et un boss à deux phases. Le donjon fixe reste disponible ; l’atelier permet de générer et de jouer d’autres expéditions.

**Aucun modèle IA ne tourne sur le Mac.** Ollama Cloud est appelé uniquement quand vous lancez une génération dans l’atelier. Jouer au donjon fixe ou à un donjon déjà généré n’appelle aucun modèle. Le jeu n’a pas de dépendances à installer.

## Jouer

Depuis ce dossier, lancez `npm start`, puis ouvrez http://127.0.0.1:4173/ dans votre navigateur. Gardez le serveur ouvert pendant la partie. `Ctrl+C` l’arrête.

- ZQSD ou WASD : déplacement.
- Flèches directionnelles, ou clic maintenu en visant à la souris : tir.
- Espace : esquive, avec un court délai de recharge.
- Échap : pause / reprise.
- Sur écran tactile : boutons de déplacement et esquive, visée automatique.

Terminez les trois salles de combat pour ouvrir l’accès au gardien. Marchez sur les reliques au centre des salles pour les ramasser. Chaque combat terminé rend un cœur. Une défaite ou le bouton Recommencer relance le même donjon.

## Atelier Ollama

Ouvrez **Atelier Ollama** depuis le jeu, ou http://127.0.0.1:4173/generator.html.

1. Enregistrez votre clé dans **Connexion Ollama**, si aucune clé n’est configurée.
2. Choisissez GLM‑5.3‑Flash (choix initial, à évaluer) ou Gemma 4 31B, et éventuellement une ambiance.
3. Choisissez **Essai libre** pour une nouvelle proposition, ou **Donjon du jour** pour créer ou retrouver le donjon daté en heure de Paris.
4. Cliquez sur **Générer**, attendez l’aperçu, puis sur **Jouer ce donjon**.

**Voir l’exemple sans appel IA** permet de parcourir l’interface avec le donjon fixe. Il ne teste pas le fournisseur. Un nouvel essai libre n’écrase jamais le donjon du jour. Le chargement d’un donjon quotidien existant ne relance pas l’IA. Il n’y a pas de planification automatique : le premier clic du jour déclenche sa génération.

La clé est stockée avec des permissions limitées au compte local dans `.private/credentials/`, hors du dossier public `dist/`. Le dossier `.private/` est ignoré par Git et doit rester exclu de tout partage du projet. `OLLAMA_API_KEY` dans l’environnement du serveur est également accepté et prend priorité sur la clé enregistrée. Les donjons générés sont conservés dans `.private/dungeons/`. Le navigateur conserve uniquement le donjon choisi pour jouer, jamais la clé. Aucun appel réel au fournisseur n’a été effectué pour vérifier cette interface ; les vérifications utilisent des réponses simulées.

## Organisation

- `dist/dungeon.mjs` : donjon de test, objets et boss.
- `dist/engine.mjs` : déplacements, collisions, projectiles, combats et progression.
- `dist/render.mjs` : affichage du jeu et carte.
- `dist/game.mjs` : commandes et interface.
- `dist/generator.html` et `dist/generator.mjs` : atelier de génération et aperçu.
- `dist/core.mjs` : format des donjons et vérifications réutilisables pour la future génération IA.
- `scripts/server.mjs` et `scripts/cloud.mjs` : serveur local et connexion Ollama Cloud, liés uniquement à 127.0.0.1.

Les polices sont chargées depuis Google Fonts quand le réseau est disponible, avec des polices de secours sinon. Le jeu n’a pas besoin d’un service IA ni d’une clé API.

## Versionner le projet

À inclure dans Git : `dist/` (code du jeu et images), `scripts/`, `package.json`, `README.md` et `.gitignore`. Malgré son nom, `dist/` contient les sources du navigateur : aucune étape de compilation ne le recrée.

À garder en local : `.private/` (clé Ollama et donjons générés), `.env*` hors éventuel `.env.example`, `.openai/`, `.sites-runtime/`, `node_modules/`, les journaux et `.DS_Store`. Ces fichiers sont exclus par `.gitignore`. Après un clonage, lancer `npm start` puis renseigner sa propre clé dans l’atelier si nécessaire.

## Vérifications

`npm test` vérifie la connexion des salles, les passages, les limites des données, une expédition complète simulée, la conservation du donjon quotidien et la protection des requêtes locales. Les tests Ollama utilisent un fournisseur simulé et ne consomment pas de quota.

L’équilibrage et la qualité des compositions proposées par chaque modèle restent à évaluer en jouant.
