import { Context } from '@deepseek-ai/cordis'
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LocalSubprocessRuntime from '../src/index.ts'

const probes = vi.hoisted(() => ({ bootstrap: vi.fn(), manager: vi.fn(), windows: vi.fn(), launch: vi.fn(), fallback: vi.fn() }))
vi.mock('../src/linux-scope.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/linux-scope.ts')>(),
  probeLinuxBootstrap: probes.bootstrap,
  probeLinuxManagerAsync: probes.manager,
  launchLinuxScope: probes.launch,
}))
vi.mock('../src/windows-job.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/windows-job.ts')>(), probeWindowsJob: probes.windows, launchWindowsJob: probes.launch,
}))
vi.mock('../src/spawn.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/spawn.ts')>(), spawnSubprocess: probes.fallback,
}))

afterEach(() => { vi.resetAllMocks() })

function request(signal?: AbortSignal): SubprocessSpawnSpec {
  return { argv: [process.execPath, '-e', ''], cwd: process.cwd(), graceMs: 10, signal,
    stdio: { stdin: { data: 'input' }, stdout: { maxBytes: 1000 }, stderr: { maxBytes: 1000 } } }
}

function launch() {
  const stdout = new PassThrough(), stderr = new PassThrough()
  const direct = Promise.withResolvers<{ exitCode: number; signal: null }>()
  const stopped = Promise.withResolvers<undefined>()
  const stop = () => { stdout.end(); stderr.end(); direct.resolve({ exitCode: 0, signal: null }); stopped.resolve(undefined) }
  return { stdin: new PassThrough(), stdout, stderr, direct: direct.promise,
    owner: { signal: vi.fn(stop), terminateForHostExit: vi.fn(stop), waitForExit: () => stopped.promise }, stop }
}

function fallbackHandle(): SubprocessHandle & { terminateForHostExit(): void } {
  return { stdin: undefined, stdout: undefined, stderr: undefined, control: undefined,
    collected: {}, done: Promise.resolve({ exitCode: 0, signal: null }),
    terminate: vi.fn(), terminateForHostExit: vi.fn(), waitForExit: async () => true }
}

describe('awaited ordinary allocation', () => {
  it('waits for Linux manager checks without blocking or starting targets early', async () => {
    const check = Promise.withResolvers<boolean>()
    probes.bootstrap.mockReturnValue(true)
    probes.manager.mockReturnValue(check.promise)
    const targets = [launch(), launch()]
    probes.launch.mockReturnValueOnce(targets[0]).mockReturnValueOnce(targets[1])
    const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
    const runtime = ctx.subprocess as LocalSubprocessRuntime
    runtime.internals.platform = 'linux'
    try {
      const first = runtime.spawnAsync(request()), second = runtime.spawnAsync(request())
      await new Promise<void>((resolve) => { setImmediate(resolve) })
      expect(probes.manager).toHaveBeenCalledTimes(2)
      expect(probes.launch).not.toHaveBeenCalled()
      check.resolve(true)
      const handles = await Promise.all([first, second])
      expect(probes.launch).toHaveBeenCalledTimes(2)
      targets.forEach(target => target.stop())
      await Promise.all(handles.map(handle => handle.done))
      await Promise.all(handles.map(handle => handle.waitForExit()))
    } finally { check.resolve(false); targets.forEach(target => target.stop()); await fiber.dispose() }
  })

  it('cancels one waiting allocation without cancelling another request', async () => {
    const check = Promise.withResolvers<boolean>(), controller = new AbortController()
    probes.bootstrap.mockReturnValue(true)
    probes.manager.mockReturnValue(check.promise)
    const target = launch()
    probes.launch.mockReturnValue(target)
    const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
    const runtime = ctx.subprocess as LocalSubprocessRuntime
    runtime.internals.platform = 'linux'
    try {
      const rejected = expect(runtime.spawnAsync(request(controller.signal))).rejects.toThrow('cancel one')
      const second = runtime.spawnAsync(request())
      controller.abort(new Error('cancel one'))
      check.resolve(true)
      await rejected
      const handle = await second
      expect(probes.launch).toHaveBeenCalledOnce()
      target.stop()
      await handle.done
    } finally { check.resolve(false); target.stop(); await fiber.dispose() }
  })

  it('joins pending allocation before provider disposal completes and starts no late target', async () => {
    const check = Promise.withResolvers<boolean>()
    let probeSignal: AbortSignal | undefined
    probes.bootstrap.mockReturnValue(true)
    probes.manager.mockImplementation((_deep: boolean, signal: AbortSignal) => { probeSignal = signal; return check.promise })
    const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
    const runtime = ctx.subprocess as LocalSubprocessRuntime
    runtime.internals.platform = 'linux'
    const rejected = expect(runtime.spawnAsync(request())).rejects.toThrow('stopping')
    let disposed = false
    const disposal = fiber.dispose().then(() => { disposed = true })
    try {
      await new Promise<void>((resolve) => { setImmediate(resolve) })
      expect(probeSignal?.aborted).toBe(true)
      expect(disposed).toBe(false)
      check.resolve(true)
      await rejected
      await disposal
      expect(probes.launch).not.toHaveBeenCalled()
    } finally { check.resolve(false); await Promise.allSettled([rejected, disposal]) }
  })

  it.each(['win32', 'linux', 'darwin'] as const)('preserves warned fallback selection on %s when native ownership is unavailable', async (platform) => {
    probes.bootstrap.mockReturnValue(false)
    probes.windows.mockReturnValue(false)
    const handle = fallbackHandle()
    probes.fallback.mockReturnValue(handle)
    const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
    const runtime = ctx.subprocess as LocalSubprocessRuntime
    runtime.internals.platform = platform
    try {
      expect(await runtime.spawnAsync(request())).toBe(handle)
      expect(probes.launch).not.toHaveBeenCalled()
    } finally { await fiber.dispose() }
  })

  it('retains the Linux positive bootstrap cache but rechecks manager availability on each allocation', async () => {
    probes.bootstrap.mockReturnValue(true)
    probes.manager.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const target = launch(), fallback = fallbackHandle()
    probes.launch.mockReturnValue(target)
    probes.fallback.mockReturnValue(fallback)
    const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
    const runtime = ctx.subprocess as LocalSubprocessRuntime
    runtime.internals.platform = 'linux'
    try {
      const handle = await runtime.spawnAsync(request())
      target.stop()
      await handle.done
      expect(await runtime.spawnAsync(request())).toBe(fallback)
      expect(probes.bootstrap).toHaveBeenCalledOnce()
      expect(probes.manager.mock.calls.map(call => call[0])).toEqual([true, false])
    } finally { target.stop(); await fiber.dispose() }
  })

  it('uses the Windows Job owner without another runner and retains the base synchronous-provider adapter', async () => {
    probes.windows.mockReturnValue(true)
    const target = launch()
    probes.launch.mockReturnValue(target)
    const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
    const runtime = ctx.subprocess as LocalSubprocessRuntime
    runtime.internals.platform = 'win32'
    try {
      const handle = await runtime.spawnAsync(request())
      expect(probes.windows).toHaveBeenCalledOnce()
      const legacy = vi.spyOn(runtime, 'spawn').mockReturnValue(handle)
      expect(await SubprocessRuntime.prototype.spawnAsync.call(runtime, request())).toBe(handle)
      expect(legacy).toHaveBeenCalledOnce()
      target.stop()
      await handle.done
    } finally { target.stop(); await fiber.dispose() }
  })

  it('rejects invalid and pre-cancelled requests before probing', async () => {
    const ctx = new Context(), fiber = await ctx.plugin(LocalSubprocessRuntime)
    try {
      await expect(ctx.subprocess.spawnAsync({ ...request(), argv: [] })).rejects.toThrow()
      await expect(ctx.subprocess.spawnAsync(request(AbortSignal.abort(new Error('already cancelled'))))).rejects.toThrow('already cancelled')
      expect(probes.bootstrap).not.toHaveBeenCalled()
    } finally { await fiber.dispose() }
  })
})
