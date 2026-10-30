import { blink, blinkClosure, keyframed, pose, smooth, type PoseKey } from './poses'
import type { GestureId, Pose, TransitionDirection } from './types'

export const GESTURE_DURATIONS: Readonly<Record<GestureId, number>> = { intro: 1.2, click: 0.64, transition: 0.8 }
export const REDUCED_GESTURE_DURATIONS: Readonly<Record<GestureId, number>> = { intro: 0.16, click: 0.14, transition: 0.18 }
export const GESTURE_ENTRY: Readonly<Record<GestureId, number>> = { intro: 0.18, click: 0.12, transition: 0.14 }
const RETURN_AT: Readonly<Record<GestureId, number>> = { intro: 1, click: 0.36, transition: 0.52 }

const introKeys: readonly PoseKey[] = [
  { at: 0, pose: pose({ opacity: 0, y: 6, rotation: -3, ringOpen: 0.82, dashCurve: 0.5, followWeight: 0 }) },
  { at: 0.18, pose: pose({ y: 1.5, rotation: -1, dashCurve: 1, followWeight: 0 }) },
  { at: 0.36, pose: pose({ y: -1.8, rotation: 2.8, dashCurve: 1.5, followWeight: 0 }) },
  { at: 0.52, pose: pose({ y: -1, rotation: 2.2, dashCurve: 1.5, followWeight: 0 }) },
  { at: 0.7, pose: pose({ y: -0.5, dashCurve: 1, followWeight: 0 }) },
  { at: 1.2, pose: pose({ dashCurve: 0.5, followWeight: 0 }) },
]
const attentive = pose({ x: -0.8, y: 3.2, rotation: 3.6, gazeX: 0, gazeY: 0, dashRotation: -9, ringOpen: 1.12, followWeight: 0 })
const clickKeys: readonly PoseKey[] = [
  { at: 0, pose: pose() },
  { at: 0.07, pose: pose({ y: 1, rotation: -1, followWeight: 0.3 }) },
  { at: 0.16, pose: attentive },
  { at: 0.64, pose: attentive },
]
const transitionKeys: readonly PoseKey[] = [
  { at: 0, pose: pose() },
  { at: 0.09, pose: pose({ x: -0.8, rotation: -0.8, gazeX: -0.8, gazeY: 0.3, followWeight: 0.3 }) },
  { at: 0.25, pose: pose({ x: 4.2, rotation: 3.8, gazeX: 5, gazeY: -1, dashRotation: 4, ringOpen: 0.98, followWeight: 0 }) },
  { at: 0.8, pose: pose({ x: 4.2, rotation: 3.8, gazeX: 5, gazeY: -1, dashRotation: 4, ringOpen: 0.98, followWeight: 0 }) },
]

/** La direction déplace les calques ; elle ne retourne jamais le dessin. */
export function gesturePose(name: GestureId, elapsed: number, direction: TransitionDirection = 'right'): Pose {
  if (name === 'intro') return blink(keyframed(introKeys, elapsed), blinkClosure(elapsed, 0.79))
  if (name === 'click') return keyframed(clickKeys, elapsed)
  const p = blink(keyframed(transitionKeys, elapsed), blinkClosure(elapsed, 0.38))
  const sign = direction === 'left' ? -1 : 1
  return { ...p, x: p.x * sign, rotation: p.rotation * sign, gazeX: p.gazeX * sign, dashRotation: p.dashRotation * sign }
}

/** Retour vers la pose de fond évaluée au même instant, et non vers un neutre figé. */
export function gestureInfluence(name: GestureId, elapsed: number): number {
  return 1 - smooth((elapsed - RETURN_AT[name]) / (GESTURE_DURATIONS[name] - RETURN_AT[name]))
}

export function reducedGesturePose(name: GestureId, background: Pose, direction: TransitionDirection): Pose {
  if (name === 'intro') return { ...background, opacity: 1, dashCurve: 0.8, followWeight: 0 }
  if (name === 'click') return { ...background, gazeX: 0, gazeY: 0, dashRotation: -5, dashCurve: 0, ringOpen: 1.06, followWeight: 0 }
  return { ...background, gazeX: direction === 'left' ? -2 : 2, gazeY: 0, followWeight: 0 }
}
