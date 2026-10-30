import { POSE_KEYS, REST_POSE, type MascotState, type Pose } from './types'

export const SUCCESS_DURATION = 1.9
export const TRANSITION_DURATION = 0.42

export const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n))
export const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }

export function mixPose(a: Pose, b: Pose, weight: number): Pose {
  const result = { ...a }
  for (const key of POSE_KEYS) result[key] = a[key] + (b[key] - a[key]) * weight
  return result
}

export interface PoseKey { at: number; pose: Pose }
export const pose = (overrides: Partial<Pose> = {}): Pose => ({ ...REST_POSE, ...overrides })

/** Deux clés identiques délimitent une vraie pose tenue. */
export function keyframed(keys: readonly PoseKey[], t: number): Pose {
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!
    const b = keys[i]!
    if (t <= b.at) return mixPose(a.pose, b.pose, smooth((t - a.at) / (b.at - a.at)))
  }
  return { ...keys[keys.length - 1]!.pose }
}

/** Fermeture rapide, court contact des paupières, réouverture plus douce. */
export function blinkClosure(t: number, start: number): number {
  const elapsed = t - start
  if (elapsed < 0 || elapsed >= 0.24) return 0
  if (elapsed < 0.07) return smooth(elapsed / 0.07)
  if (elapsed < 0.1) return 1
  return 1 - smooth((elapsed - 0.1) / 0.14)
}

// Calendrier irrégulier reproductible : quatre clignements en 24 s,
// dont une paire à 280 ms d'intervalle. Aucun tirage aléatoire dans sample().
export function naturalBlink(t: number): number {
  const local = Math.max(0, t) % 24
  return Math.max(...[4.35, 10.8, 11.08, 18.3].map(start => blinkClosure(local, start)))
}

export function blink(p: Pose, closure: number): Pose {
  return { ...p, ringOpen: p.ringOpen * (1 - closure), dashOpen: p.dashOpen * (1 - 0.27 * closure) }
}

const idleKeys: readonly PoseKey[] = [
  { at: 0, pose: pose() },
  { at: 1.65, pose: pose() },
  { at: 2.05, pose: pose({ gazeX: 2, gazeY: -0.6 }) },
  { at: 3.6, pose: pose({ gazeX: 2, gazeY: -0.6 }) },
  { at: 4.05, pose: pose() },
  { at: 6.5, pose: pose() },
  { at: 6.9, pose: pose({ gazeX: -1.8, gazeY: 0.75 }) },
  { at: 8.7, pose: pose({ gazeX: -1.8, gazeY: 0.75 }) },
  { at: 9.1, pose: pose({ gazeX: -1.3, gazeY: -0.4 }) },
  { at: 10, pose: pose({ gazeX: -1.3, gazeY: -0.4 }) },
  { at: 10.35, pose: pose() },
  { at: 13.6, pose: pose() },
  { at: 14.15, pose: pose({ gazeX: 1.1, gazeY: 0.5 }) },
  { at: 15.9, pose: pose({ gazeX: 1.1, gazeY: 0.5 }) },
  { at: 16.35, pose: pose() },
  { at: 18, pose: pose() },
]

/** Tête immobile, petits regards séparés par de vrais moments de calme. */
export function idlePose(t: number): Pose {
  return blink(keyframed(idleKeys, Math.max(0, t) % 18), naturalBlink(t))
}

const search = pose({ rotation: -4.2, gazeX: 3.6, gazeY: -4.4, dashRotation: -9, ringOpen: 0.84, followWeight: 0.18 })
const hesitation = pose({ rotation: -3.5, gazeX: 1.8, gazeY: -5.2, dashRotation: -6, ringOpen: 0.91, followWeight: 0.1 })
const adjustment = pose({ rotation: -4.6, gazeX: 3.9, gazeY: -4.1, dashRotation: -10.5, ringOpen: 0.82, followWeight: 0.18 })
const otherSide = pose({ rotation: 2.8, gazeX: -2.3, gazeY: -3.9, dashRotation: 5, ringOpen: 0.87, followWeight: 0.15 })
const secondThought = pose({ rotation: 2.1, gazeX: -1.7, gazeY: -5, dashRotation: 2, ringOpen: 0.9, followWeight: 0.1 })

const thinkingEntrance: readonly PoseKey[] = [
  { at: 0, pose: pose() },
  { at: 0.16, pose: pose({ rotation: 1.2, gazeX: -0.6, gazeY: 0.8, followWeight: 0.5 }) },
  { at: 0.64, pose: search },
]
const thinkingKeys: readonly PoseKey[] = [
  { at: 0, pose: search },
  { at: 1.25, pose: search },
  { at: 1.55, pose: hesitation },
  { at: 1.82, pose: hesitation },
  { at: 2.08, pose: adjustment },
  { at: 3.4, pose: adjustment },
  { at: 3.85, pose: otherSide },
  { at: 4.9, pose: otherSide },
  { at: 5.12, pose: secondThought },
  { at: 5.45, pose: secondThought },
  { at: 6.25, pose: search },
  { at: 6.8, pose: search },
]

/** Recherche lente : anticipation, regard haut/côté, pause, petite hésitation. */
export function thinkingPose(t: number): Pose {
  const p = t < 0.64 ? keyframed(thinkingEntrance, t) : keyframed(thinkingKeys, (t - 0.64) % 6.8)
  return blink(p, naturalBlink(t))
}

const satisfied = pose({ y: -7.6, rotation: -2.2, gazeX: 0.4, gazeY: -2.5, dashRotation: -2, dashCurve: 3.2, ringY: -0.8, ringOpen: 0.94, followWeight: 0 })
const successKeys: readonly PoseKey[] = [
  { at: 0, pose: pose() },
  { at: 0.18, pose: pose({ y: 2.4, rotation: 3, gazeY: 1.2, dashOpen: 0.93, followWeight: 0.15 }) },
  { at: 0.42, pose: { ...satisfied, y: -9.6, rotation: -5.6, ringOpen: 1 } },
  { at: 0.58, pose: satisfied },
  { at: 1.08, pose: satisfied },
  { at: 1.74, pose: pose() },
  { at: SUCCESS_DURATION, pose: pose() },
]

export function successPose(t: number): Pose {
  if (t >= SUCCESS_DURATION) return idlePose(t - SUCCESS_DURATION)
  return blink(keyframed(successKeys, t), blinkClosure(t, 0.27))
}

export const POSES: Readonly<Record<MascotState, (t: number) => Pose>> = {
  idle: idlePose, thinking: thinkingPose, success: successPose,
}

/** Lisibilité par une pose statique, sans clignement ni mouvement répétitif. */
export const REDUCED_POSES: Readonly<Record<MascotState, Pose>> = {
  idle: pose(),
  thinking: { ...search, rotation: -3 },
  success: { ...satisfied, y: 0 },
}
