import { ARTWORK } from './artwork'
import { clamp } from './poses'
import type { MascotFrame, Pose } from './types'

export const GEOMETRY = Object.freeze({ width: 114, height: 164, dash: { x: 32, y: 80 }, ring: { x: 85, y: 80 } })
export const COLORS = Object.freeze({ head: '#EDF2ED', outline: '#7F8883', ink: '#0B0D0C', green: '#109F82' })

const escapeXml = (text: string) => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]!)

export function scopedArtwork(id: string) {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return { ...ARTWORK, head: ARTWORK.head.replaceAll('stroke0_0_8', `${safeId}-outline`) }
}

export function transforms(frame: MascotFrame) {
  const p = frame.pose
  return {
    head: `translate(${p.x} ${p.y}) rotate(${p.rotation} 57 82)`,
    gaze: `translate(${p.gazeX} ${p.gazeY})`,
    dash: `rotate(${p.dashRotation} 32 80)`,
    ring: `translate(${p.ringX} ${p.ringY})`,
  }
}

/** Les tracés Figma exacts sont réemployés dès que les yeux sont neutres. */
export function eyeArtwork(pose: Pose): { dash: string; ring: string } {
  const dashWidth = 4.5 * clamp(pose.dashOpen, 0.65, 1)
  const dash = pose.dashCurve === 0 && pose.dashOpen === 1 ? ARTWORK.dash
    : `<path d="M${22 + dashWidth / 2} 80 Q32 ${80 + pose.dashCurve * 2} ${42 - dashWidth / 2} 80" fill="none" stroke="${COLORS.ink}" stroke-width="${dashWidth}" stroke-linecap="round"/>`

  const opening = clamp(pose.ringOpen, 0, 1.12)
  // Coins de l’œil fixes et trait vert de 4,4 unités : l’œil se ferme sans
  // rétrécir. Les deux paupières se rejoignent légèrement sous le centre.
  const y = 80 + 0.8 * (1 - opening)
  const half = 7.8 * opening
  const control = 4.3078 * opening
  const ring = opening === 1 ? ARTWORK.ring
    : `<path d="M92.8 ${y}C92.8 ${y + control} 89.3078 ${y + half} 85 ${y + half}C80.6922 ${y + half} 77.2 ${y + control} 77.2 ${y}C77.2 ${y - control} 80.6922 ${y - half} 85 ${y - half}C89.3078 ${y - half} 92.8 ${y - control} 92.8 ${y}Z" fill="none" stroke="${COLORS.green}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`
  return { dash, ring }
}

/** SVG autonome ; un id unique par instance évite les collisions des masques. */
export function renderSvg(frame: MascotFrame, options: { size?: number; label?: string; id?: string } = {}): string {
  const size = options.size ?? 114
  if (!Number.isFinite(size) || size <= 0) throw new RangeError('La largeur doit être positive et finie.')
  const art = scopedArtwork(options.id ?? 'loumi')
  const eyes = eyeArtwork(frame.pose)
  const transform = transforms(frame)
  const label = escapeXml(options.label ?? 'L°, mascotte de LOUMI°LAB')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 164 / 114}" viewBox="0 0 114 164" fill="none" style="overflow:visible" role="img" aria-label="${label}" opacity="${clamp(frame.pose.opacity)}"><g transform="${transform.head}"><g data-layer="head">${art.head}</g><g data-layer="gaze" transform="${transform.gaze}"><g data-layer="dash" transform="${transform.dash}">${eyes.dash}</g><g data-layer="ring" transform="${transform.ring}" opacity="${clamp(frame.pose.ringOpacity)}">${eyes.ring}</g></g></g></svg>`
}
