export type MascotState = 'idle' | 'thinking' | 'success'
export type GestureId = 'intro' | 'click' | 'transition'
export type TransitionDirection = 'left' | 'right'

export interface GestureOptions {
  direction?: TransitionDirection
  reducedMotion?: boolean
  /** Réservé à la première image d’une session, avant tout affichage. */
  initialAppearance?: boolean
}

export interface GesturePlayback {
  readonly id: number
  readonly name: GestureId
  readonly direction: TransitionDirection
  readonly at: number
  readonly duration: number
  readonly reducedMotion: boolean
}

export interface GestureResult extends GesturePlayback {
  readonly status: 'completed' | 'interrupted' | 'cancelled'
}

export interface LoumiMascotHandle {
  playIntro(): Promise<GestureResult>
  reactToClick(): Promise<GestureResult>
  transition(direction?: TransitionDirection): Promise<GestureResult>
  playGesture(name: GestureId, options?: Pick<GestureOptions, 'direction'>): Promise<GestureResult>
  focus(): void
  getFrame(): MascotFrame
}

/** Unités du dessin Figma (114 × 164), angles en degrés. Tête rigide. */
export interface Pose {
  opacity: number
  x: number
  y: number
  rotation: number
  gazeX: number
  gazeY: number
  dashRotation: number
  /** Flèche de la courbe de l’œil, positive vers le bas de l’écran. */
  dashCurve: number
  /** Compression légère du trait pendant un clignement, 1 au neutre. */
  dashOpen: number
  ringX: number
  ringY: number
  ringOpacity: number
  /** 1 = anneau Figma, 0 = œil fermé ; ouverture expressive jusqu’à 1,12. */
  ringOpen: number
  /** Part du suivi du pointeur autorisée par l’expression. */
  followWeight: number
}

export interface MascotFrame {
  pose: Pose
  state: MascotState
  /** Temps absolu fourni par l’appelant, en secondes. */
  time: number
  /** Temps depuis la dernière commande d’état. */
  elapsed: number
  gesture: GestureId | null
  gestureId: number | null
  gestureElapsed: number
}

/** Coordonnées normalisées ; x vers la droite, y vers le bas. */
export interface PointerTarget { x: number; y: number }

export const POSE_KEYS: readonly (keyof Pose)[] = [
  'opacity', 'x', 'y', 'rotation', 'gazeX', 'gazeY', 'dashRotation', 'dashCurve', 'dashOpen',
  'ringX', 'ringY', 'ringOpacity', 'ringOpen', 'followWeight',
]

export const REST_POSE: Readonly<Pose> = Object.freeze({
  opacity: 1, x: 0, y: 0, rotation: 0, gazeX: 0, gazeY: 0,
  dashRotation: 0, dashCurve: 0, dashOpen: 1,
  ringX: 0, ringY: 0, ringOpacity: 1, ringOpen: 1, followWeight: 1,
})
