---
kind: upgrade-guide
description: "This investment fork removes Desktop application self-updates while preserving plugin updates."
---

# Desktop application updates are maintained manually

English | [中文](guide.zh.md)

## Change

This investment fork removes Desktop's application update checks, download/install actions, mandatory-update policy, update menu and `dshDesktop.updates` preload capability. Packaged and development builds ignore runtime update settings and embedded update-policy metadata. The shared Plugin Manager and installed-plugin updates remain available.

## Migration

1. Maintain application releases from this fork and replace the shell with its matching bundled runtime. Do not rely on an upstream application update feed to distribute these changes.
2. Remove any integration that calls `dshDesktop.updates`. Application configuration cannot restore that capability; plugin operations continue through the shared authenticated Plugin Manager.
3. Confirm the application menu contains no update command and startup, focus and resume do not request an application update. Run the focused tests documented in [Desktop updates](../../../../apps/desktop/README.md#updates).
