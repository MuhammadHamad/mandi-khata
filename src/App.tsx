import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import AppShell, { MorePage } from './components/AppShell'
import { LangProvider } from './components/Lang'
import { Loading } from './components/ui'
import { AuthProvider, useAuth } from './data/auth'
import { NEEDS_SETUP } from './data/backend'
import ChallanDetail from './pages/ChallanDetail'
import ChallanForm from './pages/ChallanForm'
import Challans from './pages/Challans'
import Expenses from './pages/Expenses'
import Home from './pages/Home'
import Ledgers from './pages/Ledgers'
import Login from './pages/Login'
import Money from './pages/Money'
import PartyLedger from './pages/PartyLedger'
import Reports from './pages/Reports'
import SaleDetail from './pages/SaleDetail'
import SaleForm from './pages/SaleForm'
import Sales from './pages/Sales'
import Settings from './pages/Settings'
import Setup from './pages/Setup'

// One business's books, changed only through this app: what was loaded a
// minute ago is still right, and every save reloads what it touched.
// The books live on the phone and saves go there first, so nothing waits for a
// connection here (React Query would otherwise hold every save while offline).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: true, retry: 1, networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
})

function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  if (NEEDS_SETUP) return <Setup />
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LangProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <RequireUser>
                    <AppShell />
                  </RequireUser>
                }
              >
                <Route index element={<Home />} />
                <Route path="challans" element={<Challans />} />
                <Route path="challans/new" element={<ChallanForm />} />
                <Route path="challans/:id" element={<ChallanDetail />} />
                <Route path="challans/:id/edit" element={<ChallanForm />} />
                <Route path="sales" element={<Sales />} />
                <Route path="sales/new" element={<SaleForm />} />
                <Route path="sales/:id" element={<SaleDetail />} />
                <Route path="sales/:id/edit" element={<SaleForm />} />
                <Route path="ledgers" element={<Ledgers />} />
                <Route path="customers/:id" element={<PartyLedger kind="customer" />} />
                <Route path="suppliers/:id" element={<PartyLedger kind="supplier" />} />
                <Route path="money" element={<Money />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="reports" element={<Reports />} />
                <Route path="report" element={<Navigate to="/reports" replace />} />
                <Route path="settings" element={<Settings />} />
                <Route path="more" element={<MorePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </LangProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
