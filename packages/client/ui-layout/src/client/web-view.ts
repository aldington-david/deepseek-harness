/** Trusted embedding context and private, unsaved view state for the original Web UI. */
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { createLayoutStore } from './stores.ts'
import { en } from './web-view-locales.ts'

/** A user's display choice; automatic follows the current host and viewport. */
export type ViewMode = 'auto' | 'mobile' | 'desktop'
/** Browser position with an independently remembered display choice. */
export type ViewScope = 'native' | 'inline' | 'fullscreen'
/** Host presentation information, never authentication or business operations. */
export interface WebContext {
  displayMode: 'inline' | 'fullscreen'
  platform?: 'web' | 'desktop' | 'mobile'
  theme?: 'light' | 'dark'
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number }
}
/** Root-owned presentation shared by the shell and feature panels. */
export interface ViewPresentation {
  embedded: boolean
  ready: boolean
  scope: ViewScope
  platform?: WebContext['platform']
  theme?: WebContext['theme']
  safeAreaInsets?: WebContext['safeAreaInsets']
  preferences: Record<ViewScope, ViewMode>
}

const storageKey = 'dsh.layout.presentation.v1'
const scopes: ViewScope[] = ['native', 'inline', 'fullscreen']
/**
 * Accept only the three display choices exposed by the sidebar.
 * @param value - Wire or persisted display choice.
 * @returns Whether the value is a supported choice.
 */
export function isViewMode(value: unknown): value is ViewMode {
  return value === 'auto' || value === 'mobile' || value === 'desktop'
}
/** @returns Whether a wire value can hold named view fields. */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
/**
 * Resolve the current display choice against host context and frame width.
 * @param view - Current user preference and host presentation.
 * @param width - Actual frame width in CSS pixels.
 * @returns Whether the frame uses phone presentation.
 */
export function phonePresentation(view: ViewPresentation, width: number): boolean {
  const mode = view.preferences[view.scope]
  return mode === 'mobile' || (mode === 'auto' && (view.scope === 'inline' || view.platform === 'mobile' || width <= 780))
}
/**
 * Create independent automatic choices for each browser position.
 * @returns Native defaults before a trusted embedding context is received.
 */
export function initialPresentation(): ViewPresentation {
  return { embedded: false, ready: true, scope: 'native', preferences: { native: 'auto', inline: 'auto', fullscreen: 'auto' } }
}

/** Read and remember UI-only fields; feature panels keep their own field meanings. */
export interface WebViewState {
  /**
   * @param key - Feature-owned snapshot name.
   * @returns Its unsaved view snapshot, or undefined.
   */
  read(key: string): unknown
  /**
   * Remember a snapshot without performing a business write.
   * @param key - Feature-owned snapshot name.
   * @param value - JSON-compatible view data, excluding credentials and pending mutations.
   */
  remember(key: string, value: unknown): void
}

/** Complete user-requested JSON export, without authentication or model context. */
export interface WebDownload {
  /** Download filename, not a filesystem path. */
  name: string
  /** Complete serialized JSON, preserving numeric strings and original fields. */
  text: string
  /** The only content type accepted by this export adapter. */
  mimeType: 'application/json'
}

/** Original-page presentation and explicitly registered private view state. */
export interface WebView extends WebViewState {
  /**
   * Ask the trusted host to open a user-selected HTTP(S) link.
   * @param url - Address without embedded credentials; no authentication headers are forwarded.
   * @returns Completion or a reported host failure.
   */
  openLink(url: string): Promise<void>
  /**
   * Download complete JSON through the trusted host's file API.
   * @param file - User-requested export content.
   * @returns Completion or a reported host failure.
   */
  downloadFile(file: WebDownload): Promise<void>
  /** @returns The stable current presentation snapshot. */
  getSnapshot(): ViewPresentation
  /**
   * @param listener - Presentation listener.
   * @returns Listener cleanup.
   */
  subscribe(listener: () => void): () => void
  /** Initial feature-page request, supplied only during first restoration. */
  readonly initialPage: string | undefined
  /** @param mode - User choice for the current display position. */
  chooseMode(mode: ViewMode): void
  /** @param preferences - Existing feature choices, adopted only where the frame has no saved choice. */
  seedPreferences(preferences: Partial<Record<ViewScope, ViewMode>>): void
  /**
   * Register before feature content mounts; invoke immediately when already restored.
   * Callback failures are reported without blocking other features or frame readiness.
   * @param listener - Feature-owned validation and restoration callback.
   * @returns Listener cleanup.
   */
  onRestore(listener: (state: Record<string, unknown>, initialPage?: string) => void): () => void
}

type LayoutInstance = ReturnType<ReturnType<typeof createLayoutStore>['create']>
type PendingHostRequest = { resolve: () => void; reject: (error: Error) => void }

/** Owns one frame's trusted message listener and private view snapshots. */
export class WebViewController implements WebView {
  private readonly origin: string | undefined
  private readonly off: () => void
  private announced = false
  private disposed = false
  private seeded = false
  private savedPreferences: Partial<Record<ViewScope, ViewMode>> = {}
  private viewState: Record<string, unknown> = {}
  private page: string | undefined
  private readonly restoreListeners = new Set<(state: Record<string, unknown>, initialPage?: string) => void>()
  private readonly hostRequests = new Map<string, PendingHostRequest>()
  private readonly onPageHide = (): void => { this.dispose() }

  /**
   * @param instance - The same declared store instance used by the root frame.
   * @param text - Localized host-operation messages.
   */
  constructor(private readonly instance: LayoutInstance, private readonly text: (key: keyof typeof en) => string = key => en[key]) {
    const origins = (globalThis as { __DSH_EMBED_ORIGINS__?: unknown }).__DSH_EMBED_ORIGINS__
    const requested = new URLSearchParams(location.search).get('dsh_embed_origin')
    this.origin = window.parent !== window && requested !== null && Array.isArray(origins) && origins.includes(requested)
      ? requested : undefined
    let saved: unknown
    try { saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') }
    catch (_error) { /* Unavailable or malformed browser preferences leave the default choices. */ }
    if (record(saved)) for (const scope of scopes) if (isViewMode(saved[scope])) this.savedPreferences[scope] = saved[scope]
    instance.actions.initializeWebView(this.origin !== undefined, this.savedPreferences)
    let previous = instance.getSnapshot()
    this.off = instance.subscribe(() => {
      const current = instance.getSnapshot()
      if (current.webViewMounted && this.origin !== undefined && !this.announced) {
        this.announced = true
        window.parent.postMessage({ type: 'dsh:web-ready', version: 1 }, this.origin)
      }
      if (current.presentation.preferences !== previous.presentation.preferences) {
        for (const scope of scopes) {
          if (current.presentation.preferences[scope] !== previous.presentation.preferences[scope]) {
            this.savedPreferences[scope] = current.presentation.preferences[scope]
          }
        }
        try { localStorage.setItem(storageKey, JSON.stringify(this.savedPreferences)) }
        catch (_error) { /* The active view remains usable when browser persistence is unavailable. */ }
      }
      if (current.presentation.ready && (!previous.presentation.ready || current.panelInfo !== previous.panelInfo
        || current.presentation.preferences !== previous.presentation.preferences)) this.publish()
      previous = current
    })
    window.addEventListener('message', this.receive)
    if (this.origin !== undefined) {
      window.addEventListener('pagehide', this.onPageHide)
      document.addEventListener('click', this.openClickedLink)
      document.addEventListener('auxclick', this.openClickedLink)
    }
  }

  /** @param url - User-selected HTTP(S) address. @returns The host operation result. */
  openLink = async (url: string): Promise<void> => {
    try {
      const target = new URL(url, location.href)
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error(this.text('invalidLink'))
      await this.requestHost('open-link', { url: target.href })
    } catch (error) { throw this.reportActionFailure(error) }
  }

  /** @param file - Complete JSON export. @returns The host operation result. */
  downloadFile = async (file: WebDownload): Promise<void> => {
    try {
      if (!file || typeof file.name !== 'string' || !file.name || /[\\/\u0000-\u001f\u007f]/.test(file.name)
        || typeof file.text !== 'string' || file.mimeType !== 'application/json') throw new Error(this.text('invalidFile'))
      await this.requestHost('download-file', { name: file.name, text: file.text, mimeType: file.mimeType })
    } catch (error) { throw this.reportActionFailure(error) }
  }

  private reportActionFailure(error: unknown): Error {
    const failure = error instanceof Error ? error : new Error(String(error))
    if (!this.disposed) this.instance.actions.reportWebActionError(failure.message)
    return failure
  }

  private requestHost(action: 'open-link' | 'download-file', payload: object): Promise<void> {
    if (this.disposed) return Promise.reject(new Error(this.text('closed')))
    const origin = this.origin
    if (origin === undefined || !this.getSnapshot().ready) return Promise.reject(new Error(this.text('unavailable')))
    this.instance.actions.reportWebActionError(null)
    const requestId = randomUUID()
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error): void => {
        clearTimeout(timer)
        this.hostRequests.delete(requestId)
        if (error === undefined) resolve()
        else reject(error)
      }
      const timer = setTimeout(() => { finish(new Error(this.text('timeout'))) }, 65000)
      this.hostRequests.set(requestId, { resolve: () => { finish() }, reject: finish })
      try {
        window.parent.postMessage({ type: 'dsh:web-host-request', version: 1, requestId, action, payload }, origin)
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
    })
  }

  private openClickedLink = (event: MouseEvent): void => {
    if (this.disposed || this.origin === undefined || !this.getSnapshot().ready || event.defaultPrevented || event.button > 1) return
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(link instanceof HTMLAnchorElement) || link.target !== '_blank' && !link.hasAttribute('download')) return
    const url = new URL(link.href, location.href)
    if (!['http:', 'https:'].includes(url.protocol)) return
    event.preventDefault()
    void this.openLink(url.href).catch(() => { /* The frame presents the failure; a click has no promise consumer. */ })
  }

  /** @returns The stable presentation snapshot consumed by framework-bound hooks. */
  getSnapshot = (): ViewPresentation => this.instance.getSnapshot().presentation
  /**
   * @param listener - Presentation listener.
   * @returns Listener cleanup.
   */
  subscribe = (listener: () => void): (() => void) => this.instance.subscribe(listener)
  /** @returns The initial, host-requested feature page, if supplied. */
  get initialPage(): string | undefined { return this.page }
  /**
   * @param key - Feature-owned snapshot name.
   * @returns Its unsaved snapshot, or undefined.
   */
  read = (key: string): unknown => this.viewState[key]
  /**
   * @param key - Feature-owned snapshot name.
   * @param value - JSON-compatible viewing state.
   */
  remember = (key: string, value: unknown): void => {
    this.viewState = { ...this.viewState, [key]: value }
    if (this.getSnapshot().ready) this.publish()
  }
  /** @param mode - Deliberate user choice for the current display position. */
  chooseMode = (mode: ViewMode): void => { this.instance.actions.chooseViewMode(mode) }
  /** @param preferences - Existing feature choices, adopted only where no frame preference exists. */
  seedPreferences = (preferences: Partial<Record<ViewScope, ViewMode>>): void => {
    if (this.seeded) return
    this.seeded = true
    this.instance.actions.seedViewPreferences({ ...preferences, ...this.savedPreferences })
  }
  /**
   * Register initial restoration before feature content mounts; invoke immediately if already restored.
   * Callback failures are reported without interrupting subscription registration.
   * @param listener - Feature-owned validation and restoration callback.
   * @returns Listener cleanup.
   */
  onRestore = (listener: (state: Record<string, unknown>, initialPage?: string) => void): (() => void) => {
    this.restoreListeners.add(listener)
    const current = this.getSnapshot()
    if (current.embedded && current.ready) notifySubscribers([listener], '[ui-layout] Web view restoration', this.viewState, this.page)
    return () => { this.restoreListeners.delete(listener) }
  }

  private receive = (event: MessageEvent<unknown>): void => {
    if (this.disposed || this.origin === undefined || event.source !== window.parent || event.origin !== this.origin) return
    const message = event.data
    if (!record(message) || message.version !== 1) return
    if (message.type === 'dsh:web-host-result') {
      if (typeof message.requestId !== 'string' || typeof message.ok !== 'boolean') return
      const pending = this.hostRequests.get(message.requestId)
      if (pending === undefined) return
      if (message.ok) pending.resolve()
      else if (typeof message.error === 'string' && message.error) pending.reject(new Error(message.error))
      return
    }
    if (message.type !== 'dsh:web-context' || !record(message.context)) return
    const value = message.context
    if (value.displayMode !== 'inline' && value.displayMode !== 'fullscreen') return
    if (value.platform !== undefined && value.platform !== 'web' && value.platform !== 'desktop' && value.platform !== 'mobile') return
    if (value.theme !== undefined && value.theme !== 'light' && value.theme !== 'dark') return
    const context: WebContext = { displayMode: value.displayMode }
    if (value.platform === 'web' || value.platform === 'desktop' || value.platform === 'mobile') context.platform = value.platform
    if (value.theme === 'light' || value.theme === 'dark') context.theme = value.theme
    if (value.safeAreaInsets !== undefined) {
      const insets = value.safeAreaInsets
      if (!record(insets) || !['top', 'right', 'bottom', 'left'].every(side =>
        typeof insets[side] === 'number' && Number.isFinite(insets[side]) && insets[side] >= 0)) return
      context.safeAreaInsets = {
        top: Number(insets.top), right: Number(insets.right), bottom: Number(insets.bottom), left: Number(insets.left),
      }
    }
    const first = !this.getSnapshot().ready
    const preferences: Partial<Record<ViewScope, ViewMode>> = {}
    if (first) {
      this.viewState = record(message.viewState) ? message.viewState : {}
      this.page = typeof message.initialPage === 'string' ? message.initialPage : undefined
      const layout = this.viewState.layout
      if (record(layout) && record(layout.preferences)) {
        for (const scope of scopes) if (isViewMode(layout.preferences[scope])) preferences[scope] = layout.preferences[scope]
      }
      Object.assign(this.savedPreferences, preferences)
      notifySubscribers(this.restoreListeners, '[ui-layout] Web view restoration', this.viewState, this.page)
    }
    this.instance.actions.receiveWebContext(context, first ? preferences : undefined)
  }

  private publish(): void {
    if (this.origin === undefined) return
    const snapshot = this.instance.getSnapshot()
    window.parent.postMessage({ type: 'dsh:web-view-state', version: 1, viewState: {
      ...this.viewState,
      layout: { activePanelId: snapshot.panelInfo.activePanelId, preferences: snapshot.presentation.preferences },
    } }, this.origin)
  }

  /** Remove this frame's message and store listeners. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.off()
    this.restoreListeners.clear()
    window.removeEventListener('message', this.receive)
    window.removeEventListener('pagehide', this.onPageHide)
    document.removeEventListener('click', this.openClickedLink)
    document.removeEventListener('auxclick', this.openClickedLink)
    for (const pending of [...this.hostRequests.values()]) pending.reject(new Error(this.text('closed')))
  }
}
