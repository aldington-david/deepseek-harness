---
kind: upgrade-guide
description: "Sidebar navigation defaults to conversation-first; panel-first deployments must select their policy explicitly."
---

# Select panel-first sidebar navigation explicitly

English | [中文](guide.zh.md)

## Change

This fork's sidebar previously put global panels before New Session, used the expanded brand to open the first ordered panel, and initially folded the Research assistant. The `ui-sidebar` plugin now defaults to upstream conversation-first behavior: New Session precedes panels, the brand starts a new session on Web and Windows, and the Workspace and Session browser stays visible without a disclosure. The existing panel-first behavior remains available as one plugin configuration value. macOS window controls, Settings, plugin management, and registered panel ordering are unchanged.

## Migration

1. To retain panel-first navigation, add this row to the affected profile's `cordis.patch.yml`:

   ```yaml
   - id: ui-sidebar
     config:
       navigation: panel-first
   ```

2. Allow the Loader to apply the configuration, then reload the page. Confirm panels appear before New Session, the expanded brand opens the first ordered panel on Web or Windows, and Research assistant begins folded. With no global panel, the brand still starts a new session.
3. Omit `navigation` or select `conversation-first` for the default layout. Neither value selects the initial main panel; that remains the owning feature's responsibility. See the [sidebar configuration](../../../../packages/client/ui-sidebar/README.md#navigation-policy).
