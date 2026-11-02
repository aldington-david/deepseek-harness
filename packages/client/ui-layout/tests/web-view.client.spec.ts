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
  vi.useRealTimers()
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
function hostResult(requestId: string, result: object, source = window.parent, from = origin, version = 1) {
  window.dispatchEvent(new MessageEvent('message', { source, origin: from, data: {
    type: 'dsh:web-host-result', version, requestId, ...result,
  } }))
}

describe('embedded original Web view', () => {
  it('forwards a protected URL only to the trusted host and accepts only its matching v1 response', async () => {
    const { view } = start()
    context({ context: { displayMode: 'inline' } })
    const pending = view.openLink('https://dsh.example.test/report?period=daily')
    const request = parent.postMessage.mock.calls.at(-1)?.[0]
    expect(request).toMatchObject({ type: 'dsh:web-host-request', version: 1, action: 'open-link',
      payload: { url: 'https://dsh.example.test/report?period=daily' } })
    let completed = false
    void pending.then(() => { completed = true })
    hostResult(request.requestId, { ok: true }, window)
    hostResult(request.requestId, { ok: true }, window.parent, 'https://other.example.test')
    hostResult(request.requestId, { ok: true }, window.parent, origin, 2)
    hostResult('another-request', { ok: true })
    await Promise.resolve()
    expect(completed).toBe(false)
    hostResult(request.requestId, { ok: true })
    await pending
    expect(completed).toBe(true)
  })

  it('preserves complete JSON text and returns host refusal to its caller without a global banner or saved export', async () => {
    const { instance, view } = start()
    context({ context: { displayMode: 'inline' } })
    const file = { name: 'research.json', mimeType: 'application/json' as const,
      text: '{"amount":"9999999999999999.000001","value":false}' }
    const pending = view.downloadFile(file)
    const request = parent.postMessage.mock.calls.at(-1)?.[0]
    expect(request).toMatchObject({ action: 'download-file', payload: file })
    const rejected = expect(pending).rejects.toThrow('宿主拒绝下载')
    hostResult(request.requestId, { ok: false, error: '宿主拒绝下载' })
    await rejected
    expect(instance.getSnapshot().webActionError).toBeNull()
    expect(parent.postMessage.mock.calls.filter(([data]) => data.type === 'dsh:web-view-state')
      .some(([data]) => JSON.stringify(data).includes('9999999999999999.000001'))).toBe(false)
  })

  it.each(['AAECA/8=', ''])('forwards complete binary bytes without adding text or view state (blob=%s)', async (blob) => {
    const { instance, view } = start()
    context({ context: { displayMode: 'inline' } })
    const file = { name: 'engine-state.bin', blob, mimeType: 'application/octet-stream' as const }
    const pending = view.downloadFile(file)
    const request = parent.postMessage.mock.calls.at(-1)?.[0]
    expect(request).toMatchObject({ action: 'download-file', payload: file })
    expect(request.payload).not.toHaveProperty('text')
    const rejected = expect(pending).rejects.toThrow('宿主拒绝下载')
    hostResult(request.requestId, { ok: false, error: '宿主拒绝下载' })
    await rejected
    expect(instance.getSnapshot().webActionError).toBeNull()
    expect(view.read('engine-state.bin')).toBeUndefined()
    const retry = view.downloadFile(file)
    hostResult(parent.postMessage.mock.calls.at(-1)?.[0].requestId, { ok: true })
    await retry
  })

  it('rejects malformed base64 and mixed content before contacting the host', async () => {
    const { view } = start()
    context({ context: { displayMode: 'inline' } })
    const calls = parent.postMessage.mock.calls.length
    const binary = { name: 'state.bin', mimeType: 'application/octet-stream' }
    for (const file of [
      { ...binary, blob: 'A' }, { ...binary, blob: '!!!!' }, { ...binary, blob: 'A===' },
      { ...binary, blob: 42 }, { ...binary, blob: 'AA==', text: '{}' },
      { ...binary, blob: 'AA==', mimeType: 'text/html' },
      { name: 'state.json', mimeType: 'application/json', text: '{}', blob: 'AA==' },
    ]) await expect(view.downloadFile(file as never)).rejects.toThrow('export file is invalid')
    expect(parent.postMessage).toHaveBeenCalledTimes(calls)
  })

  it('intercepts embedded native links while top-level browser links retain their original default', async () => {
    const { instance, view } = start()
    context({ context: { displayMode: 'inline' } })
    const link = document.createElement('a')
    link.href = 'https://example.test/source'; link.target = '_blank'
    document.body.append(link)
    cleanups.push(() => { link.remove() })
    const intercepted: boolean[] = []
    const preventNavigation = (event: MouseEvent): void => { intercepted.push(event.defaultPrevented); event.preventDefault() }
    document.addEventListener('click', preventNavigation)
    cleanups.push(() => { document.removeEventListener('click', preventNavigation) })
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const request = parent.postMessage.mock.calls.at(-1)?.[0]
    expect(request).toMatchObject({ action: 'open-link', payload: { url: link.href } })
    hostResult(request.requestId, { ok: false, error: '宿主拒绝打开链接' })
    await vi.waitFor(() => { expect(instance.getSnapshot().webActionError).toBe('宿主拒绝打开链接') })
    view.dispose()
    vi.stubGlobal('parent', window)
    start()
    const calls = parent.postMessage.mock.calls.length
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(intercepted).toEqual([true, false])
    expect(parent.postMessage).toHaveBeenCalledTimes(calls)
  })

  it('rejects invalid host actions and withdraws pending requests on timeout or disposal', async () => {
    vi.useFakeTimers()
    const { view } = start()
    context({ context: { displayMode: 'inline' } })
    const calls = parent.postMessage.mock.calls.length
    await expect(view.openLink('https://user:password@example.test/')).rejects.toThrow()
    await expect(view.downloadFile({ name: '../private.json', text: '{}', mimeType: 'application/json' })).rejects.toThrow()
    expect(parent.postMessage).toHaveBeenCalledTimes(calls)
    const timed = expect(view.openLink('https://example.test/')).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(65000)
    await timed
    const closed = expect(view.openLink('https://example.test/')).rejects.toThrow(/closed/)
    view.dispose()
    await closed
    expect(vi.getTimerCount()).toBe(0)
  })

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
