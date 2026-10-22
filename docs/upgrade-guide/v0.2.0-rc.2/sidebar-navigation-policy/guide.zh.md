---
kind: upgrade-guide
description: "侧栏默认采用会话优先导航；需要面板优先的部署必须显式选择策略。"
---

# 显式选择面板优先的侧栏导航

[English](guide.md) | 中文

## 变更

此前，这个 fork 的侧栏把全局面板放在新建会话之前，点击展开态品牌会打开排序第一的面板，并让研究助手初始收起。现在，`ui-sidebar` 插件默认采用上游的会话优先行为：新建会话位于面板之前，Web 和 Windows 上的品牌点击会新建会话，Workspace 与 Session 浏览器直接显示，没有折叠控件。原有的面板优先行为仍可通过一个插件配置值启用。macOS 窗口控件、Settings、插件管理及已注册面板的排序保持不变。

## 迁移

1. 需要保留面板优先导航时，在相应 profile 的 `cordis.patch.yml` 中添加以下配置行：

   ```yaml
   - id: ui-sidebar
     config:
       navigation: panel-first
   ```

2. 等待 Loader 应用配置，然后刷新页面。确认面板位于新建会话之前，Web 或 Windows 上的展开态品牌会打开排序第一的面板，且研究助手初始收起。没有全局面板时，品牌仍会新建会话。
3. 省略 `navigation` 或选择 `conversation-first` 即可使用默认布局。这两个值都不选择初始主面板；该行为仍由对应功能负责。详见[侧栏配置](../../../../packages/client/ui-sidebar/README.zh.md#navigation-policy)。
