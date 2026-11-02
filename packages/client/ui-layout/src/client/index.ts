/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry), and wires the panel-action service face.
 * ctx.layout selects the main panel and controls column geometry; Session
 * selection belongs to the Session Controller. A second effect seats the theme
 * presenter, which projects ctx.theme snapshots onto document.body.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelInfo } from './service.ts'
import { AppFrame } from './AppFrame.tsx'
import { createLayoutStore } from './stores.ts'
import { LayoutController } from './service.ts'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { en, zh } from './shortcut-locales.ts'
import { ThemePresenter } from './theme-presenter.ts'
import { WebViewController } from './web-view.ts'
import type { ViewMode } from './web-view.ts'
import { en as webEn, zh as webZh } from './web-view-locales.ts'

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
// ILayout: the ctx.layout face consumers and test fakes type against.
// OwnerShare contracts below are the render-side halves registrants compose
// against; the frame components and the store factory are package-internal.
export { LayoutController } from './service.ts'
export type { ILayout, MainPanelId, PanelInfo } from './service.ts'

/** Selector hook over root-scoped panel selection. */
export type UsePanelInfo = SnapshotSelectorHook<PanelInfo>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    layout: import('./service.ts').ILayout
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Layout keyboard command labels. */
    'shortcuts.layout': keyof typeof zh
    /** Original-frame host-operation outcomes. */
    'layout.web': keyof typeof webEn
  }

  interface GlobalStandardProps {
    /** Subscribe to the selected main panel independently of parent renders. */
    usePanelInfo: UsePanelInfo
  }

  interface SlotMap {
    // The 'root' entry itself is the runtime's built-in slot (declared
    // there); these are the frame's children, declared by the same
    // register() call that contributes AppFrame. Session owners never pass
    // sessionId: the framework injects it as a standard prop.
    /**
     * The whole left column. OCCUPIED by ui-sidebar's SidebarRoot, which
     * declares the workspace and settings seats inside it — registering here
     * replaces the navigation column outright rather than adding to it, and
     * the seats it declares disappear with it. To add something to the
     * sidebar, register into one of those inner seats instead.
     *
     * The occupant receives the frame's live column state (collapsed, width)
     * and is expected to render the compact control rail while collapsed.
     */
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
    /**
     * Central panel selected by sidebar entry id. The reserved `conversation`
     * key hosts the Conversation; other keys receive no Session binding.
     */
    'main': { kind: 'keyed'; scope: 'root' }
    /**
     * The right column: a track the centre makes room for, or nothing. OCCUPIED
     * by the right Sidebar, which uses the resolved column width in normal
     * mode and covers the viewport in fullscreen, retaining the wide-screen
     * column reservation underneath.
     *
     * Whether the panel is shown, and whether it takes a track, is the
     * occupant's own recorded business — it reports the composition of its
     * expanded and presentation state through `ctx.layout`, and the frame sizes
     * the track and places the resize handle from that. The expand control is
     * not this column's: it is a button in the conversation header. The root
     * occupant decides when to render its Session-bound content.
     */
    'rightbar': { kind: 'single'; scope: 'root'; owner: RightbarOwnerProps }
    /**
     * Full-width bottom content below all three columns. Its rendered height
     * reduces the columns' available height; empty content reserves no space.
     * The occupant owns its height, visibility, and controls. It receives no
     * Session binding and remains mounted across main-panel navigation.
     */
    'shell.bottom': { kind: 'single'; scope: 'root' }
    /**
     * Frame-wide floating layer, above every column and outside their scroll
     * containers. Deliberately generic and unowned by any feature: a badge, a
     * toast stack or a status pill all belong here, and entries order among
     * themselves. The layer itself is click-through — entries opt back into
     * pointer events — so an occupant never blocks the app underneath.
     *
     * This is the additive seat for a frame-wide surface of your own: a fresh
     * `id` is added beside the shipped entries instead of replacing them.
     */
    'shell.overlay': { kind: 'list'; scope: 'root' }
    /**
     * Window-chrome seat at the frame's top-left, over every main panel.
     * Mounted only while the sidebar column is fully hidden (macOS desktop
     * collapse; other platforms keep the rail), so the occupant can assume the
     * frame edge is the window edge and the macOS traffic lights sit before it.
     * OCCUPIED by ui-sidebar's reopen/New Session controls.
     *
     * While the seat is mounted the frame publishes
     * `--dsh-frame-leading-clearance` (the inline inset the seat's band
     * occupies, measured from the frame's left edge); a main panel whose
     * content reaches the top-left corner pads by it so nothing lands under
     * the lights or the controls.
     */
    'shell.leading': { kind: 'single'; scope: 'root' }
  }
}

// OwnerShare contracts — the render-side share the slot owner supplies at
// renderSlot. Registrants IMPORT these and compose their full component props
// from the framework-derived shares. Conversation business state and actions arrive through
// framework-standard hooks and each registrant's inject face, not owner props.

/** Sidebar owner share: live column state from the frame's concession solve. */
export interface SidebarOwnerProps {
  /** True when the sidebar is closed (the column renders the compact control rail). */
  collapsed: boolean
  /** Rendered column width in px (SIDEBAR_COLLAPSED when collapsed). */
  width: number
  /** Current user display choice; omitted by older frame callers. */
  viewMode?: ViewMode
  /** Choose phone, desktop or automatic presentation without changing pages. */
  chooseViewMode?: (mode: ViewMode) => void
}

/** Right column owner share: resolved geometry and opening eligibility. */
export interface RightbarOwnerProps {
  /** Resolved panel width in px; full frame width on phone, zero if desktop columns cannot fit. */
  width: number
  /** Current frame width in px. */
  viewportWidth: number
  /**
   * Whether the panel can open: phone overlays are available at any frame width;
   * desktop needs 300px beside a 400px center, including space released by sidebar collapse.
   */
  canShow: boolean
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme', 'locale', 'shortcuts']

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with its child-slot declarations, the layout store seat,
 * and the shared root instance supplying commands and the panel-info source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('shortcuts.layout', { zh, en }), 'layout: command labels')
  ctx.effect(() => ctx.locale.register('layout.web', { zh: webZh, en: webEn }), 'layout: host-operation messages')
  const t = ctx.locale.bind('shortcuts.layout')

  ctx.effect(() => {
    const handle = createLayoutStore()
    const instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    const retainMainPanels = (): void => {
      instance.actions.retainMainPanels(ctx.slots.entries('main').flatMap(entry =>
        entry.options.key === undefined ? [] : [entry.options.key]))
    }
    const panelInfo: HostObservable<PanelInfo> = {
      getSnapshot: () => instance.getSnapshot().panelInfo,
      subscribe: listener => instance.subscribe(listener),
    }
    const webView = new WebViewController(instance, ctx.locale.bind('layout.web'))
    const presenter = new ThemePresenter()
    const presentTheme = (): void => {
      const snapshot = ctx.theme.getTheme()
      const hostTheme = webView.getSnapshot().theme
      presenter.apply(snapshot.preference === 'system' && hostTheme !== undefined
        ? { ...snapshot, active: { ...snapshot.active, colorScheme: hostTheme } } : snapshot)
    }
    let presentedTheme = webView.getSnapshot().theme
    const offPresentationTheme = webView.subscribe(() => {
      const next = webView.getSnapshot().theme
      if (next !== presentedTheme) { presentedTheme = next; presentTheme() }
    })
    const offTheme = ctx.on('theme/change', presentTheme)
    presentTheme()
    const layout = new LayoutController(instance.actions, id =>
      ctx.slots.entries('main').some(entry => entry.options.key === id), panelInfo, webView)
    const restorePanel = webView.onRestore((state) => {
      const saved = state.layout
      if (saved === null || typeof saved !== 'object') return
      const panelId = Reflect.get(saved, 'activePanelId')
      if (panelId === null) layout.selectPanel(null)
      else {
        const entry = ctx.slots.entries('main').find(value => value.options.key === panelId)
        if (entry?.options.key !== undefined) layout.selectPanel(entry.options.key as import('./service.ts').MainPanelId)
      }
    })
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } })
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      locale: 'common',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'main': { kind: 'keyed', scope: 'root' },
        'rightbar': { kind: 'single', scope: 'root' },
        'shell.bottom': { kind: 'single', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'shell.leading': { kind: 'single', scope: 'root' },
      },
      store,
    }, AppFrame)
    const disposeShortcut = ctx.shortcuts.register({
      id: 'sidebar.left.toggle' as ShortcutCommandId, label: () => t('toggle'), aliases: ['sidebar', 'toggle left sidebar'],
      defaults: {
        'desktop:macos': { code: 'KeyB', modifiers: ['primary'] },
        'desktop:windows': { code: 'KeyB', modifiers: ['primary'] },
        'desktop:linux': { code: 'KeyB', modifiers: ['primary'] },
        'web:macos': { code: 'KeyB', modifiers: ['primary', 'alt'] },
        'web:windows': { code: 'KeyB', modifiers: ['primary', 'alt'] },
      },
      regions: ['page', 'editable'], modals: [],
      resolve: () => ({ status: 'handled', run: () => { layout.toggleSidebar() } }),
    })
    const disposePanels = ctx.slots.subscribe('main', retainMainPanels)
    retainMainPanels()
    return () => {
      disposeShortcut()
      offTheme()
      offPresentationTheme()
      presenter.dispose()
      restorePanel()
      webView.dispose()
      layout.dispose()
      disposePanels()
      disposeRegistration()
      disposePanelInfo()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-layout: service + root registration')

}
