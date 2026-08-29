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

function computeAsking(item) {
  const price = Number(item.purchase_price) || 0
  const markup = Number(item.markup_percent) || 0
  return Math.round(price * (1 + markup / 100) * 100) / 100
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
    const payload = { ...item, user_id: userId }
    delete payload.asking_price // generated column
    const { data, error } = await supabase
      .from('items')
      .upsert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const items = readLocal()
  if (item.id) {
    const idx = items.findIndex((i) => i.id === item.id)
    const merged = { ...items[idx], ...item, updated_at: now }
    merged.asking_price = computeAsking(merged)
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
  created.asking_price = computeAsking(created)
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

export { computeAsking }
