import { describe, expect, it } from 'vitest'
import { LoumiEngine, POSE_KEYS, REST_POSE, SUCCESS_DURATION } from '../src/mascot'
import { ARTWORK } from '../src/mascot/artwork'
import { blinkClosure, idlePose, naturalBlink, successPose, thinkingPose } from '../src/mascot/poses'
import { eyeArtwork } from '../src/mascot/svg'

describe('lecture émotionnelle et rythme', () => {
  it('laisse de vrais moments d’immobilité au repos', () => {
    expect(idlePose(0.2)).toEqual(REST_POSE)
    expect(idlePose(1.5)).toEqual(REST_POSE)
    expect(idlePose(2.2)).toEqual(idlePose(3.4))
    expect(idlePose(2.2).gazeX).toBe(2)
    expect(idlePose(2.2).rotation).toBe(0)
  })

  it('construit la réflexion avec une pose haute tenue puis une hésitation', () => {
    const search = thinkingPose(1)
    expect(search.gazeX).toBeGreaterThan(3)
    expect(search.gazeY).toBeLessThan(-4)
    expect(search.rotation).toBeLessThan(-4)
    expect(search.dashRotation).toBeLessThan(-8)
    expect(search.ringOpen).toBeLessThan(0.9)
    expect(thinkingPose(1.7)).toEqual(search)
    const hesitation = thinkingPose(2.25)
    expect(hesitation.gazeX).toBeLessThan(search.gazeX)
    expect(hesitation.gazeY).toBeLessThan(search.gazeY)
    expect(thinkingPose(2.4)).toEqual(hesitation)
    expect(thinkingPose(3).gazeX).toBeGreaterThan(hesitation.gazeX)
  })

  it('anticipe le succès, se redresse vivement et tient la satisfaction 500 ms', () => {
    expect(successPose(0.18).y).toBeGreaterThan(0)
    expect(successPose(0.42).y).toBeCloseTo(-9.6)
    const held = successPose(0.58)
    expect(successPose(1.08)).toEqual(held)
    expect(held.dashCurve).toBe(3.2)
    expect(held.dashOpen).toBe(1)
    expect(successPose(1.4).dashCurve).toBeGreaterThan(0)
    expect(successPose(1.4).dashCurve).toBeLessThan(held.dashCurve)
    expect(successPose(1.74)).toEqual(REST_POSE)
    expect(successPose(SUCCESS_DURATION)).toEqual(REST_POSE)
  })
})

describe('clignements déterministes', () => {
  it('ferme rapidement, marque le contact et rouvre plus lentement', () => {
    expect(blinkClosure(0.9, 1)).toBe(0)
    expect(blinkClosure(1.07, 1)).toBeCloseTo(1)
    expect(blinkClosure(1.09, 1)).toBe(1)
    expect(blinkClosure(1.17, 1)).toBeCloseTo(0.5)
    expect(blinkClosure(1.24, 1)).toBe(0)
  })

  it('espace les clignements et reproduit une paire occasionnelle', () => {
    for (const t of [0, 1, 3, 5, 9, 12, 15, 22]) expect(naturalBlink(t)).toBe(0)
    for (const t of [4.43, 10.88, 11.16, 18.38]) {
      expect(naturalBlink(t)).toBe(1)
      expect(naturalBlink(t + 24)).toBe(1)
    }
    expect(naturalBlink(11.055)).toBe(0)
    expect(idlePose(4.43).ringOpen).toBe(0)
    expect(idlePose(4.43).dashOpen).toBeCloseTo(0.73)
    expect(idlePose(4.7).ringOpen).toBe(1)
  })

  it('accompagne le redressement de succès d’un seul clignement lisible', () => {
    expect(successPose(0.35).ringOpen).toBe(0)
    expect(successPose(0.6).ringOpen).toBeGreaterThan(0.9)
    expect(successPose(0.8).ringOpen).toBe(successPose(1).ringOpen)
  })

  it('reste reproductible en lecture avant/arrière et à des fréquences différentes', () => {
    const a = new LoumiEngine()
    const b = new LoumiEngine()
    for (let t = 0; t <= 30; t += 1 / 24) a.sample(t)
    for (let t = 30; t >= 0; t -= 1 / 144) b.sample(t)
    for (const t of [4.37, 4.43, 4.52, 10.88, 11.16, 28.43]) expect(a.sample(t)).toEqual(b.sample(t))
  })
})

describe('géométrie expressive et suivi', () => {
  it('garde la courbe du trait vers le bas, à épaisseur constante et bouts ronds', () => {
    const held = successPose(0.8)
    const { dash } = eyeArtwork(held)
    expect(dash).toContain('stroke-width="4.5"')
    expect(dash).toContain('stroke-linecap="round"')
    // Q : la courbe à mi-chemin descend de la moitié de la flèche du contrôle.
    const match = dash.match(/M([\d.]+) 80 Q32 ([\d.]+) ([\d.]+) 80/)!
    const centerY = 40 + Number(match[2]) / 2
    const angle = (held.rotation + held.dashRotation) * Math.PI / 180
    const endpointSpan = (Number(match[3]) - Number(match[1])) / 2
    expect((centerY - 80) * Math.cos(angle)).toBeGreaterThan(Math.abs(endpointSpan * Math.sin(angle)))
    expect(dash).not.toContain('<mouth')
  })

  it('ferme les paupières à largeur constante sans changer l’épaisseur verte', () => {
    const ring = eyeArtwork(idlePose(4.43)).ring
    expect(ring).toContain('stroke-width="4.4"')
    expect(ring).not.toContain('scale(')
    expect(ring).toContain('M92.8 80.8')
    expect(ring).toContain('77.2 80.8')
    const coordinates = ring.match(/d="([^"]+)"/)![1]!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    const ys = coordinates.filter((_, index) => index % 2 === 1)
    expect(Math.max(...ys)).toBeCloseTo(Math.min(...ys))
  })

  it('retrouve les chemins Figma exacts après l’expression et le clignement', () => {
    for (const p of [idlePose(0), idlePose(5), successPose(1.8), successPose(SUCCESS_DURATION)]) {
      expect(eyeArtwork(p)).toEqual({ dash: ARTWORK.dash, ring: ARTWORK.ring })
    }
  })

  it('préserve le regard expressif puis rend progressivement la main au pointeur', () => {
    const engine = new LoumiEngine('success')
    engine.setPointer({ x: 1, y: 1 }, 0)
    expect(engine.sample(0.8).pose.gazeX).toBe(successPose(0.8).gazeX)
    expect(engine.sample(0.8).pose.gazeY).toBe(successPose(0.8).gazeY)
    expect(engine.sample(1.4).pose.followWeight).toBeGreaterThan(0)
    expect(engine.sample(1.4).pose.followWeight).toBeLessThan(1)
    expect(engine.sample(2).pose.gazeX).toBeCloseTo(4, 3)
    const thinking = new LoumiEngine('thinking')
    thinking.setPointer({ x: -1, y: 1 }, 0)
    expect(thinking.sample(1).pose.gazeX).toBeGreaterThan(2)
    expect(thinking.sample(1).pose.gazeY).toBeLessThan(-2)
  })

  it('raccorde aussi les paupières et la courbe lors de changements rapides', () => {
    const engine = new LoumiEngine('success')
    engine.setPointer({ x: -1, y: 1 }, 0)
    for (const [i, state] of (['thinking', 'idle', 'success', 'thinking', 'success'] as const).entries()) {
      const time = 0.35 + i * 0.045
      const before = engine.sample(time).pose
      engine.setState(state, time)
      const after = engine.sample(time).pose
      for (const key of POSE_KEYS) expect(after[key], key).toBeCloseTo(before[key], 9)
      const next = engine.sample(time + 0.00001).pose
      for (const key of POSE_KEYS) expect(Math.abs(next[key] - after[key]), key).toBeLessThan(0.005)
    }
    for (let t = 0; t < 2; t += 0.01) {
      const { ringOpen, dashOpen, followWeight } = engine.sample(t).pose
      expect(ringOpen).toBeGreaterThanOrEqual(0)
      expect(ringOpen).toBeLessThanOrEqual(1)
      expect(dashOpen).toBeGreaterThanOrEqual(0.65)
      expect(dashOpen).toBeLessThanOrEqual(1)
      expect(followWeight).toBeGreaterThanOrEqual(0)
      expect(followWeight).toBeLessThanOrEqual(1)
    }
  })
})
