import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JsonStorageBackend } from '../src/index.ts'

const state = vi.hoisted(() => ({
  failures: [] as string[],
  attempts: [] as { temp: string; target: string; content: string; previous: string }[],
  tempOpens: 0,
  tempSyncs: 0,
  firstFailure: undefined as (() => void) | undefined,
  releaseReplacement: undefined as Promise<void> | undefined,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      if (args[1] === 'wx') {
        state.tempOpens += 1
        const sync = handle.sync.bind(handle)
        handle.sync = async () => { state.tempSyncs += 1; await sync() }
      }
      return handle
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (state.failures.length || state.firstFailure) {
        state.attempts.push({ temp: String(args[0]), target: String(args[1]),
          content: await actual.readFile(args[0], 'utf8'), previous: await actual.readFile(args[1], 'utf8') })
        const code = state.failures.shift()
        if (code) {
          state.firstFailure?.()
          throw Object.assign(new Error(`${code}: controlled replacement interference`), { code })
        }
        await state.releaseReplacement
      }
      return actual.rename(...args)
    },
  }
})

const roots: string[] = []
const backends: JsonStorageBackend[] = []

afterEach(async () => {
  await Promise.all(backends.splice(0).map(backend => backend.close()))
  vi.restoreAllMocks()
  state.failures.length = 0
  state.attempts.length = 0
  state.tempOpens = 0
  state.tempSyncs = 0
  state.firstFailure = undefined
  state.releaseReplacement = undefined
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function opened(layout: 'single' | 'per-record') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-json-rename-'))
  roots.push(root)
  const backend = new JsonStorageBackend(root)
  backends.push(backend)
  const unit = await backend.kv.open({ name: 'retry', version: 1, tables: ['t'], hasGlobal: false, layout })
  await unit.putRecord('t', 'k', { value: 'committed' })
  const target = layout === 'single' ? join(root, 'retry.json') : join(root, 'retry', 't', 'k.json')
  state.tempOpens = 0
  state.tempSyncs = 0
  return { unit, target, previous: await readFile(target, 'utf8') }
}

describe('JSON atomic replacement retries', () => {
  it.each(['single', 'per-record'] as const)('keeps the synced temporary file and drains %s writes through transient Windows failures', async (layout) => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const { unit, target, previous } = await opened(layout)
    const firstFailure = Promise.withResolvers<undefined>()
    const replacementAllowed = Promise.withResolvers<undefined>()
    state.firstFailure = () => { firstFailure.resolve(undefined) }
    state.releaseReplacement = replacementAllowed.promise
    state.failures.push('EPERM', 'EACCES', 'EBUSY')
    const published = unit.putRecord('t', 'k', { value: 'replacement' })
    const settled = published.then(() => null, (error: unknown) => error)
    await firstFailure.promise
    let closed = false
    const closing = unit.close().then(() => { closed = true })
    try {
      expect(closed).toBe(false)
      expect(await readFile(target, 'utf8')).toBe(previous)
      expect(closed).toBe(false)
    } finally {
      replacementAllowed.resolve(undefined)
    }
    expect(await settled).toBeNull()
    await closing
    expect(closed).toBe(true)
    expect(state.attempts).toHaveLength(4)
    expect(new Set(state.attempts.map(attempt => attempt.temp)).size).toBe(1)
    expect(state.attempts.every(attempt => attempt.target === target && attempt.previous === previous)).toBe(true)
    expect(state.tempOpens).toBe(1)
    expect(state.tempSyncs).toBe(1)
    expect(await readFile(target, 'utf8')).toBe(state.attempts[0]?.content)
    expect((await readdir(dirname(target))).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('preserves the committed disk and memory state when Windows replacement remains denied', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const { unit, target, previous } = await opened('single')
    state.failures.push(...Array.from({ length: 9 }, () => 'EPERM'))
    await expect(unit.putRecord('t', 'k', { value: 'rejected' })).rejects.toMatchObject({ code: 'EPERM' })
    expect(state.attempts).toHaveLength(9)
    expect(await readFile(target, 'utf8')).toBe(previous)
    expect((await unit.loadAll()).tables['t']).toEqual({ k: { value: 'committed' } })
    expect((await readdir(dirname(target))).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
})
