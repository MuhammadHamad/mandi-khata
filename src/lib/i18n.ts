/**
 * English and Roman Urdu. Every word on screen goes through t(), keyed by its
 * English text; src/lib/ur.ts holds the Roman Urdu. Roman Urdu is the
 * default, since most mandi owners read it more easily than English, and
 * each phone remembers its own choice.
 *
 * `npm run check:i18n` fails when a phrase given to t() has no Roman Urdu,
 * when the two disagree on their {placeholders}, or when the dictionary keeps
 * a line nothing uses.
 */
import { UR } from './ur'

export type Lang = 'en' | 'ur'

const KEY = 'mandi-app:lang'

function saved(): Lang {
  try {
    const value = globalThis.localStorage?.getItem(KEY)
    if (value === 'en' || value === 'ur') return value
  } catch {
    // Storage blocked: the default it is.
  }
  return 'ur'
}

let current: Lang = saved()

export function lang(): Lang {
  return current
}

/** Changes every later t(). The screen picks it up by re-rendering from the top (src/components/Lang.tsx). */
export function setLang(next: Lang): void {
  current = next
  try {
    globalThis.localStorage?.setItem(KEY, next)
  } catch {
    // Not remembered, but used for this visit.
  }
}

/** The text in the chosen language, with `{name}` placeholders filled from `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const template = current === 'ur' ? (UR[text] ?? text) : text
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}
