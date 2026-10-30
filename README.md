# L° en mouvement — LOUMI°LAB

Bibliothèque SVG et atelier de démonstration : Vue 3, TypeScript, Vite. Node **22.12+** ou **24+**.

```sh
npm install
npm run dev       # http://127.0.0.1:5173
npm test          # moteur, expressions, SVG et intégration Vue
npm run build    # démo dans dist/ + bibliothèque ESM et types dans lib/
npm run preview  # démo compilée
```

Sous PowerShell avec scripts désactivés, utiliser `npm.cmd` à la place de `npm`.

`dist/loumi-demo.html` s’ouvre aussi directement dans un navigateur, sans serveur : JavaScript, styles et SVG sont inclus dans ce fichier.

## Vue

```vue
<script setup lang="ts">
import { ref } from 'vue'
import LoumiMascot from './src/components/LoumiMascot.vue'
import type { LoumiMascotHandle } from './src/mascot'

const mascot = ref<LoumiMascotHandle>()
async function nextPanel() {
  const result = await mascot.value?.transition('left')
  if (result?.status === 'completed') console.log('Le geste est terminé')
}
</script>

<template>
  <LoumiMascot ref="mascot" state="thinking" :size="160" :follow="true" />
  <LoumiMascot state="success" :size="114" :frozen-at="0.8" />
</template>
```

Props : `state` (`idle`, `thinking`, `success`), `size` (largeur en px), `follow`, `frozenAt` (secondes depuis le début de l’état), `label`, `replayKey` (incrémenter pour rejouer). Événements : `complete` à la fin de success, `frame`, `motionPreference`. `success` revient seul au repos après 1,9 s ; `@complete` permet de synchroniser le sélecteur parent.

## Gestes temporaires

`intro` s’exécute **une fois par montage** (1,2 s). Passer `:intro="false"` pour le désactiver. Le mode figé et les vignettes ne lancent pas l’intro. L° réagit automatiquement au clic/toucher sur le SVG, ainsi qu’à **Entrée** et **Espace** lorsqu’il a le focus (640 ms). `:interactive="false"` désactive ces interactions.

L’instance expose `playIntro()`, `reactToClick()`, `transition('left' | 'right')` (droite par défaut, 800 ms), `playGesture(name, options)`, `focus()` et `getFrame()`. Réserver `reactToClick()` au gestionnaire d’interaction d’un éventuel hôte personnalisé. Dans la démo, « Tester le clic sur L° » donne le focus à la mascotte ; le bouton ne simule pas lui-même un clic. Les transitions ne naviguent pas réellement.

Chaque déclenchement renvoie une `Promise<GestureResult>` et émet `gesture-start`, puis `gesture-end`. Le résultat contient `name`, `id`, `direction`, `at`, `duration`, `reducedMotion` et `status` (`completed`, `interrupted`, `cancelled`). Une interruption résout aussi la promesse précédente ; le gel ou le démontage annule proprement le geste. Les méthodes appelées en mode figé retournent `cancelled` sans démarrer d’animation.

Les gestes se superposent à `state` et rejoignent sa pose courante, y compris si l’application a demandé un nouvel état pendant le geste. Ils ne s’empilent pas. Le suivi s’atténue pendant le geste, puis revient progressivement. En mouvement réduit, les versions fixes durent respectivement **160, 140 et 180 ms**, sans boucle RAF.

Le succès anticipe, monte vivement, puis tient une satisfaction pendant 500 ms avant de se détendre. La réflexion alterne regards vers le haut, poses tenues et petits ajustements hésitants. Au repos, les regards sont séparés par des pauses ; un calendrier déterministe espace les clignements, parfois doubles. Les paupières de l’anneau se ferment à largeur et épaisseur de trait constantes. Le suivi du pointeur s’atténue pendant les expressions et revient progressivement.

Instants utiles à figer : succès `0.18` (anticipation), `0.35` (clignement), `0.8` (satisfaction), `1.8` (neutre) ; réflexion `1.2` puis `2.25` ; repos `4.43` (œil fermé), `4.7` (rouvert), `10.88` et `11.16` (double clignement).

Le mode figé échantillonne un état depuis son origine, sans suivi ni RAF. En sortie, la lecture reprend depuis cet instant. Le composant respecte les changements de `prefers-reduced-motion` : poses statiques, suivi suspendu, aucune boucle RAF. Les onglets masqués suspendent aussi la lecture. Un libellé `role="img"` décrit l’état.

## Moteur sans Vue

```ts
import { LoumiEngine, renderSvg } from './lib/loumi.js'

const engine = new LoumiEngine('idle')
engine.setState('thinking', 1)
engine.setState('success', 1.12) // interruption sans saut de position ni de vitesse
engine.setPointer({ x: 0.5, y: -0.2 }, 1.2) // coordonnées bornées à [-1, 1]
engine.setPointer(null, 1.8) // retour lissé au regard de l’état
const frame = engine.sample(2.1)
const svg = renderSvg(frame, { size: 160, id: 'mascotte-1', label: 'L°' })

const gesture = engine.playGesture('transition', 2.2, { direction: 'left' })
const during = engine.sample(2.5) // during.gesture === 'transition'
const after = engine.sample(gesture.at + gesture.duration) // after.gesture === null
```

Pour une première apparition avant tout affichage : `engine.playGesture('intro', 0, { initialAppearance: true })`. Pour les versions courtes : `{ reducedMotion: true }`. Le moteur ne déclenche aucun événement interne ; l’adaptateur observe `gestureAt(t)` ou les métadonnées de l’image pour signaler la fin.

Tous les temps sont en **secondes**. Les commandes sont chronologiques ; les lectures `sample(t)` peuvent arriver dans n’importe quel ordre et n’ont aucun effet de bord. L’historique des commandes est conservé : créer une nouvelle instance pour une nouvelle session de longue durée. Fournir un `id` distinct par SVG si plusieurs rendus sont insérés dans le même document. L’appelant pilote son propre `requestAnimationFrame`. Les poses et le moteur sont dans `src/mascot/` et ne dépendent ni de Vue ni du navigateur.

## Dessin et référence

[Maître Figma, nœud 2:28](https://www.figma.com/design/J1i4oxbk2JjWdAP7742IHy/?node-id=2-28). L’export original est `src/assets/loumi-master.svg` ; `node scripts/prepare-artwork.mjs` en extrait les trois calques dans `src/mascot/artwork.ts`, sans recalculer leurs tracés. Aucune ressource Figma distante à l’exécution. Tête rigide 114 × 164 ; trait noir à gauche, anneau vert à droite, sans bouche. Les yeux seuls peuvent se courber ou se fermer temporairement : à la pose neutre, le rendu reprend exactement les tracés Figma. La taille applique une échelle uniforme à tout le SVG.

[Bloub](https://github.com/jeremy-prt/bloub), révision étudiée `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`, sert de référence d’architecture : poses temporelles, moteur sans horloge, raccords interrompus, suivi et adaptateur Vue. Les tracés et comportements de L° sont propres à LOUMI°LAB. Voir `THIRD_PARTY_NOTICES.md` et `licenses/bloub-MIT.txt`.
