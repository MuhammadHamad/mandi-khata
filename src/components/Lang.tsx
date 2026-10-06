import { Fragment, createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { lang, setLang, t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

const LangContext = createContext<{ lang: Lang; change: (next: Lang) => void }>({
  lang: 'ur',
  change: () => {},
})

/**
 * Holds the chosen language. A change remounts everything inside, so every
 * word on screen, including words worked into figures (a ledger's "Bikri #12"),
 * is redone at once. The loaded books stay cached outside it.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Lang>(lang())
  useEffect(() => {
    document.documentElement.lang = value === 'ur' ? 'ur-Latn' : 'en'
  }, [value])
  const change = (next: Lang) => {
    setLang(next)
    setValue(next)
  }
  return (
    <LangContext value={{ lang: value, change }}>
      <Fragment key={value}>{children}</Fragment>
    </LangContext>
  )
}

/**
 * Urdu or English, one tap. The two names never change language, so anyone
 * can find their way back.
 */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang: current, change } = useContext(LangContext)
  return (
    <div
      role="group"
      aria-label={t('Language')}
      className={`inline-flex shrink-0 rounded-full border border-line bg-sunk p-0.5 text-sm font-semibold ${className}`}
    >
      {(['ur', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={current === l}
          onClick={() => change(l)}
          className={`rounded-full px-3 py-1 transition ${current === l ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
        >
          {l === 'ur' ? 'Urdu' : 'English'}
        </button>
      ))}
    </div>
  )
}
