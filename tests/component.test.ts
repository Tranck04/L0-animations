// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import LoumiMascot from '../src/components/LoumiMascot.vue'
import { LoumiEngine, POSE_KEYS, renderSvg, SUCCESS_DURATION, type LoumiMascotHandle, type MascotFrame, type MascotState } from '../src/mascot'

let callbacks: Map<number, FrameRequestCallback>
let nextId: number
let mountedApps: App[]
let preference: EventTarget & { matches: boolean }

beforeEach(() => {
  vi.useFakeTimers()
  callbacks = new Map()
  nextId = 0
  mountedApps = []
  preference = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', vi.fn(() => preference))
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextId
    callbacks.set(id, callback)
    return id
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { callbacks.delete(id) }))
})

afterEach(() => {
  for (const app of mountedApps) app.unmount()
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mount(initial: { state?: MascotState; size?: number; follow?: boolean; frozenAt?: number; replayKey?: number; intro?: boolean; interactive?: boolean } = {}) {
  const props = reactive({ state: 'idle' as MascotState, follow: false, size: 114, frozenAt: undefined as number | undefined, replayKey: 0, intro: false, interactive: true, ...initial })
  const frames: MascotFrame[] = []
  const complete = vi.fn()
  const gestureStart = vi.fn()
  const gestureEnd = vi.fn()
  let handle: LoumiMascotHandle
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(LoumiMascot, { ...props, ref: instance => { if (instance) handle = instance as unknown as LoumiMascotHandle }, onFrame: frame => frames.push(frame), onComplete: complete, onGestureStart: gestureStart, onGestureEnd: gestureEnd }) })
  app.mount(host)
  mountedApps.push(app)
  const svg = host.querySelector('svg')!
  return { props, host, svg, frames, complete, app, handle: handle!, gestureStart, gestureEnd }
}

async function tick(ms: number) {
  const pending = [...callbacks.values()]
  callbacks.clear()
  for (const callback of pending) callback(ms)
  await nextTick()
}

describe('contrat observable du composant Vue', () => {
  it('rend les tracés et couleurs originaux à t = 0, avec un libellé accessible', () => {
    const { svg } = mount({ frozenAt: 0 })
    const master = new DOMParser().parseFromString(readFileSync('src/assets/loumi-master.svg', 'utf8'), 'image/svg+xml')
    const actualPaths = [...svg.querySelectorAll('path')]
    const referencePaths = [...master.querySelectorAll('path')]
    expect(actualPaths).toHaveLength(referencePaths.length)
    referencePaths.forEach((path, i) => {
      for (const attribute of ['d', 'fill', 'stroke', 'stroke-width']) {
        expect(actualPaths[i]!.getAttribute(attribute), attribute).toBe(path.getAttribute(attribute))
      }
    })
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toContain('au repos')
    expect(callbacks.size).toBe(0)
  })

  it('arrête complètement le RAF en mode figé, permet de scruter puis reprend au même instant', async () => {
    const { props, svg, frames } = mount()
    expect(callbacks.size).toBe(1)
    props.frozenAt = 0.42
    props.state = 'success'
    await nextTick()
    expect(callbacks.size).toBe(0)
    expect(frames.at(-1)!.pose.y).toBe(-9.6)
    const frozenMarkup = svg.innerHTML
    await tick(5000)
    expect(svg.innerHTML).toBe(frozenMarkup)
    props.frozenAt = 0.8
    await nextTick()
    expect(frames.at(-1)!.pose.rotation).toBe(-2.2)
    props.frozenAt = undefined
    await nextTick()
    expect(frames.at(-1)!.time).toBe(0.8)
    expect(callbacks.size).toBe(1)
  })

  it('termine success une seule fois et permet de rejouer avec replayKey', async () => {
    const { props, svg, complete } = mount({ state: 'success' })
    await tick(0)
    await tick(SUCCESS_DURATION * 1000 + 100)
    expect(svg.getAttribute('data-state')).toBe('idle')
    expect(complete).toHaveBeenCalledTimes(1)
    await tick(SUCCESS_DURATION * 1000 + 300)
    expect(complete).toHaveBeenCalledTimes(1)
    props.replayKey++
    await nextTick()
    await tick(SUCCESS_DURATION * 2000 + 400)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('suit le pointeur et le relâche lorsqu’il quitte la fenêtre', async () => {
    const { svg, frames } = mount({ follow: true })
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 400, top: 300, width: 114, height: 164, right: 514, bottom: 464, x: 400, y: 300, toJSON: () => ({}) })
    await tick(0)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1800, clientY: 0, pointerType: 'mouse' }))
    await tick(20)
    await tick(1000)
    expect(frames.at(-1)!.pose.gazeX).toBeGreaterThan(3.9)
    window.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null }))
    await tick(1020)
    await tick(5000)
    expect(frames.at(-1)!.pose.gazeX).toBeCloseTo(new LoumiEngine().sample(5).pose.gazeX, 7)
  })

  it('adapte la taille uniformément et traite les changements rapides sans erreur', async () => {
    const { props, svg } = mount()
    await tick(0)
    for (const [index, state] of (['thinking', 'success', 'idle', 'thinking'] as const).entries()) {
      props.state = state
      await nextTick()
      await tick(50 + index * 50)
    }
    props.size = 228
    await nextTick()
    expect(svg.getAttribute('width')).toBe('228')
    expect(svg.getAttribute('height')).toBe('328')
    expect(svg.getAttribute('viewBox')).toBe('0 0 114 164')
    expect(svg.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('respecte la préférence réduite et sa modification pendant la session', async () => {
    const { props, svg, frames, complete } = mount({ state: 'thinking', follow: true })
    preference.matches = true
    preference.dispatchEvent(new Event('change'))
    await nextTick()
    expect(callbacks.size).toBe(0)
    expect(svg.getAttribute('data-reduced-motion')).toBe('true')
    const pose = frames.at(-1)!.pose
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1500, clientY: 1 }))
    await tick(2000)
    expect(frames.at(-1)!.pose).toEqual(pose)
    props.state = 'success'
    await nextTick()
    vi.advanceTimersByTime(SUCCESS_DURATION * 1000)
    await nextTick()
    expect(complete).toHaveBeenCalledTimes(1)
    expect(svg.getAttribute('data-state')).toBe('idle')
    expect(callbacks.size).toBe(0)
    preference.matches = false
    preference.dispatchEvent(new Event('change'))
    await nextTick()
    expect(callbacks.size).toBe(1)
  })

  it('nettoie le RAF et les événements à la destruction du composant', () => {
    const { app } = mount({ follow: true })
    expect(callbacks.size).toBe(1)
    app.unmount()
    mountedApps = mountedApps.filter(item => item !== app)
    expect(callbacks.size).toBe(0)
    expect(() => window.dispatchEvent(new PointerEvent('pointermove'))).not.toThrow()
  })

  it('le rendu SVG autonome emploie les mêmes calques que le composant', () => {
    const { svg } = mount({ state: 'thinking', frozenAt: 0.62 })
    const standalone = new DOMParser().parseFromString(renderSvg(new LoumiEngine('thinking').sample(0.62)), 'image/svg+xml')
    for (const layer of ['head', 'gaze', 'dash', 'ring']) {
      const query = `[data-layer="${layer}"]`
      const actual = svg.querySelector(query)!
      const expected = standalone.querySelector(query)!
      expect(actual.getAttribute('transform')).toBe(expected.getAttribute('transform'))
      expect(actual.querySelector('path')!.getAttribute('d')).toBe(expected.querySelector('path')!.getAttribute('d'))
    }
  })
})

describe('gestes du composant, interactions et cycle de vie', () => {
  it('joue le salut une fois au montage, puis ne le rejoue pas sur une mise à jour', async () => {
    const { props, svg, gestureStart, gestureEnd } = mount({ intro: true })
    expect(svg.getAttribute('data-gesture')).toBe('intro')
    expect(svg.getAttribute('opacity')).toBe('0')
    expect(gestureStart).toHaveBeenCalledTimes(1)
    await tick(0)
    await tick(600)
    await tick(1250)
    expect(svg.hasAttribute('data-gesture')).toBe(false)
    expect(gestureEnd).toHaveBeenCalledWith(expect.objectContaining({ name: 'intro', status: 'completed' }))
    props.size = 160
    props.follow = true
    await nextTick()
    props.frozenAt = 0
    await nextTick()
    props.frozenAt = undefined
    await nextTick()
    expect(gestureStart).toHaveBeenCalledTimes(1)
  })

  it('permet de désactiver le salut automatique et garde les vignettes sans boucle', () => {
    const disabled = mount({ intro: false })
    expect(disabled.gestureStart).not.toHaveBeenCalled()
    expect(disabled.svg.getAttribute('opacity')).toBe('1')
    const frozen = mount({ intro: true, frozenAt: 0 })
    expect(frozen.gestureStart).not.toHaveBeenCalled()
    expect(frozen.svg.getAttribute('role')).toBe('img')
  })

  it('réagit au clic sur la mascotte et signale la fin une seule fois', async () => {
    const { svg, gestureStart, gestureEnd } = mount()
    expect(gestureStart).not.toHaveBeenCalled()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(gestureStart).not.toHaveBeenCalled()
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(gestureStart).toHaveBeenCalledWith(expect.objectContaining({ name: 'click' }))
    await tick(0)
    await tick(250)
    expect(svg.getAttribute('data-gesture')).toBe('click')
    await tick(700)
    await tick(900)
    expect(gestureEnd).toHaveBeenCalledTimes(1)
    expect(gestureEnd).toHaveBeenCalledWith(expect.objectContaining({ name: 'click', status: 'completed' }))
  })

  it('gère Entrée, Espace et les répétitions clavier sans double activation', async () => {
    const { svg, gestureStart } = mount()
    expect(svg.getAttribute('role')).toBe('button')
    expect(svg.getAttribute('tabindex')).toBe('0')
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(gestureStart).toHaveBeenCalledTimes(1)
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    svg.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(true)
    expect(gestureStart).toHaveBeenCalledTimes(2)
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true }))
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(gestureStart).toHaveBeenCalledTimes(2)
    await nextTick()
  })

  it('raccorde les clics répétés et résout la promesse interrompue', async () => {
    const { handle, frames, gestureEnd } = mount({ state: 'thinking' })
    await tick(0)
    const first = handle.reactToClick()
    await tick(220)
    const before = frames.at(-1)!.pose
    const second = handle.reactToClick()
    for (const key of POSE_KEYS) expect(frames.at(-1)!.pose[key], key).toBeCloseTo(before[key], 8)
    expect((await first).status).toBe('interrupted')
    await tick(900)
    expect((await second).status).toBe('completed')
    expect(gestureEnd).toHaveBeenCalledTimes(2)
    expect(frames.at(-1)!.state).toBe('thinking')
    expect(frames.at(-1)!.gesture).toBeNull()
  })

  it('expose les gestes, leur direction et le retour au dernier état de fond', async () => {
    const { props, handle, frames } = mount()
    await tick(0)
    const transition = handle.transition('left')
    await tick(300)
    expect(frames.at(-1)!.pose.gazeX).toBeLessThan(0)
    props.state = 'thinking'
    await nextTick()
    await tick(850)
    expect((await transition).direction).toBe('left')
    expect(frames.at(-1)!.state).toBe('thinking')
    const intro = handle.playIntro()
    await tick(2100)
    expect((await intro).name).toBe('intro')
    expect(frames.at(-1)!.state).toBe('thinking')
  })

  it('annule proprement un geste lors du gel et refuse les interactions figées', async () => {
    const { props, svg, handle, gestureStart } = mount()
    const pending = handle.transition()
    props.frozenAt = 0.8
    await nextTick()
    expect((await pending).status).toBe('cancelled')
    const count = gestureStart.mock.calls.length
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(gestureStart).toHaveBeenCalledTimes(count)
    expect(callbacks.size).toBe(0)
    expect((await handle.playIntro()).status).toBe('cancelled')
  })

  it('utilise des gestes courts sans RAF en mouvement réduit', async () => {
    preference.matches = true
    const { handle, svg, gestureEnd } = mount({ intro: true })
    expect(callbacks.size).toBe(0)
    expect(svg.getAttribute('opacity')).toBe('1')
    await vi.advanceTimersByTimeAsync(160)
    expect(gestureEnd).toHaveBeenCalledWith(expect.objectContaining({ name: 'intro', status: 'completed', duration: 0.16 }))
    const click = handle.reactToClick()
    await vi.advanceTimersByTimeAsync(140)
    expect((await click).status).toBe('completed')
    const transition = handle.transition()
    await vi.advanceTimersByTimeAsync(180)
    expect((await transition).status).toBe('completed')
    expect(callbacks.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('résout un geste encore actif à la destruction et retire son RAF', async () => {
    const { handle, app, gestureEnd } = mount()
    const pending = handle.playIntro()
    app.unmount()
    mountedApps = mountedApps.filter(item => item !== app)
    expect((await pending).status).toBe('cancelled')
    expect(gestureEnd).toHaveBeenCalledTimes(1)
    expect(callbacks.size).toBe(0)
  })
})
