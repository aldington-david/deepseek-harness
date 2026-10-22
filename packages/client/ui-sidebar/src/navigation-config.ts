/** Public navigation policy shared by the Host and Client halves. */
import z from '@deepseek-ai/schemastery'

/** Sidebar navigation options after schema defaults are applied. */
export interface Config {
  /** Prioritize conversations, or panels with an initially folded research assistant. */
  navigation: 'conversation-first' | 'panel-first'
}

/** Validate profile options and the public page-bootstrap payload. */
export const Config: z<Partial<Config>, Config> = z.object({
  navigation: z.union(['conversation-first', 'panel-first']).default('conversation-first'),
})

/** Page-global key carrying only the public navigation policy. */
export const NAVIGATION_CONFIG_GLOBAL = '__DSH_SIDEBAR_NAVIGATION__'
