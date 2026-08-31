import { supabase, supabaseReady } from './supabaseClient'

const LOCAL_KEY = 'mpc_hq_demo_items_v1'
const LOCAL_SETTINGS_KEY = 'mpc_hq_demo_settings_v1'

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch {
    return []
  }
}
function writeLocal(items) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
}

// The pricing rule: asking price = the median of recent comparable eBay
// sales, full stop. No markup involved — markup was only ever a stand-in
// guess for real market data. Before that data exists yet (a brand new
// item, checked moments before the automatic price sync completes), the
// placeholder is simply cost — a neutral break-even number, not a made-up
// percentage.
function resolveAskingPrice(item) {
  const median = Number(item.market_estimate?.median)
  if (item.market_estimate?.sample_size > 0 && median > 0) {
    return Math.round(median * 100) / 100
  }
  return Math.round((Number(item.purchase_price) || 0) * 100) / 100
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

export const isDemoMode = !supabaseReady

// ---------- Items ----------

export async function listItems(userId) {
  if (supabaseReady) {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  }
  return readLocal().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function getItem(id) {
  if (supabaseReady) {
    const { data, error } = await supabase.from('items').select('*').eq('id', id).single()
    if (error) throw error
    return data
  }
  return readLocal().find((i) => i.id === id) || null
}

export async function upsertItem(item, userId) {
  const now = new Date().toISOString()
  if (supabaseReady) {
    if (item.id) {
      // A genuine UPDATE — only touches the columns actually passed in, so
      // a partial patch (e.g. just { id, market_estimate }) can never trip
      // NOT NULL constraints on columns like `name` that aren't included.
      // (.upsert() would build a full tentative INSERT row first and fail
      // that same constraint check, even though the row already exists.)
      const payload = { ...item }
      delete payload.id
      delete payload.user_id
      const { data, error } = await supabase
        .from('items')
        .update(payload)
        .eq('id', item.id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    const payload = { ...item, user_id: userId }
    if (payload.asking_price == null) payload.asking_price = resolveAskingPrice(payload)
    const { data, error } = await supabase
      .from('items')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const items = readLocal()
  if (item.id) {
    const idx = items.findIndex((i) => i.id === item.id)
    const merged = { ...items[idx], ...item, updated_at: now }
    if (item.asking_price == null) merged.asking_price = resolveAskingPrice(merged)
    items[idx] = merged
    writeLocal(items)
    return merged
  }
  const created = {
    ...item,
    id: uuid(),
    user_id: userId || 'demo',
    created_at: now,
    updated_at: now,
  }
  if (created.asking_price == null) created.asking_price = resolveAskingPrice(created)
  items.unshift(created)
  writeLocal(items)
  return created
}

export async function deleteItem(id) {
  if (supabaseReady) {
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) throw error
    return
  }
  writeLocal(readLocal().filter((i) => i.id !== id))
}

// ---------- Images ----------

export async function uploadImage(userId, itemId, file, slot) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId || 'demo'}/${itemId}/${slot}-${Date.now()}.${ext}`

  if (supabaseReady) {
    const { error } = await supabase.storage.from('card-images').upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    })
    if (error) throw error
    const { data } = supabase.storage.from('card-images').getPublicUrl(path)
    return data.publicUrl
  }

  // Demo mode: store as a data URL directly (no backend)
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ---------- Settings ----------

export async function getSettings(userId) {
  if (supabaseReady) {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    return data || { default_markup_percent: 30, currency: 'USD' }
  }
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY)) || {
      default_markup_percent: 30,
      currency: 'USD',
    }
  } catch {
    return { default_markup_percent: 30, currency: 'USD' }
  }
}

export async function saveSettings(userId, settings) {
  if (supabaseReady) {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() })
    if (error) throw error
    return
  }
  localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings))
}

// ---------- Sharing (public, read-only vault link) ----------
// Only meaningful with Supabase connected — a shareable link needs a
// backend to actually serve, so this is unavailable in local demo mode.

export async function getShareSettings(userId) {
  if (!supabaseReady) return null
  const { data, error } = await supabase
    .from('user_settings')
    .select('share_token, share_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function setShareEnabled(userId, enabled) {
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, share_enabled: enabled, updated_at: new Date().toISOString() })
    .select('share_token, share_enabled')
    .single()
  if (error) throw error
  return data
}

// Regenerating instantly invalidates any link already handed out — the
// old token stops matching anything the moment this runs.
export async function regenerateShareToken(userId) {
  const newToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, share_token: newToken, updated_at: new Date().toISOString() })
    .select('share_token, share_enabled')
    .single()
  if (error) throw error
  return data
}

// The public entry point — no auth session needed. Goes through a
// SECURITY DEFINER database function that only ever returns a short,
// deliberately safe field list (see supabase/schema.sql), so this can
// never leak cost, notes, or anything beyond what's meant to be shared.
export async function getSharedInventory(token) {
  const { data, error } = await supabase.rpc('get_shared_inventory', { p_token: token })
  if (error) throw error
  return data || []
}

export { resolveAskingPrice }
