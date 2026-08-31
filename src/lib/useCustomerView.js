import { useState } from 'react'

const KEY = 'mpc_hq_customer_view'

/**
 * A device-level setting (not per-item, not synced) that hides cost basis
 * and profit figures everywhere in the app — handy when handing the
 * screen to someone else. Stays on until switched back; toggleable from
 * Settings or the quick icon on an item's detail page.
 */
export function useCustomerView() {
  const [customerView, setCustomerViewState] = useState(() => localStorage.getItem(KEY) === 'true')

  function setCustomerView(next) {
    setCustomerViewState(next)
    localStorage.setItem(KEY, String(next))
  }

  return [customerView, setCustomerView]
}
