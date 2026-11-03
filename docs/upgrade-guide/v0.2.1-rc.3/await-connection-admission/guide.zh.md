---
kind: upgrade-guide
description: Host Connection 准入方法改为返回 Promise，使应用自有认证能在请求分派前完成。
---

# 等待 Host Connection 准入

[English](guide.md) | 中文

## 变更

Host 的 `ctx.connection.requestRejection`、`admit`、`admitConnection` 和 `authorizeIndex` 返回 Promise。仍按同步方式调用会读到 Promise，而不是拒绝状态、Peer 或认证结果。这影响实现 HTTP 或 WebSocket 承载的插件；浏览器与 API 客户端继续使用原有 URL 和凭据。

应用自有的 `connection/authenticate` 监听器可以异步认证外部 Web 来源。没有监听器接管的来源仍使用原生浏览器和 API Cookie 认证。API Socket 准入仍在认证完成后原子地认领一个有效 Peer，重复认领返回 409，承载释放时撤销 API 准入。Connection 销毁后才完成的认证不能再放行请求。

## 迁移

1. 将承载处理函数改为异步，在读取结果或发送响应字节前等待每个受影响的方法：

   ```diff
   -const admission = ctx.connection.admit(request)
   +const admission = await ctx.connection.admit(request)
   ```

2. WebSocket 承载等待 `admitConnection`，而不是 `admit`；关闭连接或升级失败时，继续调用返回的 `release`。等待准入后仍须检查 Socket 是否已经关闭，避免断开的客户端继续占用 Peer。
3. 提供 HTML 前等待 `authorizeIndex`；转发其他需认证的路由前等待 `requestRejection`。测试替身也改为返回 Promise。
4. 运行现有 Connection 和承载测试。认证被拒绝时不得发送受保护内容，API Socket 清理后仍须阻止继续使用其凭据。

`createPeer`、Peer 身份、直接的 `fetch(request, peer)` 调用及已保存资料无需迁移。认证与生命周期规则见 [Connection 参考](../../../../packages/client/connection/README.zh.md#browser-authentication-and-request-trust)。
