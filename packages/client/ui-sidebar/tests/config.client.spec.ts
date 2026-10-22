/** Sidebar Host policy through the profile Loader and public page bootstrap. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as hostPlugin from '../src/index.ts'

function collect(ctx: Context): IndexInjection[] {
  const rows: IndexInjection[] = []
  ctx.emit('webserver/index-inject', rows)
  return rows
}

async function configuredHost(config?: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-sidebar-policy-'))
  const ctx = new Context()
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  const path = join(directory, 'cordis.yml')
  await writeFile(path, JSON.stringify([{ id: 'ui-sidebar', name: 'cordis:sidebar', config }]))
  await ctx.plugin(Loader).await()
  ctx.loader.builtins['sidebar'] = hostPlugin
  ctx.loader.builtins['include'] = Include
  await ctx.loader.create({
    name: 'cordis:include', config: { path: pathToFileURL(path).href },
  })
  await ctx.loader.await()
  return ctx
}

describe('sidebar navigation configuration', () => {
  it('keeps the named Config available through Loader import', async () => {
    const ctx = await configuredHost()
    expect('default' in hostPlugin).toBe(false)
    expect(ctx.loader.unwrapExports(hostPlugin)).toBe(hostPlugin)
  })

  it.each([
    [undefined, 'conversation-first'],
    [{ navigation: 'panel-first' }, 'panel-first'],
  ])('publishes the configured policy from a Loader composition: %j', async (config, navigation) => {
    const ctx = await configuredHost(config)
    expect(collect(ctx)).toEqual([
      { kind: 'global', name: '__DSH_SIDEBAR_NAVIGATION__', value: { navigation } },
    ])
    await ctx.fiber.dispose()
    expect(collect(ctx)).toEqual([])
  })

  it('publishes no policy when the Loader rejects an unknown value', async () => {
    const ctx = await configuredHost({ navigation: 'investment' })
    expect(collect(ctx)).toEqual([])
    expect(hostPlugin.Config['~standard'].validate({ navigation: 'investment' })).toHaveProperty('issues')
  })

  it('replaces and withdraws the policy with its Loader entry', async () => {
    const ctx = await configuredHost()
    const entry = [...ctx.loader.entries()].find(row => row.options.id === 'ui-sidebar')!
    await entry.update({ config: { navigation: 'panel-first' } })
    await ctx.loader.await()
    expect(collect(ctx)).toEqual([
      { kind: 'global', name: '__DSH_SIDEBAR_NAVIGATION__', value: { navigation: 'panel-first' } },
    ])
    await entry.update({ disabled: true })
    await ctx.loader.await()
    expect(collect(ctx)).toEqual([])
    await entry.update({ disabled: false })
    await ctx.loader.await()
    expect(collect(ctx)).toEqual([
      { kind: 'global', name: '__DSH_SIDEBAR_NAVIGATION__', value: { navigation: 'panel-first' } },
    ])
  })
})
