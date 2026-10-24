---
description: "Sidebar shell plugin for the dsh web client: configurable conversation-first or panel-first navigation, New Session, and bottom-pinned Settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

English | [中文](README.zh.md)

Desktop product events use the optional [product analytics service](../product-analytics/README.md); ordinary Web interactions are excluded.

## Summary

The dsh web client sidebar defaults to conversation-first navigation. A profile can choose panel-first navigation, which puts global panels first and starts the Research assistant folded. Both policies preserve a 56px rail, bottom-pinned Settings, and idle scrollbars that do not move browser rows. New Session uses an explicitly selected Workspace, then the current Session's Workspace, then the most recently active Workspace; if none exists, it opens a blank New Session page. Deployments can replace the brand mark or name while retaining the navigation controls and rail geometry.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The sidebar is the navigation shell: users see the brand, start new sessions, collapse the rail, and reach Settings. Feature plugins fill its seats — ui-workspace fills `sidebar.workspaces`, ui-settings registers the trigger row and settings panel at `sidebar.settings`.

<a id="navigation-policy"></a>
### Navigation policy

The plugin's `navigation` Config field selects one policy for the sidebar's browser activation. It does not select the initial main panel or change the registered panel order.

| `navigation` | Global panel position | Expanded brand action on Web and Windows | Workspace and Session browser |
| --- | --- | --- | --- |
| `conversation-first` (default) | After New Session | Start a new session | Visible without a disclosure |
| `panel-first` | Before New Session | Open the first ordered panel; start a new session if none exists | Research assistant, initially folded |

For a panel-first profile, patch its existing `ui-sidebar` entry:

```yaml
- id: ui-sidebar
  config:
    navigation: panel-first
```

The Host validates this field and publishes only the selected policy in page bootstrap data. After changing the profile and allowing the Loader to apply it, reload the page to use the new policy. Unsupported values reject plugin activation; the browser also rejects malformed bootstrap data. The policy does not add a global Settings preference.

### Brand and New Session

The expanded brand row renders `sidebar.brand.mark` and `sidebar.brand.name` as independent single slots; the collapsed rail renders the same mark slot. On Web and Windows desktop, clicking the expanded brand follows the navigation policy above; hovering or focusing it shows no tooltip. Without occupants, the shell uses the fish mark and a localized local-build label. A complete build stacks a code badge below the label as `version[-commit][-dirty]`, using `DSH_CLIENT_VERSION`, the optional 7-character `DSH_CLIENT_COMMIT_HASH`, and `DSH_CLIENT_GIT_DIRTY=true`; missing version metadata omits the badge. New Session targets the explicit Workspace used by a scoped action, otherwise the current Session's Workspace, otherwise the most recently active Workspace; when none exists it clears into the blank New Session page. The expanded New Session button displays the effective binding as trailing grey text on hover or keyboard focus. While the shortcut is visible, the centered icon and label fade before it when space is narrow; CSS reserves the shortcut’s width without measuring the button. Icon-only controls retain tooltips with platform-formatted keycaps, including the resident macOS header control when the sidebar is hidden. Controls expose `aria-keyshortcuts` only for their current command.

### Global panel entries

Plugins add an icon component to the root-scoped `sidebar.panellist` list with an `id`, optional `order`, and a string or locale-aware `label`. Rows follow the configured navigation position, ordered by ascending `order` and then registration order. The same id addresses the component registered in the layout's root-scoped `main` keyed slot; selecting a missing main entry throws without changing the current selection. The label supplies plain visible text, the accessible name, and the collapsed tooltip. Expanded navigation rows have a 2px gap. Each row reads its own selected state through `usePanelInfo`; moving DOM focus to search or a directory picker does not change the displayed panel or its selected row. With no panel registrations, neither the list nor spacing for it is rendered. The shipped composition registers no example panel.

While the root-scoped `sidebar.panellist.actions` list has registrations, a **More** button styled as a panel row follows the rows inside the navigation landmark; the collapsed rail shows its label as a tooltip. It opens a menu whose rows are that list's registrations. Each receives `entries` (customizable panels in registration order with `id`, `label`, `pinned`, and `active`; Plugins is never listed), `onOpen(id)`, which selects the panel, `onPinnedChange(id, pinned)`, and `onDismiss()`, which closes the menu. The sidebar keeps one in-memory list of unpinned panel ids shared by every Session; Plugins always shows. The default More menu only offers plugin browsing and creation, without panel rows or pin controls. Pin callbacks remain available to other registrations, but choices reset when the plugin reloads and legacy localStorage values are ignored. Unpinning hides only the row; the main panel, its registration, and the current selection stay unchanged. Unregistered panel ids remain in the in-memory list until the plugin reloads.

### Research assistant

In `panel-first` mode, the expanded sidebar groups its Workspace and Session browser under a keyboard-operable Research assistant disclosure, initially closed. Folding hides the browser without unmounting it. The browser receives `wide: false` while folded so its existing search request can reveal the section through `expandSidebar`; focus entering the browser or its portalled controls also reveals it. In `conversation-first` mode, focusing the browser leaves the sidebar layout and click target unchanged. The 56px rail keeps its Workspace controls, and a request to expand the rail opens the section as well. The section state lasts for the sidebar component's lifetime and is independent from global panel selection.

### Collapse behavior

The sidebar and conversation-header toggles show the effective shortcut from the command catalog in their hover and keyboard-focus tooltips and `aria-keyshortcuts`. An unbound command shows only the action label.

The top expand button hosts the optional, non-interactive `sidebar.toggle.badge` slot while collapsed. Its occupant supplies status and tooltip content without adding another action or changing the button's navigation behavior.

During a live collapse, the expanded content fades out at its current width, the upper controls share one fade and leftward translation into the 56px rail, and the layout's column slide ends the motion. A page that starts collapsed renders the rail statically, and reduced-motion mode disables both transitions. The bottom-pinned `sidebar.settings` control shares the fade timing but has no horizontal translation.

On Windows Electron, `html[data-windows-titlebar]` fixes the sidebar toggle in the caption's top-left corner in both states, aligned with New Session's left edge only when expanded. The expanded brand sits below the caption and above New Session, with 8px of extra space above that button. Collapsing hides the brand and sidebar content and places New Session between the sidebar toggle and the Desktop-owned menus. The sidebar sets the root `--dsh-windows-menu-start` to 84px when collapsed; the Desktop preload uses it to position its menu after New Session and defaults to 48px when expanded. Caption icon buttons use centered 16px glyphs in 28px controls with the compact control radius and exclude themselves from the window drag region. The sidebar toggle and New Session bubbles open below the caption, where the Desktop-owned menu text cannot cover them; an occupying `sidebar.toggle.badge` chooses its own bubble side.

### macOS desktop

Under `html[data-platform='darwin']` (set only by the desktop preload) the expanded column opens with a 52px top strip that clears the hiddenInset traffic lights and carries the collapse toggle; the strip and the logo row below each mark themselves `data-window-drag`, so each row's own box is the window's drag region (ui-web base.css declares the one darwin drag rule), and the brand wordmark is not a New Session shortcut there — the dedicated New Session button keeps the action — and collapsing hides the column entirely instead of leaving the rail. The package registers `HeaderLeadingControls` into the frame's `shell.leading` window-chrome seat (ui-layout), which mounts it — the open-sidebar and New Session controls beside the traffic lights — only while the column is hidden, over every main panel. The [Desktop reference](../../../apps/desktop/README.md) owns window integration.

### Scrollbars

Scrollbars in the column are a pointer affordance: the shell rebinds the scrollbar indirection to `transparent` whenever the pointer is outside the column and keeps the thumb drawn for 2s after the pointer leaves, so a list nobody is pointing at carries no bar. The reservation that keeps rows from moving belongs to the scrolling region (ui-workspace), so revealing a thumb never reflows.

### Click analytics

On Desktop, the official navigation controls report `sidebar_menu_click` with `menu_name` and `position` before they act. Without the analytics service, the controls only navigate. Selecting a panel by other means reports nothing, and the sidebar reports no exposure events.

- The expanded brand reports `menu_name=new_session` only when it starts a session; opening the panel-first home reports no session event. The New Session button reports `menu_name=new_session` with `position=sidebar`. While the Windows caption hosts the collapsed New Session button, that button reports `position=titlebar`; the macOS New Session control beside the traffic lights also reports `position=titlebar`.
- The **Plugins** and **Automation tasks** rows report `menu_name=plugin` and `menu_name=cron` with `position=sidebar`. Other panel rows report nothing.
- Each **More** button click reports `menu_name=more` with `position=sidebar`, whether it opens or closes the menu.
- A third-party More menu row that calls `onOpen(id)` for Plugins or Automation tasks reports `menu_name=plugin` or `menu_name=cron` with `position=sidebar_more`. The shipped More menu only browses and creates plugins, so it never calls `onOpen`. The report precedes the registration check, so a request for a panel that has unregistered still counts although nothing is selected.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The shell is pure composition: `SidebarRootComponentProps` composes the layout owner share, the global `useSessions` and `useWorkspaces` hooks, the declared brand, the `sidebar.workspaces` and `sidebar.settings` child slots, and injected navigation callbacks. The sidebar owns `sidebar.panellist` and renders each panel's registered icon directly. Panel metadata is derived from list registrations and locale changes; selection belongs to the layout store. The injected `trackEntryClick(attributes)` forwards to `ctx.get('productAnalytics')?.track('sidebar_menu_click', attributes)`, and `selectPanel` only selects, so each control supplies its own entry and position.

### Slot discipline

Declaration-aware `slots.inject()` lets a replacing package activate before or after the sidebar. The foot is the `sidebar.settings` seat: the sidebar renders only the bottom-pinned layout slot and shares its column state (`wide`). The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; SidebarRoot, the row components, and the tree derivation remain package-internal behind the slot registration.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the surfaces that fill the shell's seats and the composition model.

- [ui-workspace](../ui-workspace/README.md) — the Workspace and Session browser rendered into `sidebar.workspaces`.
- [ui-settings](../ui-settings/README.md) — the settings domain base registering the trigger row at `sidebar.settings`.
- [ui-layout](../ui-layout/README.md) — the layout owner whose rail and column state the collapse uses.
- [ui-theme](../ui-theme/README.md) — the scrollbar token indirection the shell rebinds.
- [Slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — the composition model behind the seats.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the shell owns versus what its occupants own; they are current package constraints.

- **Session state-dot rendering is owned by ui-workspace** — no done/error notification sources are available to this shell.
- **Workspace browser behavior is composition-owned** — grouping, ordering, search, and row state belong to ui-workspace, not this shell.
- **"New task completed" unread marking is local viewing state** — completion-time > last-seen never reaches the host.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
