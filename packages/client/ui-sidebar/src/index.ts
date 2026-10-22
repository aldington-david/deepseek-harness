/** Host configuration and page bootstrap for sidebar navigation. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { type Config, NAVIGATION_CONFIG_GLOBAL } from './navigation-config.ts'

export { Config } from './navigation-config.ts'

/**
 * Publish the navigation policy before browser plugins activate.
 * @param ctx - Host context collecting the page's initialization data.
 * @param config - Plugin options with schema defaults applied by the Loader.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: NAVIGATION_CONFIG_GLOBAL, value: { navigation: config.navigation } })
  })
}
