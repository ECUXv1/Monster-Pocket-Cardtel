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

// Best available image for a card — your own photo first, then whatever
// reference images the automatic checks turned up (PSA/CGC's own photo of
// this exact card, or the Pokémon TCG database's stock scan). This is what
// makes the whole collection look complete visually even for items you
// haven't personally photographed both sides of.
export function itemImage(item) {
  return (
    item.front_image_url ||
    item.slab_image_url ||
    item.cert_verification?.image_front ||
    item.card_reference?.image_large ||
    item.back_image_url ||
    item.cert_verification?.image_back ||
    null
  )
}
