export function money(n) {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function pct(n) {
  const v = Number(n) || 0
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

export function itemValue(item) {
  const qty = Number(item.quantity) || 1
  if (item.is_sold) return Number(item.sold_price) || 0
  return (Number(item.asking_price) || 0) * qty
}

export function itemCost(item) {
  const qty = Number(item.quantity) || 1
  return (Number(item.purchase_price) || 0) * qty
}

export function itemProfit(item) {
  return itemValue(item) - itemCost(item)
}
