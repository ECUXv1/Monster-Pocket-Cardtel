import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import Nav from './components/Nav'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import ItemForm from './pages/ItemForm'
import ItemDetail from './pages/ItemDetail'
import Settings from './pages/Settings'
import Login from './pages/Login'
import CapturePhone from './pages/CapturePhone'

export default function App() {
  const { session, loading, supabaseReady } = useAuth()
  const location = useLocation()

  // The phone that scans the Tesla-screen QR code never signs in to this
  // app — it just opens a capability link. Let that route through before
  // any auth gate applies.
  if (location.pathname.startsWith('/capture/')) {
    return (
      <Routes>
        <Route path="/capture/:token" element={<CapturePhone />} />
      </Routes>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink text-cream/40 text-sm">
        Loading MPC HQ…
      </div>
    )
  }

  if (supabaseReady && !session) {
    return <Login />
  }

  return (
    <div className="min-h-screen flex bg-ink">
      <Nav />
      <main className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/add" element={<ItemForm />} />
          <Route path="/edit/:id" element={<ItemForm />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
