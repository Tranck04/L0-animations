<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import LoumiMascot from './components/LoumiMascot.vue'
import masterUrl from './assets/loumi-master.svg'
import { LoumiEngine, renderSvg, type GestureId, type GesturePlayback, type GestureResult, type LoumiMascotHandle, type MascotFrame, type MascotState, type TransitionDirection } from './mascot'

const state = ref<MascotState>('idle')
const size = ref(164)
const follow = ref(false)
const frozen = ref(false)
const frozenTime = ref(0.8)
const replayKey = ref(0)
const reduced = ref(false)
const elapsed = ref(0)
const actualState = ref<MascotState>('idle')
const mascot = ref<LoumiMascotHandle>()
const scene = ref<HTMLDivElement>()
const activeGesture = ref<GestureId | null>(null)
const gestureElapsed = ref(0)
const gestureNotice = ref('Un salut à l’arrivée, puis L° retrouve son calme.')
const gestureNames: Record<GestureId, string> = { intro: 'Salut', click: 'Attention', transition: 'Passage' }
const copied = ref(false)
const copyError = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

const states: { id: MascotState; name: string; subtitle: string; description: string; time: number; icon: string }[] = [
  { id: 'idle', name: 'Repos', subtitle: 'Juste là.', description: 'Une présence tranquille. Le regard se promène, tout doucement.', time: 2.1, icon: '—' },
  { id: 'thinking', name: 'Réflexion', subtitle: 'L’idée fait son chemin.', description: 'Un regard en coin, une pause, une petite hésitation. L° cherche son idée.', time: 1.2, icon: '°' },
  { id: 'success', name: 'Réussite', subtitle: 'Et voilà !', description: 'Un élan décidé, les yeux satisfaits. L° savoure, puis se repose.', time: 0.8, icon: '↗' },
]
const current = computed(() => states.find(item => item.id === state.value)!)
const snippet = computed(() => `<LoumiMascot\n  state="${state.value}"\n  :size="${size.value}"\n  :follow="${follow.value}"${frozen.value ? `\n  :frozen-at="${frozenTime.value.toFixed(2)}"` : ''}\n/>`)
const formattedTime = computed(() => (frozen.value ? frozenTime.value : activeGesture.value ? gestureElapsed.value : elapsed.value).toFixed(2).padStart(5, '0'))

function selectState(id: MascotState) {
  state.value = id
  replayKey.value++
}
function onFrame(frame: MascotFrame) {
  elapsed.value = frame.elapsed
  actualState.value = frame.state
  activeGesture.value = frame.gesture
  gestureElapsed.value = frame.gestureElapsed
}
function onGestureStart(playback: GesturePlayback) {
  gestureNotice.value = `${gestureNames[playback.name]} en cours${playback.name === 'transition' ? playback.direction === 'left' ? ' vers la gauche' : ' vers la droite' : ''}.`
}
function onGestureEnd(result: GestureResult) {
  gestureNotice.value = result.status === 'completed' ? `${gestureNames[result.name]} terminé. Retour à l’état ${current.value.name.toLowerCase()}.` : result.status === 'interrupted' ? `${gestureNames[result.name]} interrompu par le geste suivant.` : 'Inspection figée : geste arrêté.'
}
async function prepareGesture() {
  frozen.value = false
  await nextTick()
  const bounds = scene.value?.getBoundingClientRect()
  if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) scene.value?.scrollIntoView({ block: 'center', behavior: 'instant' })
}
async function replayIntro() { await prepareGesture(); void mascot.value?.playIntro() }
async function runTransition(direction: TransitionDirection) { await prepareGesture(); void mascot.value?.transition(direction) }
async function testClick() {
  await prepareGesture()
  mascot.value?.focus()
  gestureNotice.value = 'L° a le focus : cliquez sur lui, touchez-le, ou appuyez sur Entrée / Espace.'
}
function toggleFrozen() {
  if (!frozen.value) frozenTime.value = Number(Math.min(24, elapsed.value).toFixed(2))
  frozen.value = !frozen.value
}
function complete() { if (!frozen.value) state.value = 'idle' }
function originalPose() { state.value = 'idle'; frozenTime.value = 0; frozen.value = true }
function setExactTime(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value)) frozenTime.value = Math.max(0, Math.min(24, value))
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(snippet.value)
    copied.value = true
    copyError.value = false
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch { copyError.value = true }
}

function downloadPose() {
  const at = frozen.value ? frozenTime.value : elapsed.value
  // Une pose d’état reproductible, indépendante du pointeur.
  const svg = renderSvg(new LoumiEngine(state.value).sample(at, { reducedMotion: reduced.value }), {
    size: size.value, label: 'L°, mascotte de LOUMI°LAB', id: 'loumi-export',
  })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `loumi-${state.value}-${at.toFixed(2)}s.svg`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="#" aria-label="LOUMI°LAB, accueil">LOUMI<span>°</span>LAB<span class="wordmark-dot">.</span></a>
      <nav aria-label="Navigation principale">
        <a class="nav-active" href="#atelier">L’atelier <span class="small-dot" /></a>
        <a href="#integrer">Intégration <span aria-hidden="true">↗</span></a>
      </nav>
      <span class="edition">EXPÉRIENCE N° 001</span>
    </header>

    <main>
      <section id="atelier" class="intro" aria-labelledby="page-title">
        <div>
          <p class="eyebrow"><span class="small-dot" /> BIBLIOTHÈQUE DE MOUVEMENTS <span class="version">V.01</span></p>
          <h1 id="page-title">Petit être.<br /><em>Grande présence.</em></h1>
        </div>
        <div class="intro-aside">
          <span class="intro-symbol" aria-hidden="true">L°</span>
          <p>Voici L°, la mascotte de LOUMI°LAB.<br />Trois humeurs, quelques mouvements.<br />Et toujours ce petit regard bien à lui.</p>
        </div>
      </section>

      <section class="playground" aria-label="Atelier interactif d’animation">
        <div class="scene-column">
          <div ref="scene" class="scene">
            <div class="scene-top"><span class="scene-tag"><span class="small-dot" /> L° / MAÎTRE 2D</span><button class="text-button" @click="originalPose">Voir la pose originale <span aria-hidden="true">↗</span></button></div>
            <span class="corner corner-tl" aria-hidden="true" /><span class="corner corner-tr" aria-hidden="true" />
            <span class="corner corner-bl" aria-hidden="true" /><span class="corner corner-br" aria-hidden="true" />
            <div class="mascot-space">
              <LoumiMascot
                ref="mascot"
                :state="state" :size="size" :follow="follow" :frozen-at="frozen ? frozenTime : undefined" :replay-key="replayKey"
                @frame="onFrame" @complete="complete" @motion-preference="reduced = $event" @gesture-start="onGestureStart" @gesture-end="onGestureEnd"
              />
            </div>
            <div class="scene-caption"><span>Un trait. Un degré. Une personnalité.</span><span aria-hidden="true">( L° )</span></div>
          </div>
          <div class="transport">
            <div class="playback-state"><span class="live-dot" :class="{ paused: frozen || reduced }" /><span>{{ frozen ? 'IMAGE FIGÉE' : reduced ? 'MOUVEMENTS RÉDUITS' : 'EN MOUVEMENT' }}</span><span class="transport-divider" /><code>{{ activeGesture ?? actualState }}</code></div>
            <div class="timecode"><span>t</span> {{ formattedTime }} <span>s</span></div>
          </div>
        </div>

        <aside class="controls" aria-label="Réglages de la mascotte">
          <div class="controls-heading"><h2>À vous de jouer<span>°</span></h2><span class="control-index">01 — 03</span></div>
          <div class="state-group" role="group" aria-label="État de la mascotte">
            <button v-for="(item, index) in states" :key="item.id" class="state-button" :class="{ selected: state === item.id }" :aria-pressed="state === item.id" @click="selectState(item.id)">
              <span class="state-icon" aria-hidden="true">{{ item.icon }}</span><span>{{ item.name }}</span><span class="state-number">0{{ index + 1 }}</span>
            </button>
          </div>
          <p class="state-help">{{ current.subtitle }} <span>{{ current.description }}</span></p>

          <div class="setting-row follow-row">
            <div><label id="follow-label">Suivre le pointeur</label><p>{{ frozen ? 'En pause pendant l’inspection' : reduced ? 'Désactivé par votre préférence système' : 'Un regard qui vous accompagne' }}</p></div>
            <button class="toggle" role="switch" aria-labelledby="follow-label" :aria-checked="follow" :disabled="frozen || reduced" @click="follow = !follow"><span /></button>
          </div>

          <div class="size-setting">
            <div class="setting-row"><label for="size">Taille de L°</label><output for="size">{{ size }} <span>px</span></output></div>
            <input id="size" v-model.number="size" type="range" min="80" max="240" step="1" :style="{ '--progress': `${(size - 80) / 160 * 100}%` }" />
            <div class="range-captions"><span>Discret</span><span>Bien présent</span></div>
          </div>

          <div class="freeze-panel" :class="{ 'is-frozen': frozen }">
            <div class="setting-row"><div><label id="freeze-label">Figer le temps</label><p>Chaque pose mérite un regard.</p></div><button class="toggle" role="switch" aria-labelledby="freeze-label" :aria-checked="frozen" @click="toggleFrozen"><span /></button></div>
            <div v-if="frozen" class="time-controls">
              <label for="frozen-time">Instant dans l’état <span>en secondes</span></label>
              <div class="time-input-row"><input id="frozen-time" v-model.number="frozenTime" type="range" min="0" max="24" step="0.01" /><input :value="frozenTime" aria-label="Instant précis en secondes" type="number" min="0" max="24" step="0.01" @input="setExactTime" /></div>
              <button class="text-button download-button" @click="downloadPose">Télécharger cette pose en SVG <span aria-hidden="true">↓</span></button>
            </div>
          </div>
          <p class="motion-note"><span aria-hidden="true">↳</span> {{ reduced ? 'Votre préférence de mouvement réduit est active.' : 'S’adapte à vos préférences de mouvement.' }}</p>
        </aside>
      </section>

      <section class="gesture-panel" aria-labelledby="gestures-title">
        <div class="gesture-heading"><h2 id="gestures-title">Les petits gestes<span>°</span></h2><p>Un bonjour, une attention, un passage.</p></div>
        <div class="gesture-actions">
          <div><span class="gesture-code">intro · 1,2 s</span><button class="gesture-button" @click="replayIntro">Rejouer le salut <span aria-hidden="true">↗</span></button></div>
          <div><span class="gesture-code">click · 0,64 s</span><button class="gesture-button" @click="testClick">Tester le clic sur L° <span aria-hidden="true">↙</span></button><span class="gesture-hint">Sur L° : clic, toucher, Entrée ou Espace</span></div>
          <div><span class="gesture-code">transition · 0,8 s</span><div class="direction-buttons"><button class="gesture-button" @click="runTransition('left')"><span aria-hidden="true">←</span> Vers la gauche</button><button class="gesture-button" @click="runTransition('right')">Vers la droite <span aria-hidden="true">→</span></button></div></div>
        </div>
        <p class="gesture-notice" role="status">{{ gestureNotice }}</p>
      </section>

      <section class="repertoire" aria-labelledby="repertoire-title">
        <div class="section-heading"><h2 id="repertoire-title">Trois façons d’être là<span>°</span></h2><span class="eyebrow">LE RÉPERTOIRE</span></div>
        <div class="state-cards">
          <button v-for="(item, index) in states" :key="item.id" class="state-card" :aria-label="`Jouer l’état ${item.name}`" @click="selectState(item.id)">
            <div class="card-top"><span class="card-index">0{{ index + 1 }}</span><code>{{ item.id }}</code><span class="card-arrow" aria-hidden="true">↗</span></div>
            <div class="card-portrait" :class="`portrait-${item.id}`"><LoumiMascot :state="item.id" :frozen-at="item.time" :size="57" :label="`Aperçu ${item.name}`" /></div>
            <div class="card-copy"><h3>{{ item.name }}</h3><p>{{ item.subtitle }}</p></div>
          </button>
        </div>
      </section>

      <section id="integrer" class="integration" aria-labelledby="integration-title">
        <div class="integration-copy"><p class="eyebrow">UNE PLACE DANS VOTRE UNIVERS</p><h2 id="integration-title">Un petit composant.<br />Toute sa personnalité.</h2><p>Un état, une taille, un regard.<br />Emportez L° dans votre interface.</p><a href="https://www.figma.com/design/J1i4oxbk2JjWdAP7742IHy/?node-id=2-28" target="_blank" rel="noreferrer">Ouvrir le dessin Figma <span aria-hidden="true">↗</span></a></div>
        <div class="code-card"><div class="code-toolbar"><span><span class="small-dot" /> Vue 3 · TypeScript</span><button @click="copyCode">{{ copied ? 'Copié ✓' : 'Copier le code' }} <span v-if="!copied" aria-hidden="true">⧉</span></button></div><pre><code>{{ snippet }}</code></pre><p>import LoumiMascot from './components/LoumiMascot.vue'</p><span v-if="copyError" role="status" class="copy-error">Sélectionnez le code pour le copier manuellement.</span></div>
      </section>

      <details class="design-details"><summary><span>Le dessin reste le dessin.</span><span>Voir la référence <span aria-hidden="true">＋</span></span></summary><div class="design-reference"><img :src="masterUrl" width="114" height="164" alt="Dessin Figma original de L°, tête vert pâle avec trait noir à gauche et anneau vert à droite" /><div><h3>Le maître, à l’échelle 1:1.</h3><p>Tête 114 × 164. Trait 20 × 4,5, centre (32, 80). Anneau Ø20, centre (85, 80). Le fichier SVG téléchargé depuis Figma est conservé dans le projet. La tête garde son tracé. Les yeux se déforment légèrement pendant les expressions, puis retrouvent exactement le dessin neutre.</p><button class="text-button" @click="originalPose">Comparer avec la pose neutre à t = 0 <span aria-hidden="true">↗</span></button></div></div></details>
    </main>

    <footer class="site-footer"><span class="wordmark footer-wordmark">LOUMI<span>°</span>LAB.</span><p>Un peu de code. Un peu de caractère.</p><a href="https://github.com/jeremy-prt/bloub" target="_blank" rel="noreferrer">Architecture inspirée de Bloub <span aria-hidden="true">↗</span></a><span class="footer-edition">L° — MOTION LIBRARY / 2026</span></footer>
    <p class="sr-only" role="status" aria-live="polite">{{ current.name }}{{ frozen ? ', image figée' : '' }}</p>
  </div>
</template>

