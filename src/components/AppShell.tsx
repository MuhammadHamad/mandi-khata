import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BookUser,
  ChartColumn,
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
import { keepStorage } from '../lib/pwa'
import { LangSwitch } from './Lang'
import { OfflineStrip, OnlineDot, OnlineLine, SyncSheet, UpdatePrompt } from './Status'

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
  { to: '/reports', label: t('Reports'), Icon: ChartColumn },
  { to: '/settings', label: t('Settings'), Icon: Settings },
]

/** Long forms take the whole phone screen, with their Save button pinned where the tabs were. */
const isFormPage = (pathname: string) => /\/(new|edit)$/.test(pathname)

function Brand({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="relative shrink-0">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <OnlineDot />
      </span>
      <span className="truncate text-[17px] font-semibold tracking-tight">{name || ' '}</span>
      {IS_DEMO ? (
        <span
          title={t('Demo · records stay in this browser')}
          className="shrink-0 rounded-full bg-owed-wash px-2 py-0.5 text-[11px] font-semibold text-owed"
        >
          Demo
        </span>
      ) : null}
    </div>
  )
}

export default function AppShell() {
  const { user, signOut } = useAuth()
  const { view } = useBooks()
  const { pathname } = useLocation()
  const name = view?.book.settings.business_name ?? ''
  const loaded = view !== null
  useEffect(() => {
    if (loaded) void keepStorage()
  }, [loaded])
  const more = moreNav()
  const formPage = isFormPage(pathname)

  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar, on a big screen */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line-soft bg-paper px-4 py-5 lg:flex">
        <div className="px-2">
          <Brand name={name} />
        </div>
        <LangSwitch className="mx-2 mt-4 self-start" />
        <div className="mt-3">
          <OnlineLine />
        </div>
        <nav className="mt-5 flex flex-col gap-0.5">
          {[...mainNav(), ...more.slice(0, 3)].map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="mt-auto space-y-0.5 border-t border-line-soft pt-4">
          <SideLink item={more[3]} />
          {!IS_DEMO && user ? (
            <>
              <div className="truncate px-3 pt-2 pb-1 text-xs text-ink-faint">{user.email}</div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-sunk hover:text-ink"
              >
                <LogOut className="h-[18px] w-[18px]" aria-hidden />
                {t('Sign out')}
              </button>
            </>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30">
          {/* Header, on a phone */}
          <header className="flex h-14 items-center justify-between gap-3 border-b border-line-soft bg-ground/90 px-4 backdrop-blur lg:hidden">
            <Brand name={name} />
            <div className="flex shrink-0 items-center gap-1.5">
              <LangSwitch />
              <SettingsButton />
            </div>
          </header>
          <OfflineStrip />
        </div>

        <main
          className={`mx-auto w-full max-w-4xl px-4 pt-5 sm:px-6 lg:pt-8 ${
            formPage ? 'pb-0 lg:pb-12' : 'pb-[calc(6.75rem+env(safe-area-inset-bottom))] lg:pb-12'
          }`}
        >
          <Outlet />
        </main>
      </div>

      <UpdatePrompt />
      <SyncSheet />

      {/* Tabs, on a phone: every part of the app in two rows, so nothing waits behind a menu */}
      {formPage ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-4 pt-0.5">
            {[...mainNav(), ...moreNav()].map((item) => (
              <TabLink key={item.to} item={item} />
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

function SideLink({ item: { to, label, Icon, end } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
          isActive ? 'bg-brand-wash text-brand-deep' : 'text-ink-soft hover:bg-sunk hover:text-ink'
        }`
      }
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
    </NavLink>
  )
}

/** Settings on a phone: the gear at the top right of every page, one tap from anywhere. */
function SettingsButton() {
  return (
    <NavLink
      to="/settings"
      aria-label={t('Settings')}
      title={t('Settings')}
      className={({ isActive }) =>
        `flex h-10 w-10 items-center justify-center rounded-full transition ${
          isActive ? 'bg-brand-wash text-brand-deep' : 'text-ink-soft hover:bg-sunk hover:text-ink'
        }`
      }
    >
      <Settings className="h-[22px] w-[22px]" aria-hidden />
    </NavLink>
  )
}

/** One tab on a phone: a small picture with its name under it, kept short so the page has the room. */
function TabLink({ item: { to, label, Icon, end } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-w-0 flex-col items-center gap-0.5 pt-1 pb-0.5 text-[11px] leading-tight font-semibold tracking-tight transition ${
          isActive ? 'text-brand-deep' : 'text-ink-faint'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-[22px] w-11 items-center justify-center rounded-full transition ${isActive ? 'bg-brand-wash' : ''}`}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="max-w-full truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}
