---
kind: upgrade-guide
description: Host Connection admission methods return promises so application-owned authentication can finish before dispatch.
---

# Await Host Connection admission

English | [中文](guide.zh.md)

## Change

Host `ctx.connection.requestRejection`, `admit`, `admitConnection`, and `authorizeIndex` return promises. A synchronous caller otherwise reads a Promise instead of the rejection, Peer, or authorization result. This affects plugins implementing HTTP or WebSocket carriers; browser and API clients keep their existing URLs and credentials.

Application-owned `connection/authenticate` listeners can authorize an external Web origin asynchronously. Unhandled origins keep native browser and API cookie authentication. API socket admission still claims one live Peer atomically after authentication, rejects duplicate ownership with 409, and removes API admission when its carrier releases it. An authenticator that completes after Connection disposal cannot admit a request.

## Migration

1. Mark carrier handlers asynchronous and await each affected method before reading its result or sending response bytes:

   ```diff
   -const admission = ctx.connection.admit(request)
   +const admission = await ctx.connection.admit(request)
   ```

2. WebSocket carriers await `admitConnection`, not `admit`, and keep calling the returned `release` on closure or failed upgrade. Preserve a closed-socket check after awaited admission so a disconnected client cannot retain its Peer.
3. Await `authorizeIndex` before serving HTML and `requestRejection` before forwarding another authenticated route. Update test doubles to return promises as well.
4. Run the existing Connection and carrier tests. Refused authentication must send no protected content, and API socket cleanup must still prevent later use of its credential.

`createPeer`, Peer identity, direct `fetch(request, peer)` calls, and saved data require no migration. See the [Connection reference](../../../../packages/client/connection/README.md#browser-authentication-and-request-trust) for authentication and lifetime rules.
