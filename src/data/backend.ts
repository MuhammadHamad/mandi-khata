import { todayISO } from '../lib/format'
import type { Backend } from './api'
import { browserStore, createDemoBackend } from './demo'
import { liveBackend, liveConfigured } from './live'

/** True in `npm run dev:demo` and `npm run build:demo`: the books live in this browser only. */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1'

/** A real build with no database keys shows how to connect one instead of the app. */
export const NEEDS_SETUP = !IS_DEMO && !liveConfigured

export const backend: Backend = IS_DEMO
  ? createDemoBackend(browserStore('mandi-app:demo:v1'), { today: todayISO })
  : liveBackend
