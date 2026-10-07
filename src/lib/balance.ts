import type { Tone } from '../components/ui'
import { t } from './i18n'
import type { PartyKind } from './types'

/** What a balance means, in words: "owes you", "you owe", "advance", "settled". */
export function balanceWord(kind: PartyKind, balance: number): string {
  if (Math.abs(balance) < 0.5) return t('Settled')
  if (kind === 'customer') return balance > 0 ? t('Owes you') : t('Paid in advance')
  return balance > 0 ? t('You owe') : t('You paid in advance')
}

/** Money coming to you is green; money you owe is amber; an advance is blue; settled is plain. */
export function balanceTone(kind: PartyKind, balance: number): Tone {
  if (Math.abs(balance) < 0.5) return 'neutral'
  if (balance < 0) return 'bank'
  return kind === 'customer' ? 'good' : 'owed'
}

/** Text in a tone's colour, for a word that carries it on its own. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink-soft',
  brand: 'text-brand-deep',
  good: 'text-good',
  bad: 'text-bad',
  owed: 'text-owed',
  bank: 'text-bank',
}
