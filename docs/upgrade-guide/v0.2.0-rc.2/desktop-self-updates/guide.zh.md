---
kind: upgrade-guide
description: "这个个人投资系统 fork 移除了 Desktop 应用自更新，同时保留插件更新。"
---

# Desktop 应用版本改由维护者手动更新

[English](guide.md) | 中文

## 变更

这个个人投资系统 fork 移除了 Desktop 的应用更新检查、下载安装操作、强制更新策略、更新菜单及 `dshDesktop.updates` preload 能力。打包版和开发版均忽略运行时更新配置和内嵌更新策略元数据。共享 Plugin Manager 及已安装插件更新继续可用。

## 迁移

1. 从本 fork 维护应用版本，同时替换壳与匹配的内置运行时。不要依赖上游应用更新源分发这些修改。
2. 移除调用 `dshDesktop.updates` 的集成。应用配置无法重新开启该能力；插件操作继续通过共享的认证 Plugin Manager 执行。
3. 确认应用菜单没有更新命令，启动、获得焦点和系统唤醒均不请求应用更新。运行 [Desktop 更新说明](../../../../apps/desktop/README.zh.md#updates)中的定向测试。
