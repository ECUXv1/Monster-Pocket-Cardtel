import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getItem, upsertItem, uploadImage, deleteItem, getSettings, computeAsking } from '../lib/inventoryStore'
import { money } from '../lib/format'
import SmartCameraCapture from '../components/SmartCameraCapture'
import { buildEbayQuery, fetchEbaySoldPrices } from '../lib/marketPrice'
import CinematicHero from '../components/CinematicHero'

const GRADERS = ['PSA', 'BGS', 'CGC', 'SGC', 'Other']

const empty = {
  category: 'raw',
  name: '',
  set_name: '',
  card_number: '',
  rarity: '',
  condition: 'Near Mint',
  grading_company: 'PSA',
  grade: '',
  cert_number: '',
  quantity: 1,
  purchase_price: '',
  purchase_date: '',
  markup_percent: 30,
  is_sold: false,
  sold_price: '',
  sold_date: '',
  notes: '',
  front_image_url: '',
  back_image_url: '',
  slab_image_url: '',
}

export default function ItemForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const editing = Boolean(id)

  const [form, setForm] = useState(empty)
  const [pendingFiles, setPendingFiles] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(editing)

  useEffect(() => {
    getSettings(user?.id).then((s) => {
      if (!editing) setForm((f) => ({ ...f, markup_percent: s.default_markup_percent ?? 30 }))
    })
  }, [user?.id, editing])

  useEffect(() => {
    if (!editing) return
    getItem(id).then((item) => {
      if (item) setForm({ ...empty, ...item })
      setLoading(false)
    })
  }, [id, editing])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const askingPreview = computeAsking(form)

  // A slot photo arrived wirelessly from a phone (QR hand-off) — the image
  // is already uploaded, so we get a URL directly, plus whatever Claude
  // could read off it (name/set/grade etc, only filled in where blank).
  function handleRemoteCapture(slot, url, recognized) {
    setForm((f) => {
      const next = { ...f, [`${slot}_image_url`]: url }
      if (recognized) {
        if (!next.name) next.name = recognized.name || next.name
        if (!next.set_name) next.set_name = recognized.set_name || next.set_name
        if (!next.card_number) next.card_number = recognized.card_number || next.card_number
        if (!next.rarity) next.rarity = recognized.rarity || next.rarity
        if (recognized.condition) next.condition = recognized.condition
        if (recognized.grading_company) next.grading_company = recognized.grading_company
        if (recognized.grade != null) next.grade = recognized.grade
        if (recognized.cert_number) next.cert_number = recognized.cert_number
      }
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        id: editing ? id : undefined,
        grade: form.category === 'graded' ? Number(form.grade) || null : null,
        purchase_price: Number(form.purchase_price) || 0,
        markup_percent: Number(form.markup_percent) || 0,
        quantity: Number(form.quantity) || 1,
        sold_price: form.is_sold ? Number(form.sold_price) || 0 : null,
      }
      const saved = await upsertItem(payload, user?.id)

      // upload any pending photos now that we have an item id
      const urls = {}
      for (const [slot, file] of Object.entries(pendingFiles)) {
        if (file) urls[`${slot}_image_url`] = await uploadImage(user?.id, saved.id, file, slot)
      }
      if (Object.keys(urls).length) {
        await upsertItem({ id: saved.id, ...urls }, user?.id)
      }

      // Fire-and-forget: check eBay's recently-sold listings for this card
      // and attach the estimate once it's back, without holding up navigation.
      checkEbayPrice(saved, user?.id)

      navigate(`/item/${saved.id}`)
    } catch (err) {
      alert(err.message || 'Could not save item.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this item permanently?')) return
    await deleteItem(id)
    navigate('/inventory')
  }

  if (loading) return <div className="p-6 text-cream/40 text-sm">Loading item…</div>

  return (
    <div className="pb-28 md:pb-8">
      <CinematicHero eyebrow="ADD TO THE VAULT" title={editing ? 'EDIT ITEM' : 'ADD NEW ITEM'} compact />

      <div className="p-4 lg:p-8 -mt-6 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center mb-4"
        >
          <ChevronLeft size={20} />
        </button>

        <form onSubmit={handleSave} className="space-y-6">
        {/* Category toggle */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'raw', label: 'Raw card' },
            { key: 'graded', label: 'Graded slab' },
          ].map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => set('category', c.key)}
              className={`h-12 rounded-xl font-bold text-sm border transition-colors ${
                form.category === c.key
                  ? 'bg-purple border-purple text-white'
                  : 'bg-surface border-line text-cream/60'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Photos — real camera on a phone, wireless QR hand-off on desktop/Tesla */}
        <div className="grid grid-cols-2 gap-3">
          <SmartCameraCapture
            label="Front photo"
            slot="front"
            category={form.category}
            existingUrl={form.front_image_url}
            onCapture={(file) => {
              setPendingFiles((p) => ({ ...p, front: file }))
              set('front_image_url', URL.createObjectURL(file))
            }}
            onRemoteCapture={(url, recognized) => handleRemoteCapture('front', url, recognized)}
            onClear={() => set('front_image_url', '')}
          />
          {form.category === 'graded' ? (
            <SmartCameraCapture
              label="Slab (full label)"
              slot="slab"
              category={form.category}
              existingUrl={form.slab_image_url}
              onCapture={(file) => {
                setPendingFiles((p) => ({ ...p, slab: file }))
                set('slab_image_url', URL.createObjectURL(file))
              }}
              onRemoteCapture={(url, recognized) => handleRemoteCapture('slab', url, recognized)}
              onClear={() => set('slab_image_url', '')}
            />
          ) : (
            <SmartCameraCapture
              label="Back photo"
              slot="back"
              category={form.category}
              existingUrl={form.back_image_url}
              onCapture={(file) => {
                setPendingFiles((p) => ({ ...p, back: file }))
                set('back_image_url', URL.createObjectURL(file))
              }}
              onRemoteCapture={(url, recognized) => handleRemoteCapture('back', url, recognized)}
              onClear={() => set('back_image_url', '')}
            />
          )}
        </div>

        {/* Core info */}
        <Section title="Card details">
          <Field label="Name" required>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Charizard"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Set">
              <input value={form.set_name} onChange={(e) => set('set_name', e.target.value)} placeholder="Base Set" className={inputCls} />
            </Field>
            <Field label="Card #">
              <input value={form.card_number} onChange={(e) => set('card_number', e.target.value)} placeholder="4/102" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rarity">
              <input value={form.rarity} onChange={(e) => set('rarity', e.target.value)} placeholder="Holo Rare" className={inputCls} />
            </Field>
            <Field label="Quantity">
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </Section>

        {form.category === 'raw' ? (
          <Section title="Condition">
            <Field label="Condition">
              <select value={form.condition} onChange={(e) => set('condition', e.target.value)} className={inputCls}>
                {['Mint', 'Near Mint', 'Excellent', 'Good', 'Played', 'Poor'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </Section>
        ) : (
          <Section title="Grading">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Grading company">
                <select value={form.grading_company} onChange={(e) => set('grading_company', e.target.value)} className={inputCls}>
                  {GRADERS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="Grade">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={form.grade}
                  onChange={(e) => set('grade', e.target.value)}
                  placeholder="10"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Cert number">
              <input value={form.cert_number} onChange={(e) => set('cert_number', e.target.value)} placeholder="e.g. 84930212" className={inputCls} />
            </Field>
          </Section>
        )}

        {/* Pricing */}
        <Section title="Pricing">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price you paid" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/40 text-sm">$</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.purchase_price}
                  onChange={(e) => set('purchase_price', e.target.value)}
                  placeholder="0.00"
                  className={`${inputCls} pl-6`}
                />
              </div>
            </Field>
            <Field label="Purchase date">
              <input type="date" value={form.purchase_date || ''} onChange={(e) => set('purchase_date', e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label={`Markup — ${form.markup_percent || 0}%`}>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={form.markup_percent}
              onChange={(e) => set('markup_percent', e.target.value)}
              className="w-full accent-gold"
            />
          </Field>

          <div className="rounded-xl bg-gradient-to-br from-gold/15 to-transparent border border-gold/30 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-cream/60 font-semibold uppercase tracking-wide">Suggested asking price</p>
              <p className="text-[11px] text-cream/40 mt-0.5">Cost + {form.markup_percent || 0}% markup</p>
            </div>
            <p className="font-num text-2xl font-bold text-gold">{money(askingPreview)}</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-cream/70">
            <input type="checkbox" checked={form.is_sold} onChange={(e) => set('is_sold', e.target.checked)} className="h-4 w-4 accent-purple" />
            Mark as sold
          </label>

          {form.is_sold && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sold price">
                <input type="number" step="0.01" value={form.sold_price} onChange={(e) => set('sold_price', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Sold date">
                <input type="date" value={form.sold_date || ''} onChange={(e) => set('sold_date', e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}
        </Section>

        <Section title="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            placeholder="Centering, edges, source of purchase, anything worth remembering…"
            className={`${inputCls} resize-none`}
          />
        </Section>

        <div className="flex gap-3 sticky bottom-20 md:bottom-0 md:static bg-ink/95 md:bg-transparent py-3 md:py-0 -mx-4 px-4 md:mx-0 md:px-0">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl bg-gold text-ink font-bold text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
          >
            <Save size={16} /> {saving ? 'Saving…' : editing ? 'Save changes' : 'Add to inventory'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={handleDelete}
              className="py-3.5 px-4 rounded-xl bg-surface-2 text-orange flex items-center justify-center"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full h-11 rounded-xl bg-surface border border-line px-3 text-sm text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-purple'

async function checkEbayPrice(item, userId) {
  try {
    const query = buildEbayQuery(item)
    if (!query) return
    const estimate = await fetchEbaySoldPrices(query)
    await upsertItem({ id: item.id, market_estimate: estimate }, userId)
  } catch {
    // Best-effort — the item detail page will retry this if market_estimate is still missing.
  }
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-[11px] text-cream/50 tracking-wide">{title.toUpperCase()}</h2>
      {children}
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-cream/60">
        {label} {required && <span className="text-orange">*</span>}
      </span>
      {children}
    </label>
  )
}
