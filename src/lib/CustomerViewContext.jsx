import { createContext, useContext, useState } from 'react'

const KEY = 'mpc_hq_customer_view'
const CustomerViewContext = createContext(null)

/**
 * A device-level setting (not per-item, not synced across devices) that
 * hides cost basis and profit figures everywhere in the app — handy when
 * handing the screen to someone else. One shared piece of state via
 * Context, mounted once in App.jsx — every component reading it (Nav,
 * Dashboard, Inventory, ItemDetail, Settings) sees the same value and
 * re-renders immediately when it changes, from wherever it was toggled.
 */
export function CustomerViewProvider({ children }) {
  const [customerView, setCustomerViewState] = useState(() => localStorage.getItem(KEY) === 'true')

  function setCustomerView(next) {
    setCustomerViewState(next)
    localStorage.setItem(KEY, String(next))
  }

  return <CustomerViewContext.Provider value={[customerView, setCustomerView]}>{children}</CustomerViewContext.Provider>
}

export function useCustomerView() {
  const ctx = useContext(CustomerViewContext)
  if (!ctx) throw new Error('useCustomerView must be used inside <CustomerViewProvider>')
  return ctx
}
