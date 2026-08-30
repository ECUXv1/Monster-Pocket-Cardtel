import { supabase, supabaseReady } from './supabaseClient'

export const scanFeatureAvailable = supabaseReady

export async function createCaptureSession(userId, category, slot = null) {
  if (!supabaseReady) throw new Error('Connect Supabase to use phone scan.')
  const { data, error } = await supabase
    .from('capture_sessions')
    .insert({ user_id: userId, category, slot, status: 'pending' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getCaptureSession(token) {
  const { data, error } = await supabase.from('capture_sessions').select('*').eq('id', token).single()
  if (error) throw error
  return data
}

export async function updateCaptureSession(token, patch) {
  const { data, error } = await supabase
    .from('capture_sessions')
    .update(patch)
    .eq('id', token)
    .select()
    .single()
  if (error) throw error
  return data
}

export function subscribeToCaptureSession(token, onChange) {
  const channel = supabase
    .channel(`capture_session_${token}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'capture_sessions', filter: `id=eq.${token}` },
      (payload) => onChange(payload.new)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export async function uploadCaptureImage(token, file, slot) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `capture/${token}/${slot}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('card-images').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  const { data } = supabase.storage.from('card-images').getPublicUrl(path)
  return data.publicUrl
}

export async function recognizeCard(imageUrls, category) {
  const res = await fetch('/.netlify/functions/recognize-card', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageUrls, category }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Recognition failed')
  return data.recognized
}

export async function lookupCardDatabase({ name, set_name, card_number }) {
  const params = new URLSearchParams({ name })
  if (set_name) params.set('set', set_name)
  if (card_number) params.set('number', card_number)
  const res = await fetch(`/.netlify/functions/card-database-lookup?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Card database lookup failed')
  return data
}

export async function gradeCondition(imageUrls) {
  const res = await fetch('/.netlify/functions/grade-condition', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageUrls }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Condition check failed')
  return data.report
}

export async function lookupCertVerification(gradingCompany, certNumber) {
  const params = new URLSearchParams({ company: gradingCompany || '', cert: certNumber || '' })
  const res = await fetch(`/.netlify/functions/cert-lookup?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Cert lookup failed')
  return data
}
