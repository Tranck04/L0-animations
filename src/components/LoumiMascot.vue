<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { LoumiEngine, SUCCESS_DURATION, type GestureId, type GestureOptions, type GesturePlayback, type GestureResult, type LoumiMascotHandle, type MascotFrame, type MascotState, type PointerTarget, type TransitionDirection } from '../mascot'
import { eyeArtwork, scopedArtwork, transforms } from '../mascot/svg'

const props = withDefaults(defineProps<{
  state?: MascotState
  /** Largeur de la tête en pixels. La hauteur conserve le ratio 164/114. */
  size?: number
  follow?: boolean
  /** Salut automatique, une seule fois par montage. */
  intro?: boolean
  /** Clic, toucher et clavier sur le SVG. Désactivé en mode figé. */
  interactive?: boolean
  /** Secondes depuis le début de l’état ; ignore le pointeur et arrête le RAF. */
  frozenAt?: number
  label?: string
  /** Incrémenter pour rejouer un état déjà sélectionné. */
  replayKey?: number
}>(), { state: 'idle', size: 160, follow: false, intro: true, interactive: true, label: 'L°, mascotte de LOUMI°LAB', replayKey: 0 })

const emit = defineEmits<{
  complete: []
  frame: [frame: MascotFrame]
  motionPreference: [reduced: boolean]
  gestureStart: [playback: GesturePlayback]
  gestureEnd: [result: GestureResult]
}>()

const svg = ref<SVGSVGElement>()
const artwork = scopedArtwork(`loumi-${useId()}`)
const reduced = ref(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
const safeSize = computed(() => Number.isFinite(props.size) && props.size > 0 ? props.size : 160)
const canInteract = computed(() => props.interactive && props.frozenAt === undefined)
let engine = new LoumiEngine(props.state)
const arrival = props.intro && props.frozenAt === undefined ? engine.playGesture('intro', 0, { reducedMotion: reduced.value, initialAppearance: true }) : null
let pendingGesture: { playback: GesturePlayback; resolve: (result: GestureResult) => void } | null = arrival ? { playback: arrival, resolve: () => {} } : null
let clock = 0
let raf = 0
let reducedTimer: ReturnType<typeof setTimeout> | undefined
let lastTimestamp: number | undefined
let mounted = false
let completed = false
let pendingPointer: PointerTarget | null | undefined
let media: MediaQueryList | undefined
let listening = false
const frame = shallowRef(engine.sample(props.frozenAt ?? 0))
const transform = computed(() => transforms(frame.value))
const eyes = computed(() => eyeArtwork(frame.value.pose))
const stateLabels: Record<MascotState, string> = { idle: 'au repos', thinking: 'en réflexion', success: 'réussite' }
const gestureLabels: Record<GestureId, string> = { intro: 'vous salue', click: 'à votre écoute', transition: 'accompagne le changement de contenu' }
const accessibleLabel = computed(() => `${props.label}, ${frame.value.gesture ? gestureLabels[frame.value.gesture] : stateLabels[frame.value.state]}${canInteract.value ? '. Activer pour attirer son attention.' : ''}`)

function settleGesture(status: GestureResult['status']) {
  if (!pendingGesture) return
  const pending = pendingGesture
  pendingGesture = null
  const result: GestureResult = { ...pending.playback, status }
  pending.resolve(result)
  emit('gestureEnd', result)
}

/** Les méthodes retournent un résultat, même si un autre geste les interrompt. */
function playGesture(name: GestureId, options: Pick<GestureOptions, 'direction'> = {}): Promise<GestureResult> {
  if (!mounted || props.frozenAt !== undefined) {
    return Promise.resolve({ id: 0, name, direction: options.direction ?? 'right', at: clock, duration: 0, reducedMotion: reduced.value, status: 'cancelled' })
  }
  if (pendingGesture) settleGesture(clock >= pendingGesture.playback.at + pendingGesture.playback.duration ? 'completed' : 'interrupted')
  const playback = engine.playGesture(name, clock, { ...options, reducedMotion: reduced.value })
  const promise = new Promise<GestureResult>(resolve => { pendingGesture = { playback, resolve } })
  emit('gestureStart', playback)
  if (reduced.value) run()
  else draw()
  return promise
}

const playIntro = () => playGesture('intro')
const reactToClick = () => playGesture('click')
const transition = (direction: TransitionDirection = 'right') => playGesture('transition', { direction })

function activate() { if (canInteract.value) void reactToClick() }
function keyActivate(event: KeyboardEvent) {
  if (!canInteract.value || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  if (!event.repeat) activate()
}

function draw() {
  frame.value = props.frozenAt !== undefined
    ? new LoumiEngine(props.state).sample(props.frozenAt, { reducedMotion: reduced.value })
    : engine.sample(clock, { reducedMotion: reduced.value })
  emit('frame', frame.value)
  if (pendingGesture && frame.value.gestureId !== pendingGesture.playback.id) settleGesture('completed')
  if (props.frozenAt === undefined && props.state === 'success' && frame.value.state === 'idle' && !completed) {
    completed = true
    emit('complete')
  }
}

function stop() {
  cancelAnimationFrame(raf)
  raf = 0
  lastTimestamp = undefined
  clearTimeout(reducedTimer)
}

function tick(timestamp: number) {
  if (lastTimestamp !== undefined) clock += (timestamp - lastTimestamp) / 1000
  lastTimestamp = timestamp
  if (pendingPointer !== undefined) {
    engine.setPointer(pendingPointer, clock)
    pendingPointer = undefined
  }
  draw()
  raf = requestAnimationFrame(tick)
}

function run() {
  if (!mounted) return
  stop()
  draw()
  if (props.frozenAt !== undefined || document.hidden) return
  if (reduced.value) {
    const deadlines: number[] = []
    if (pendingGesture) deadlines.push(pendingGesture.playback.at + pendingGesture.playback.duration - clock)
    if (props.state === 'success' && frame.value.state !== 'idle') {
      deadlines.push(SUCCESS_DURATION - frame.value.elapsed)
    }
    if (deadlines.length) {
      const remaining = Math.max(0, Math.min(...deadlines))
      reducedTimer = setTimeout(() => { clock += remaining + 1e-9; run() }, remaining * 1000)
    }
  } else raf = requestAnimationFrame(tick)
}

function pointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch' || !svg.value) return
  const rect = svg.value.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  pendingPointer = {
    x: (event.clientX - rect.left - rect.width / 2) / Math.max(window.innerWidth * 0.3, rect.width),
    y: (event.clientY - rect.top - rect.height / 2) / Math.max(window.innerHeight * 0.3, rect.height),
  }
}

function releasePointer() { pendingPointer = null }
function pointerOut(event: PointerEvent) { if (event.relatedTarget === null) releasePointer() }

function syncListeners() {
  const shouldListen = mounted && props.follow && props.frozenAt === undefined && !reduced.value && !document.hidden
  if (shouldListen === listening) return
  listening = shouldListen
  if (shouldListen) {
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerout', pointerOut)
    window.addEventListener('blur', releasePointer)
    document.addEventListener('pointerleave', releasePointer)
  } else {
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerout', pointerOut)
    window.removeEventListener('blur', releasePointer)
    document.removeEventListener('pointerleave', releasePointer)
  }
  if (!shouldListen) releasePointer()
}

function preferenceChanged() {
  reduced.value = media?.matches ?? false
  emit('motionPreference', reduced.value)
  syncListeners()
  run()
}

function visibilityChanged() {
  releasePointer()
  syncListeners()
  run()
}

watch(() => [props.state, props.replayKey] as const, () => {
  completed = false
  engine.setState(props.state, clock)
  if (props.frozenAt !== undefined || reduced.value) run()
  else draw()
})

watch(() => props.frozenAt, (value, previous) => {
  if (value !== undefined) settleGesture('cancelled')
  if (value === undefined && previous !== undefined) {
    engine = new LoumiEngine(props.state)
    clock = Math.max(0, previous)
    completed = false
  }
  pendingPointer = null
  syncListeners()
  run()
})
watch(() => props.follow, syncListeners)

onMounted(() => {
  mounted = true
  if (arrival) emit('gestureStart', arrival)
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', preferenceChanged)
  document.addEventListener('visibilitychange', visibilityChanged)
  preferenceChanged()
})

onBeforeUnmount(() => {
  mounted = false
  settleGesture('cancelled')
  stop()
  syncListeners()
  media?.removeEventListener('change', preferenceChanged)
  document.removeEventListener('visibilitychange', visibilityChanged)
})

defineExpose<LoumiMascotHandle>({ playIntro, reactToClick, transition, playGesture, focus: () => svg.value?.focus(), getFrame: () => frame.value })
</script>

<template>
  <svg
    ref="svg"
    class="loumi-mascot"
    :width="safeSize"
    :height="safeSize * 164 / 114"
    viewBox="0 0 114 164"
    fill="none"
    :role="canInteract ? 'button' : 'img'"
    :tabindex="canInteract ? 0 : undefined"
    :aria-keyshortcuts="canInteract ? 'Enter Space' : undefined"
    :aria-label="accessibleLabel"
    :opacity="frame.pose.opacity"
    :data-state="frame.state"
    :data-time="frame.time.toFixed(4)"
    :data-reduced-motion="reduced"
    :data-gesture="frame.gesture ?? undefined"
    :data-gesture-time="frame.gesture ? frame.gestureElapsed.toFixed(4) : undefined"
    @click="activate"
    @keydown="keyActivate"
    style="overflow: visible; flex-shrink: 0"
  >
    <g :transform="transform.head">
      <!-- Tête Figma fixe ; seules les expressions des yeux se déforment. -->
      <g data-layer="head" v-html="artwork.head" />
      <g data-layer="gaze" :transform="transform.gaze">
        <g data-layer="dash" :transform="transform.dash" v-html="eyes.dash" />
        <g data-layer="ring" :transform="transform.ring" :opacity="frame.pose.ringOpacity" v-html="eyes.ring" />
      </g>
    </g>
  </svg>
</template>
