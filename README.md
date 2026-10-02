# Nocturne — Première expédition

Prototype de roguelike 2D dans le navigateur. Le donjon est **fixe et conçu pour ce test** : sept salles, trois reliques, deux types d’ennemis et un boss à deux phases.

**Aucun modèle IA ne tourne pour jouer. Aucun appel Ollama ou OpenAI n’est effectué.** Le jeu n’a pas de dépendances à installer. Les illustrations sont des images préexistantes chargées par le navigateur.

## Jouer

Depuis ce dossier, lancez `npm start`, puis ouvrez http://127.0.0.1:4173/ dans votre navigateur. Gardez le serveur ouvert pendant la partie. `Ctrl+C` l’arrête.

- ZQSD ou WASD : déplacement.
- Flèches directionnelles, ou clic maintenu en visant à la souris : tir.
- Espace : esquive, avec un court délai de recharge.
- Échap : pause / reprise.
- Sur écran tactile : boutons de déplacement et esquive, visée automatique.

Terminez les trois salles de combat pour ouvrir l’accès au gardien. Marchez sur les reliques au centre des salles pour les ramasser. Chaque combat terminé rend un cœur. Une défaite ou le bouton Recommencer relance le même donjon.

## Organisation

- `dist/dungeon.mjs` : donjon de test, objets et boss.
- `dist/engine.mjs` : déplacements, collisions, projectiles, combats et progression.
- `dist/render.mjs` : affichage du jeu et carte.
- `dist/game.mjs` : commandes et interface.
- `dist/core.mjs` : format des donjons et vérifications réutilisables pour la future génération IA.
- `scripts/server.mjs` : serveur local de fichiers, lié uniquement à 127.0.0.1.

Les polices sont chargées depuis Google Fonts quand le réseau est disponible, avec des polices de secours sinon. Le jeu n’a pas besoin d’un service IA ni d’une clé API.

## Vérifications

`npm test` vérifie la connexion des salles, les passages dans les modèles de salles, les limites des données et une expédition complète simulée jusqu’à la victoire.

La génération quotidienne, le branchement d’un modèle, les sauvegardes et l’équilibrage avancé sont reportés : ce prototype sert d’abord à tester les sensations de jeu.
