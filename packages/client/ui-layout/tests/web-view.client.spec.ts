// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLayoutStore } from '../src/client/stores.ts'
import { WebViewController } from '../src/client/web-view.ts'

const origin = 'https://widget.example.test'
let parent: { postMessage: ReturnType<typeof vi.fn> }
const cleanups: (() => void)[] = []

beforeEach(() => {
  localStorage.clear()
  parent = { postMessage: vi.fn() }
  vi.stubGlobal('parent', parent)
  vi.stubGlobal('__DSH_EMBED_ORIGINS__', [origin])
  history.replaceState({}, '', `/?dsh_embed_origin=${encodeURIComponent(origin)}`)
})
afterEach(() => {
  for (const close of cleanups.splice(0)) close()
  history.replaceState({}, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function start() {
  const instance = createLayoutStore().create()
  const view = new WebViewController(instance)
  cleanups.push(() => view.dispose())
  return { instance, view }
}
function context(payload: object, source = window.parent, from = origin) {
  window.dispatchEvent(new MessageEvent('message', { source, origin: from, data: {
    type: 'dsh:web-context', version: 1, ...payload,
  } }))
}

describe('embedded original Web view', () => {
  it('reports a failing restoration subscriber while restoring later features and completing frame readiness', () => {
    const { instance, view } = start()
    const failure = new Error('feature restoration failed')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const preventUnhandled = (event: ErrorEvent): void => { event.preventDefault() }
    window.addEventListener('error', preventUnhandled)
    cleanups.push(() => { window.removeEventListener('error', preventUnhandled) })
    view.onRestore(() => { throw failure })
    const restored = vi.fn()
    view.onRestore(restored)
    instance.actions.mountWebView()
    const state = { journal: { draft: 'retained' } }
    context({ context: { displayMode: 'inline' }, initialPage: 'journal', viewState: state })
    expect(restored).toHaveBeenCalledExactlyOnceWith(state, 'journal')
    expect(view.getSnapshot()).toMatchObject({ ready: true, scope: 'inline' })
    expect(report).toHaveBeenCalledExactlyOnceWith('[ui-layout] Web view restoration subscriber failed:', failure)
    context({ context: { displayMode: 'fullscreen' } })
    expect(restored).toHaveBeenCalledTimes(1)
    expect(view.getSnapshot().scope).toBe('fullscreen')
  })

  it('isolates a late subscriber failure without interrupting activation or later subscriptions', () => {
    const { view } = start()
    context({ context: { displayMode: 'inline' }, initialPage: 'analysis', viewState: { analysis: { view: 'research' } } })
    const failure = new Error('late restoration failed')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => view.onRestore(() => { throw failure })).not.toThrow()
    const restored = vi.fn()
    const unsubscribe = view.onRestore(restored)
    expect(restored).toHaveBeenCalledExactlyOnceWith({ analysis: { view: 'research' } }, 'analysis')
    expect(report).toHaveBeenCalledExactlyOnceWith('[ui-layout] Web view restoration subscriber failed:', failure)
    unsubscribe()
    view.chooseMode('desktop')
    expect(view.getSnapshot()).toMatchObject({ ready: true, preferences: { inline: 'desktop' } })
  })

  it('waits for the trusted parent before exposing restored inputs, then ignores later restoration payloads', () => {
    const { instance, view } = start()
    expect(view.getSnapshot().ready).toBe(false)
    instance.actions.mountWebView()
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'dsh:web-ready', version: 1 }, origin)
    const first = { context: { displayMode: 'inline', platform: 'desktop' }, initialPage: 'journal', viewState: { journal: { draft: 'unsaved' } } }
    context(first, window, origin)
    context(first, window.parent, 'https://other.example.test')
    expect(view.getSnapshot().ready).toBe(false)
    context(first)
    expect(view.read('journal')).toEqual({ draft: 'unsaved' })
    expect(view.initialPage).toBe('journal')
    view.remember('journal', { draft: 'still editing' })
    context({ context: { displayMode: 'fullscreen', platform: 'mobile' }, initialPage: 'analysis', viewState: { journal: { draft: 'stale' } } })
    expect(view.read('journal')).toEqual({ draft: 'still editing' })
    expect(view.initialPage).toBe('journal')
    expect(view.getSnapshot()).toMatchObject({ scope: 'fullscreen', platform: 'mobile', ready: true })
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'dsh:web-view-state', version: 1, viewState: expect.objectContaining({ journal: { draft: 'still editing' } }),
    }), origin)
  })

  it('keeps manual layout choices per display position and includes them in the private snapshot', () => {
    const { instance, view } = start()
    instance.actions.mountWebView()
    context({ context: { displayMode: 'inline', platform: 'desktop' } })
    view.chooseMode('desktop')
    context({ context: { displayMode: 'fullscreen', platform: 'mobile' } })
    expect(view.getSnapshot().preferences.fullscreen).toBe('auto')
    view.chooseMode('mobile')
    context({ context: { displayMode: 'inline', platform: 'desktop' } })
    expect(view.getSnapshot().preferences.inline).toBe('desktop')
    expect(view.getSnapshot().preferences.fullscreen).toBe('mobile')
    const snapshot = parent.postMessage.mock.calls.at(-1)?.[0].viewState
    expect(snapshot.layout.preferences).toMatchObject({ inline: 'desktop', fullscreen: 'mobile' })
  })

  it('leaves a normal top-level page usable and removes the listener on disposal', () => {
    vi.stubGlobal('parent', window)
    const { view } = start()
    expect(view.getSnapshot()).toMatchObject({ scope: 'native', ready: true, embedded: false })
    view.dispose()
    context({ context: { displayMode: 'inline' } }, window)
    expect(view.getSnapshot().scope).toBe('native')
  })
})
