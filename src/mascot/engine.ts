import { clamp, mixPose, POSES, REDUCED_POSES, SUCCESS_DURATION, TRANSITION_DURATION } from './poses'
import { GESTURE_DURATIONS, GESTURE_ENTRY, gestureInfluence, gesturePose, REDUCED_GESTURE_DURATIONS, reducedGesturePose } from './gestures'
import { POSE_KEYS, type GestureId, type GestureOptions, type GesturePlayback, type MascotFrame, type MascotState, type PointerTarget, type Pose } from './types'

interface StateEvent {
  at: number
  state: MascotState
  correction: Pose | null
  velocityCorrection: Pose | null
}
interface GestureEvent {
  playback: GesturePlayback
  at: number
  correction: Pose
  velocityCorrection: Pose
}
interface Look { x: number; y: number; weight: number }
interface PointerEvent { at: number; from: Look; target: Look }
const NO_LOOK: Readonly<Look> = { x: 0, y: 0, weight: 0 }
const EPSILON = 0.0001

function correctionFrom(from: Pose, before: Pose, to: Pose, toNext: Pose, dt: number) {
  const correction = { ...from }
  const velocityCorrection = { ...from }
  for (const key of POSE_KEYS) {
    correction[key] = from[key] - to[key]
    const velocity = dt > 0 ? (from[key] - before[key]) / dt : 0
    velocityCorrection[key] = velocity - (toNext[key] - to[key]) / EPSILON
  }
  return { correction, velocityCorrection }
}

function constrain(pose: Pose): Pose {
  pose.opacity = clamp(pose.opacity)
  pose.ringOpacity = clamp(pose.ringOpacity)
  pose.ringOpen = clamp(pose.ringOpen, 0, 1.12)
  pose.dashOpen = clamp(pose.dashOpen, 0.65, 1)
  pose.followWeight = clamp(pose.followWeight)
  return pose
}

/** Même raccord de Hermite pour les états et pour les gestes temporaires. */
function raccord(target: Pose, event: Pick<StateEvent, 'correction' | 'velocityCorrection'>, elapsed: number, duration: number): Pose {
  if (!event.correction || !event.velocityCorrection || elapsed >= duration) return constrain(target)
  const u = clamp(elapsed / duration)
  const positionWeight = 2 * u ** 3 - 3 * u ** 2 + 1
  const velocityWeight = (u ** 3 - 2 * u ** 2 + u) * duration
  for (const key of POSE_KEYS) target[key] += event.correction[key] * positionWeight + event.velocityCorrection[key] * velocityWeight
  return constrain(target)
}

function validTime(t: number): number {
  if (!Number.isFinite(t)) throw new RangeError('Le temps doit être fini, en secondes.')
  return Math.max(0, t)
}

function latest<T extends { at: number }>(events: readonly T[], t: number): T | undefined {
  let low = 0
  let high = events.length - 1
  let found: T | undefined
  while (low <= high) {
    const middle = (low + high) >>> 1
    const event = events[middle]!
    if (event.at <= t) { found = event; low = middle + 1 } else high = middle - 1
  }
  return found
}

/**
 * Aucun DOM, framework, hasard ou horloge. Toutes les entrées sont horodatées.
 * sample(t) ne modifie rien : même historique + même t = même image, y compris
 * lors d’une lecture en arrière. Une instance conserve son historique de session.
 */
export class LoumiEngine {
  private readonly states: StateEvent[]
  private readonly pointers: PointerEvent[] = []
  private readonly gestures: GestureEvent[] = []
  private nextGestureId = 0

  constructor(initial: MascotState = 'idle') {
    if (!Object.hasOwn(POSES, initial)) throw new RangeError('État de mascotte inconnu.')
    this.states = [{ at: 0, state: initial, correction: null, velocityCorrection: null }]
  }

  /** Commandes par ordre chronologique ; success peut être rejoué. */
  setState(state: MascotState, time: number): void {
    const at = validTime(time)
    if (!Object.hasOwn(POSES, state)) throw new RangeError('État de mascotte inconnu.')
    const previous = this.states[this.states.length - 1]!
    if (at < previous.at) throw new RangeError('Les commandes d’état doivent être chronologiques.')
    if (state === this.stateAt(at) && state !== 'success') return
    const from = this.backgroundAt(at)
    const before = this.backgroundAt(Math.max(0, at - EPSILON))
    const dt = Math.min(at, EPSILON)
    const to = POSES[state](0)
    const toNext = POSES[state](EPSILON)
    const { correction, velocityCorrection } = correctionFrom(from, before, to, toNext, dt)
    this.states.push({ at, state, correction, velocityCorrection })
  }

  /** Un seul geste à la fois. Un nouveau geste remplace le précédent sans l’empiler. */
  playGesture(name: GestureId, time: number, options: GestureOptions = {}): GesturePlayback {
    const at = validTime(time)
    if (!Object.hasOwn(GESTURE_DURATIONS, name)) throw new RangeError('Geste de mascotte inconnu.')
    const direction = options.direction ?? 'right'
    if (direction !== 'left' && direction !== 'right') throw new RangeError('Direction inconnue.')
    if (at < (this.gestures.at(-1)?.at ?? 0)) throw new RangeError('Les gestes doivent être chronologiques.')
    const reducedMotion = options.reducedMotion ?? false
    const playback: GesturePlayback = Object.freeze({
      id: ++this.nextGestureId, name, direction, at, reducedMotion,
      duration: (reducedMotion ? REDUCED_GESTURE_DURATIONS : GESTURE_DURATIONS)[name],
    })
    const to = this.gestureTarget(playback, at)
    const toNext = this.gestureTarget(playback, at + EPSILON)
    // Seule l’intro à l’origine d’une session apparaît depuis l’invisible.
    // Une intro rejouée repart de l’image courante, sans disparition soudaine.
    const initialArrival = options.initialAppearance && name === 'intro' && at === 0 && this.gestures.length === 0
    const from = initialArrival ? to : this.poseAt(at)
    const before = initialArrival ? to : this.poseAt(Math.max(0, at - EPSILON))
    const correction = correctionFrom(from, before, to, toNext, Math.min(at, EPSILON))
    this.gestures.push({ at, playback, ...correction })
    return playback
  }

  gestureAt(time: number): GesturePlayback | null {
    const t = validTime(time)
    const event = latest(this.gestures, t)
    return event && t < event.at + event.playback.duration ? event.playback : null
  }

  /** null relâche le regard ; le lissage exponentiel est analytique, indépendant des fps. */
  setPointer(pointer: PointerTarget | null, time: number): void {
    const at = validTime(time)
    if (at < (this.pointers[this.pointers.length - 1]?.at ?? 0)) {
      throw new RangeError('Les commandes de pointeur doivent être chronologiques.')
    }
    if (pointer && (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y))) return
    const target: Look = pointer
      ? { x: clamp(pointer.x, -1, 1) * 4, y: clamp(pointer.y, -1, 1) * 3, weight: 1 }
      : { ...NO_LOOK }
    this.pointers.push({ at, from: this.lookAt(at), target })
  }

  stateAt(time: number): MascotState {
    const t = validTime(time)
    const event = latest(this.states, t)!
    return event.state === 'success' && t - event.at >= SUCCESS_DURATION ? 'idle' : event.state
  }

  private backgroundAt(t: number): Pose {
    const event = latest(this.states, t)!
    const elapsed = t - event.at
    const pose = POSES[event.state](elapsed)
    return raccord(pose, event, elapsed, TRANSITION_DURATION)
  }

  private gestureTarget(playback: GesturePlayback, t: number): Pose {
    if (playback.reducedMotion) return reducedGesturePose(playback.name, { ...REDUCED_POSES[this.stateAt(t)] }, playback.direction)
    const elapsed = t - playback.at
    return mixPose(this.backgroundAt(t), gesturePose(playback.name, elapsed, playback.direction), gestureInfluence(playback.name, elapsed))
  }

  private poseAt(t: number): Pose {
    const event = latest(this.gestures, t)
    if (!event || !this.gestureAt(t)) return this.backgroundAt(t)
    const target = this.gestureTarget(event.playback, t)
    if (event.playback.reducedMotion) return target
    return raccord(target, event, t - event.at, GESTURE_ENTRY[event.playback.name])
  }

  private lookAt(t: number): Look {
    const event = latest(this.pointers, t)
    if (!event) return { ...NO_LOOK }
    const weight = 1 - Math.exp(-(t - event.at) / 0.16)
    return {
      x: event.from.x + (event.target.x - event.from.x) * weight,
      y: event.from.y + (event.target.y - event.from.y) * weight,
      weight: event.from.weight + (event.target.weight - event.from.weight) * weight,
    }
  }

  sample(time: number, options: { reducedMotion?: boolean } = {}): MascotFrame {
    const t = validTime(time)
    const state = this.stateAt(t)
    const event = latest(this.states, t)!
    const elapsed = t - event.at
    const gesture = this.gestureAt(t)
    const metadata = { state, time: t, elapsed, gesture: gesture?.name ?? null, gestureId: gesture?.id ?? null, gestureElapsed: gesture ? t - gesture.at : 0 }
    if (options.reducedMotion) {
      const base = { ...REDUCED_POSES[state] }
      return { ...metadata, pose: gesture ? reducedGesturePose(gesture.name, base, gesture.direction) : base }
    }
    const pose = this.poseAt(t)
    const look = this.lookAt(t)
    // Le poids est lui-même raccordé pendant les interruptions d’expression.
    const pointerWeight = look.weight * pose.followWeight
    pose.gazeX += (look.x - pose.gazeX) * pointerWeight
    pose.gazeY += (look.y - pose.gazeY) * pointerWeight
    return { ...metadata, pose }
  }
}
