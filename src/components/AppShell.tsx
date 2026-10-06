import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BookUser,
  ChartColumn,
  Ellipsis,
  House,
  LogOut,
  Receipt,
  Settings,
  Tag,
  Truck,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../data/auth'
import { IS_DEMO } from '../data/backend'
import { useBooks } from '../data/queries'
import { t } from '../lib/i18n'
import { LangSwitch } from './Lang'

type NavItem = { to: string; label: string; Icon: LucideIcon; end?: boolean }

// Built on each render, so the labels follow the chosen language.
const mainNav = (): NavItem[] => [
  { to: '/', label: t('Home'), Icon: House, end: true },
  { to: '/challans', label: t('Challans'), Icon: Truck },
  { to: '/sales', label: t('Sales'), Icon: Tag },
  { to: '/ledgers', label: t('Ledgers'), Icon: BookUser },
]

const moreNav = (): NavItem[] => [
  { to: '/money', label: t('Cash & bank'), Icon: Wallet },
  { to: '/expenses', label: t('Expenses'), Icon: Receipt },
  { to: '/report', label: t('Monthly report'), Icon: ChartColumn },
  { to: '/settings', label: t('Settings'), Icon: Settings },
]

/** Pages reached from the More tab still light it up on a phone. */
const UNDER_MORE = ['/more', '/money', '/expenses', '/report', '/settings']

export default function AppShell() {
  const { user, signOut } = useAuth()
  const { view } = useBooks()
  const name = view?.book.settings.business_name ?? ''
  const more = moreNav()

  return (
    <div className="min-h-dvh lg:flex">
      {IS_DEMO ? (
        <div className="fixed inset-x-0 top-0 z-40 h-6 bg-owed text-center text-[11px] leading-6 font-semibold tracking-wide text-paper uppercase">
          {t('Demo · records stay in this browser')}
        </div>
      ) : null}

      {/* Sidebar, on a big screen */}
      <aside
        className={`sticky hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-paper px-4 py-6 lg:flex ${IS_DEMO ? 'top-6 h-[calc(100dvh-1.5rem)]' : 'top-0'}`}
      >
        <div className="truncate px-2 font-display text-lg font-bold" title={name}>
          {name || ' '}
        </div>
        <LangSwitch className="mx-2 mt-3 self-start" />
        <nav className="mt-6 flex flex-col gap-1">
          {[...mainNav(), ...more.slice(0, 3)].map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-line-soft pt-4">
          <SideLink item={more[3]} />
          {!IS_DEMO && user ? (
            <>
              <div className="truncate px-3 pt-1 text-xs text-ink-faint">{user.email}</div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-soft transition hover:bg-sunk hover:text-ink"
              >
                <LogOut className="h-[18px] w-[18px]" aria-hidden />
                {t('Sign out')}
              </button>
            </>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Header, on a phone */}
        <header
          className={`sticky z-30 flex items-center justify-between gap-2 border-b border-line bg-ground/95 px-4 py-2.5 backdrop-blur lg:hidden ${IS_DEMO ? 'top-6' : 'top-0'}`}
        >
          <div className="min-w-0 truncate font-display text-base font-bold">{name || ' '}</div>
          <div className="flex shrink-0 items-center gap-1">
            <LangSwitch />
            <NavLink
              to="/settings"
              aria-label={t('Settings')}
              className="-mr-2 rounded-lg p-2 text-ink-soft transition hover:bg-sunk"
            >
              <Settings className="h-5 w-5" aria-hidden />
            </NavLink>
          </div>
        </header>

        <main
          className={`mx-auto w-full max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-12 ${IS_DEMO ? 'pt-5 lg:pt-12' : 'pt-5 lg:pt-8'}`}
        >
          <Outlet />
        </main>
      </div>

      {/* Tabs, on a phone */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg">
          {[...mainNav(), { to: '/more', label: t('More'), Icon: Ellipsis }].map((item) => (
            <TabLink key={item.to} item={item} />
          ))}
        </div>
      </nav>
    </div>
  )
}

function SideLink({ item: { to, label, Icon, end } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          isActive ? 'bg-brand-wash text-brand-deep' : 'text-ink-soft hover:bg-sunk hover:text-ink'
        }`
      }
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
    </NavLink>
  )
}

function TabLink({ item: { to, label, Icon, end } }: { item: NavItem }) {
  const { pathname } = useLocation()
  const underMore = to === '/more' && UNDER_MORE.some((p) => pathname.startsWith(p))
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
          isActive || underMore ? 'text-brand-deep' : 'text-ink-faint'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`rounded-full px-4 py-1 transition ${isActive || underMore ? 'bg-brand-wash' : ''}`}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}

/** The More tab on a phone: the pages that do not fit in the tab bar. */
export function MorePage() {
  const { user, signOut } = useAuth()
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">{t('More')}</h1>
      <div className="card divide-y divide-line-soft overflow-hidden">
        {moreNav().map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="flex items-center gap-3 px-4 py-3.5 font-medium transition hover:bg-sunk/60">
            <Icon className="h-5 w-5 text-ink-soft" aria-hidden />
            {label}
          </NavLink>
        ))}
      </div>
      {!IS_DEMO && user ? (
        <div className="card flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 truncate text-sm text-ink-soft">{user.email}</div>
          <button type="button" className="btn-ghost" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" aria-hidden />
            {t('Sign out')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
