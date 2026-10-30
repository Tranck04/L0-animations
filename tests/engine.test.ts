import { describe, expect, it } from 'vitest'
import {
  COLORS, GEOMETRY, idlePose, LoumiEngine, POSE_KEYS, renderSvg, REST_POSE,
  SUCCESS_DURATION, TRANSITION_DURATION, type Pose,
} from '../src/mascot'

function expectPoseClose(a: Pose, b: Pose, digits = 9) {
  for (const key of POSE_KEYS) expect(a[key], key).toBeCloseTo(b[key], digits)
}

function scriptedEngine() {
  const engine = new LoumiEngine()
  engine.setState('thinking', 0.8)
  engine.setPointer({ x: 0.8, y: -0.6 }, 0.9)
  engine.setState('success', 0.96)
  engine.setState('idle', 1.07)
  engine.setState('thinking', 1.13)
  engine.setPointer({ x: -0.5, y: 0.8 }, 1.2)
  engine.setPointer(null, 1.4)
  engine.setState('success', 2)
  return engine
}

describe('échantillonnage déterministe sans horloge', () => {
  it('redonne exactement la même image après des lectures futures et passées', () => {
    const engine = scriptedEngine()
    const reference = engine.sample(1.02)
    engine.sample(30)
    engine.sample(0)
    expect(engine.sample(1.02)).toEqual(reference)
    expect(scriptedEngine().sample(1.02)).toEqual(reference)
  })

  it('ne dépend pas de la fréquence ni du nombre des échantillons', () => {
    const a = scriptedEngine()
    const b = scriptedEngine()
    for (let t = 0; t <= 4; t += 1 / 30) a.sample(t)
    for (let t = 0; t <= 4; t += 1 / 144) b.sample(t)
    for (const t of [0, 0.9, 1.01, 1.3, 2.3, 3.7]) expect(a.sample(t)).toEqual(b.sample(t))
  })

  it('préserve les images historiques après de nouvelles commandes', () => {
    const engine = new LoumiEngine()
    const before = engine.sample(0.2)
    engine.setState('thinking', 1)
    engine.setPointer({ x: 1, y: 1 }, 1.1)
    engine.setState('success', 1.2)
    expect(engine.sample(0.2)).toEqual(before)
  })

  it('ne partage pas de pose mutable avec l’appelant', () => {
    const engine = scriptedEngine()
    const original = engine.sample(1.04)
    engine.sample(1.04).pose.gazeX = 10000
    expect(engine.sample(1.04)).toEqual(original)
  })

  it('refuse les temps non finis et les commandes antidatées', () => {
    const engine = new LoumiEngine()
    expect(() => engine.sample(NaN)).toThrow(RangeError)
    expect(() => engine.sample(Infinity)).toThrow(RangeError)
    expect(engine.sample(-1)).toEqual(engine.sample(0))
    engine.setState('thinking', 2)
    expect(() => engine.setState('idle', 1)).toThrow(RangeError)
    engine.setPointer(null, 2)
    expect(() => engine.setPointer(null, 1)).toThrow(RangeError)
  })
})

describe('transitions interrompues', () => {
  it('conserve chaque coordonnée à chaque interruption, y compris avec suivi actif', () => {
    const engine = new LoumiEngine()
    engine.setPointer({ x: 0.7, y: -0.3 }, 0.1)
    const commands = ['thinking', 'success', 'idle', 'thinking', 'success', 'success', 'idle'] as const
    commands.forEach((state, index) => {
      const t = 0.4 + index * 0.055
      const before = engine.sample(t).pose
      engine.setState(state, t)
      expectPoseClose(engine.sample(t).pose, before)
      for (const key of POSE_KEYS) expect(Math.abs(engine.sample(t + 0.00001).pose[key] - before[key])).toBeLessThan(0.005)
    })
  })

  it('conserve aussi la vitesse au début d’une interruption', () => {
    const engine = new LoumiEngine()
    engine.setState('thinking', 0.5)
    const t = 0.63
    const h = 0.000001
    const current = engine.sample(t).pose
    const previous = engine.sample(t - h).pose
    engine.setState('success', t)
    const next = engine.sample(t + h).pose
    for (const key of POSE_KEYS) {
      expect(Math.abs((next[key] - current[key]) / h - (current[key] - previous[key]) / h), key).toBeLessThan(0.04)
    }
  })

  it('rejoint la pose cible et reste continue à la fin du raccord', () => {
    const engine = new LoumiEngine('thinking')
    engine.setState('idle', 1)
    const t = 1 + TRANSITION_DURATION
    expectPoseClose(engine.sample(t).pose, idlePose(TRANSITION_DURATION))
    expectPoseClose(engine.sample(t - 0.000001).pose, engine.sample(t + 0.000001).pose, 4)
  })
})

describe('pointeur et réussite', () => {
  it('interpole le regard sans saut, puis retrouve naturellement le regard de repos', () => {
    const engine = new LoumiEngine()
    const before = engine.sample(1).pose
    engine.setPointer({ x: 1, y: -1 }, 1)
    expectPoseClose(engine.sample(1).pose, before)
    expect(engine.sample(2).pose.gazeX).toBeGreaterThan(3.9)
    expect(engine.sample(2).pose.gazeY).toBeLessThan(-2.9)
    const followed = engine.sample(2).pose
    engine.setPointer({ x: -1, y: 1 }, 2)
    expectPoseClose(engine.sample(2).pose, followed)
    const released = engine.sample(2.1).pose
    engine.setPointer(null, 2.1)
    expectPoseClose(engine.sample(2.1).pose, released)
    expectPoseClose(engine.sample(7).pose, idlePose(7), 8)
  })

  it('borne les cibles et ignore les positions invalides', () => {
    const engine = new LoumiEngine()
    engine.setPointer({ x: 100, y: -100 }, 0)
    const before = engine.sample(2)
    engine.setPointer({ x: NaN, y: 0 }, 1)
    expect(engine.sample(2)).toEqual(before)
    expect(Math.abs(before.pose.gazeX)).toBeLessThanOrEqual(4)
    expect(Math.abs(before.pose.gazeY)).toBeLessThanOrEqual(3)
  })

  it('joue success une fois, revient au repos et peut être relancé', () => {
    const engine = new LoumiEngine('success')
    expect(engine.sample(0.42).pose.y).toBe(-9.6)
    expect(engine.stateAt(SUCCESS_DURATION - 0.001)).toBe('success')
    expect(engine.stateAt(SUCCESS_DURATION)).toBe('idle')
    expectPoseClose(engine.sample(SUCCESS_DURATION).pose, { ...REST_POSE })
    engine.setState('success', 2)
    expect(engine.stateAt(2.46)).toBe('success')
    expect(engine.sample(2.42).pose.y).toBeCloseTo(-9.6)
    expect(engine.stateAt(3.91)).toBe('idle')
  })

  it('rend des poses fixes en mouvement réduit et ignore le pointeur', () => {
    const engine = new LoumiEngine('thinking')
    engine.setPointer({ x: 1, y: 1 }, 0)
    expect(engine.sample(1, { reducedMotion: true }).pose).toEqual(engine.sample(8, { reducedMotion: true }).pose)
    const success = new LoumiEngine('success')
    expect(success.sample(0.4, { reducedMotion: true }).pose).toEqual(success.sample(1.3, { reducedMotion: true }).pose)
    expect(success.sample(2, { reducedMotion: true }).state).toBe('idle')
    expect(success.sample(2, { reducedMotion: true }).pose).toEqual(REST_POSE)
  })
})

describe('SVG fidèle et indépendant du framework', () => {
  it('garde le format 114 × 164 et les couleurs exactes', () => {
    const svg = renderSvg(new LoumiEngine().sample(0))
    expect(svg).toContain('width="114" height="164" viewBox="0 0 114 164"')
    for (const color of Object.values(COLORS)) expect(svg).toContain(color)
    for (const layer of ['head', 'gaze', 'dash', 'ring']) expect(svg).toContain(`data-layer="${layer}"`)
    expect(GEOMETRY.dash.x).toBeLessThan(GEOMETRY.ring.x)
    expect(svg).not.toContain('https://')
  })

  it('protège les libellés et isole les masques de plusieurs instances', () => {
    const svg = renderSvg(new LoumiEngine().sample(0), { size: 228, label: '<L° & "vous">', id: 'instance:2' })
    expect(svg).toContain('width="228" height="328"')
    expect(svg).toContain('aria-label="&lt;L° &amp; &quot;vous&quot;&gt;"')
    expect(svg).toContain('id="instance_2-outline"')
    expect(svg).toContain('mask="url(#instance_2-outline)"')
    expect(() => renderSvg(new LoumiEngine().sample(0), { size: 0 })).toThrow(RangeError)
  })
})
