# LABYRINTHE — *Ce que tu oublies te dévore*

Jeu d'horreur 3D **vue du dessus** où l'on explore un labyrinthe… **en aveugle**.
Tout est noir : chaque pas révèle les murs et le sol autour de toi, mais **les lieux
s'effacent de ta mémoire** au bout de quelques secondes. Cinq descentes, cinq ambiances,
des créatures autonomes et des cris qui viennent de partout.

## Lancer le jeu

**En ligne :** https://kotikytb.github.io/labyrinth_horror/ (aucune installation, le son
fonctionne directement dans le navigateur).

**En local :** double-clique simplement sur `index.html` (aucun serveur, aucune
installation, aucun accès internet : Three.js est inclus dans `js/lib/`).

> 🎧 **Casque fortement recommandé** : les cris et chuchotements sont directionnels
> (gauche/droite), et l'indicateur à l'écran ne donne que l'angle, pas la distance.

Si le son ne démarre pas (politique anti-autoplay du navigateur), un bandeau
**ACTIVER LE SON** apparaît en haut à gauche : clique dessus. Tu peux aussi vérifier
dans **OPTIONS → TESTER LE SON**, et couper/réactiver avec `M`.

Autre option (si ton navigateur bloque le son en `file://`) :
double-clique sur **`Lancer.bat`** (ouvre un petit serveur local) puis va sur
`http://127.0.0.1:8123/`.

## Commandes

| Touche | Action |
|---|---|
| `WASD` / `ZQSD` / flèches | Se déplacer |
| `Maj` (Shift) | Courir (consomme le souffle, fait beaucoup de bruit) |
| `Ctrl` / `C` | S'accroupir (lent mais presque silencieux) |
| `Échap` / `P` | Pause |
| `M` | Couper / activer le son |

Sur mobile / tactile : joystick virtuel en bas à gauche, bouton **COURIR** en bas à droite.

## Règles de survie

1. **Mémoire** — Tout est noir. Ce que tu découvres reste visible un moment, puis se
   dissout. Reviens sur tes pas pour « raviver » les couloirs.
2. **Bruit** — Courir attire les créatures ; s'accroupir te rend presque muet.
3. **Cris** — Un indicateur circulaire pointe la direction de la source (cri lointain,
   chuchotement, monstre qui te repère…).
4. **Créatures** — Elles errent en permanence, voient, entendent, poursuivent. Si tu
   brises leur ligne de vue, elles perdent ta trace, fouillent le dernier endroit vu,
   puis repartent.
5. **Reliques** — Récupère-les toutes pour desceller la sortie, puis suis le faisceau.

## Les cinq descentes

| # | Niveau | Difficulté | Particularités |
|---|---|---|---|
| I | La Cave | Calme | 1 Rôdeur, mémoire longue (19 s) |
| II | L'Asile | Tendu | 2 créatures rapides, coupures de lumière |
| III | La Chapelle | Hostile | 3 choristes, cris fréquents |
| IV | La Chair | Brutal | 4 écorchés, mémoire courte, jumping scares |
| V | L'Abîme | Inhumain | 5 créatures dont **L'Œil** (voit à travers les murs), mémoire 9,5 s |

Chaque niveau a une géométrie générée procéduralement (graine fixe = niveau
reconnaissable, mais chemins et objets à re-découvrir).

## Structure du projet

```
index.html          écran de jeu + interface
css/style.css       habillage complet
js/util.js          maths / RNG déterministe / helpers
js/maze.js          génération de labyrinthe, chemins, ligne de vue
js/levels.js        paramètres des 5 niveaux (thèmes, vitesses, mémoire…)
js/audio.js         moteur audio procédural WebAudio (drone, cris, cœur, sting)
js/world.js         scène 3D, shader de « mémoire », reliques, sortie, poussière
js/monster.js       IA des créatures (perception, poursuite, perdre la trace)
js/scares.js        jump scares dessinés en canvas, grain, indicateurs directionnels
js/game.js          boucle de jeu, progression, interface, sauvegarde
js/lib/three.min.js Three.js r150 (inclus, hors ligne)
```

La progression (niveaux débloqués, meilleurs temps, options) est conservée
automatiquement dans le navigateur (`localStorage`).

## Options

Volume, grain/bruit visuel, secousses d'écran (accessibilité) et remise à zéro de la
progression, depuis **OPTIONS**.

Bonne descente. Et ne reste pas immobile.
