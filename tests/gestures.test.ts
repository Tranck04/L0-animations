import { describe, expect, it } from 'vitest'
import { GESTURE_DURATIONS, LoumiEngine, POSE_KEYS, REDUCED_GESTURE_DURATIONS, REST_POSE, type GestureId, type Pose } from '../src/mascot'

function closePose(a: Pose, b: Pose, digits = 8) {
  for (const key of POSE_KEYS) expect(a[key], key).toBeCloseTo(b[key], digits)
}

describe('gestes temporaires indépendants des états', () => {
  it('respecte les durées et revient à la pose de fond au même instant', () => {
    expect(GESTURE_DURATIONS).toEqual({ intro: 1.2, click: 0.64, transition: 0.8 })
    for (const name of ['intro', 'click', 'transition'] as const) {
      const engine = new LoumiEngine('thinking')
      const playback = engine.playGesture(name, 1)
      expect(engine.stateAt(1.3)).toBe('thinking')
      expect(engine.sample(1.3).gesture).toBe(name)
      expect(engine.gestureAt(1 + playback.duration)).toBeNull()
      closePose(engine.sample(1 + playback.duration).pose, new LoumiEngine('thinking').sample(1 + playback.duration).pose)
    }
  })

  it('fait apparaître une silhouette reconnaissable, salue et termine par un clignement', () => {
    const engine = new LoumiEngine()
    engine.playGesture('intro', 0, { initialAppearance: true })
    expect(engine.sample(0).pose.opacity).toBe(0)
    expect(engine.sample(0).pose.y).toBe(6)
    expect(engine.sample(0.1).pose.opacity).toBeGreaterThan(0.5)
    expect(engine.sample(0.18).pose.opacity).toBe(1)
    expect(engine.sample(0.36).pose.y).toBeLessThan(0)
    expect(engine.sample(0.36).pose.dashCurve).toBeGreaterThan(0)
    expect(engine.sample(0.87).pose.ringOpen).toBe(0)
    closePose(engine.sample(1.2).pose, { ...REST_POSE })
  })

  it('ne fait pas disparaître une intro rejouée depuis une pose déjà visible', () => {
    const engine = new LoumiEngine('thinking')
    const from = engine.sample(2).pose
    engine.playGesture('intro', 2)
    closePose(engine.sample(2).pose, from)
    for (let t = 2; t < 3.2; t += 0.01) expect(engine.sample(t).pose.opacity).toBeGreaterThan(0.99)
    const visibleAtZero = new LoumiEngine()
    visibleAtZero.playGesture('intro', 0)
    expect(visibleAtZero.sample(0).pose.opacity).toBe(1)
  })

  it('exprime une attention recentrée, avec recul et sans sourire de célébration', () => {
    const engine = new LoumiEngine()
    engine.playGesture('click', 1)
    const attentive = engine.sample(1.22).pose
    expect(attentive.y).toBeGreaterThan(0)
    expect(attentive.rotation).toBeGreaterThan(0)
    expect(attentive.gazeX).toBe(0)
    expect(attentive.gazeY).toBe(0)
    expect(attentive.ringOpen).toBe(1.12)
    expect(attentive.dashCurve).toBe(0)
    closePose(engine.sample(1.32).pose, attentive)
  })

  it('regarde dans la direction choisie sans retourner le dessin', () => {
    const left = new LoumiEngine()
    const right = new LoumiEngine()
    left.playGesture('transition', 0, { direction: 'left' })
    expect(right.playGesture('transition', 0).direction).toBe('right')
    const l = left.sample(0.3).pose
    const r = right.sample(0.3).pose
    expect(r.x).toBeGreaterThan(0)
    expect(r.gazeX).toBeGreaterThan(0)
    expect(l.x).toBe(-r.x)
    expect(l.gazeX).toBe(-r.gazeX)
    expect(l.rotation).toBe(-r.rotation)
    expect(l.ringOpen).toBe(r.ringOpen)
    expect(left.sample(0.46).pose.ringOpen).toBe(0)
  })

  it('rejoint le dernier état demandé même s’il change pendant le geste', () => {
    const engine = new LoumiEngine()
    const background = new LoumiEngine()
    engine.playGesture('transition', 1)
    const from = engine.sample(1.6).pose
    engine.setState('thinking', 1.6)
    background.setState('thinking', 1.6)
    closePose(engine.sample(1.6).pose, from)
    expect(engine.sample(1.6).gesture).toBe('transition')
    closePose(engine.sample(1.8).pose, background.sample(1.8).pose)
    expect(engine.sample(1.8).state).toBe('thinking')
  })

  it('reprend la pose affichée lors des interruptions, suivi compris', () => {
    const engine = new LoumiEngine('thinking')
    engine.setPointer({ x: -1, y: 1 }, 0)
    for (const [i, name] of (['intro', 'click', 'click', 'transition', 'intro', 'click'] as const).entries()) {
      const time = 0.4 + i * 0.06
      const before = engine.sample(time).pose
      engine.playGesture(name, time, { direction: 'left' })
      closePose(engine.sample(time).pose, before)
      const next = engine.sample(time + 0.00001).pose
      for (const key of POSE_KEYS) expect(Math.abs(next[key] - before[key]), key).toBeLessThan(0.006)
    }
  })

  it('ne cumule pas le recul lors de nombreux clics rapprochés', () => {
    const engine = new LoumiEngine()
    for (let i = 0; i < 80; i++) {
      const t = 1 + i * 0.025
      engine.playGesture('click', t)
      const p = engine.sample(t + 0.02).pose
      expect(Math.abs(p.y)).toBeLessThan(6)
      expect(Math.abs(p.rotation)).toBeLessThan(8)
      expect(p.ringOpen).toBeGreaterThanOrEqual(0)
      expect(p.ringOpen).toBeLessThanOrEqual(1.12)
    }
    expect(engine.sample(4).gesture).toBeNull()
    closePose(engine.sample(4).pose, new LoumiEngine().sample(4).pose)
  })

  it('atténue le pointeur pendant le geste puis rétablit progressivement le suivi', () => {
    const engine = new LoumiEngine()
    engine.setPointer({ x: -1, y: 1 }, 0)
    engine.playGesture('transition', 1)
    expect(engine.sample(1.3).pose.gazeX).toBe(5)
    expect(engine.sample(1.3).pose.followWeight).toBe(0)
    expect(engine.sample(1.66).pose.followWeight).toBeGreaterThan(0)
    expect(engine.sample(1.66).pose.followWeight).toBeLessThan(1)
    expect(engine.sample(2).pose.gazeX).toBeCloseTo(-4, 3)
  })

  it('conserve les images historiques indépendamment de l’ordre des lectures', () => {
    const engine = new LoumiEngine()
    engine.playGesture('intro', 0, { initialAppearance: true })
    const early = engine.sample(0.07)
    engine.playGesture('click', 0.4)
    engine.playGesture('transition', 0.5, { direction: 'left' })
    const middle = engine.sample(0.7)
    engine.sample(30)
    expect(engine.sample(0.07)).toEqual(early)
    expect(engine.sample(0.7)).toEqual(middle)
    engine.sample(0.7).pose.x = 1000
    expect(engine.sample(0.7)).toEqual(middle)
  })

  it('propose des versions réduites fixes et très courtes', () => {
    for (const name of ['intro', 'click', 'transition'] as const) {
      const engine = new LoumiEngine()
      const playback = engine.playGesture(name, 0, { reducedMotion: true })
      expect(playback.duration).toBe(REDUCED_GESTURE_DURATIONS[name])
      expect(playback.duration).toBeLessThanOrEqual(0.18)
      const a = engine.sample(0.01, { reducedMotion: true }).pose
      expect(engine.sample(playback.duration - 0.01, { reducedMotion: true }).pose).toEqual(a)
      expect(a.x).toBe(0)
      expect(a.y).toBe(0)
      expect(a.rotation).toBe(0)
      expect(a.opacity).toBe(1)
      expect(engine.sample(playback.duration, { reducedMotion: true }).gesture).toBeNull()
      closePose(engine.sample(playback.duration, { reducedMotion: true }).pose, { ...REST_POSE })
    }
  })

  it('rejette les commandes invalides sans abîmer le geste courant', () => {
    const engine = new LoumiEngine()
    engine.playGesture('click', 2)
    const before = engine.sample(2.2)
    expect(() => engine.playGesture('other' as GestureId, 2)).toThrow(RangeError)
    expect(() => engine.playGesture('click', NaN)).toThrow(RangeError)
    expect(() => engine.playGesture('intro', 1)).toThrow(RangeError)
    expect(engine.sample(2.2)).toEqual(before)
  })
})
