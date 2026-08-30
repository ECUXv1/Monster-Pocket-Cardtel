import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Save, Trash2, Sparkles, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getItem, upsertItem, uploadImage, deleteItem, getSettings, resolveAskingPrice } from '../lib/inventoryStore'
import { money } from '../lib/format'
import SmartCameraCapture from '../components/SmartCameraCapture'
import { buildEbayQuery, fetchEbaySoldPrices } from '../lib/marketPrice'
import { syncItemIntel } from '../lib/itemIntel'
import { recognizeCard, lookupCardDatabase, lookupCertVerification, gradeCondition } from '../lib/captureSession'
import CinematicHero from '../components/CinematicHero'
import DateSelect from '../components/DateSelect'

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
  card_reference: null,
  condition_report: null,
  cert_verification: null,
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
  const [identifyStatus, setIdentifyStatus] = useState('') // '' | 'reading' | 'looking_up' | 'pricing' | 'error'
  const [gradingCondition, setGradingCondition] = useState(false)

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

  const askingPreview = resolveAskingPrice(form)
  const usingMarketPrice = form.market_estimate?.sample_size > 0 && Number(form.market_estimate?.average) > 0

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

  // One-tap pipeline: read whatever photos are already attached, identify
  // the card with Claude's vision, pull the canonical scan + full card
  // intel from the Pokémon TCG database, then check eBay's recent sold
  // prices — all in one go.
  async function handleAutoIdentify() {
    const imageUrls = [form.front_image_url, form.slab_image_url, form.back_image_url].filter(Boolean)
    if (imageUrls.length === 0) {
      alert('Add at least one photo first.')
      return
    }
    setIdentifyStatus('reading')
    try {
      const recognized = await recognizeCard(imageUrls, form.category)
      setForm((f) => ({
        ...f,
        name: recognized.name || f.name,
        set_name: recognized.set_name || f.set_name,
        card_number: recognized.card_number || f.card_number,
        rarity: recognized.rarity || f.rarity,
        condition: recognized.condition || f.condition,
        grading_company: recognized.grading_company || f.grading_company,
        grade: recognized.grade ?? f.grade,
        cert_number: recognized.cert_number || f.cert_number,
      }))

      const cardName = recognized.name
      if (cardName) {
        // For graded cards, check the grading company's own site by cert
        // number first — it's the actual source of truth for this exact
        // card, so its grade/description take priority over what vision
        // read off the label photo.
        if (form.category === 'graded' && recognized.cert_number && recognized.grading_company) {
          setIdentifyStatus('verifying_cert')
          try {
            const cert = await lookupCertVerification(recognized.grading_company, recognized.cert_number)
            setForm((f) => ({
              ...f,
              cert_verification: cert,
              grade: cert.found && cert.grade ? cert.grade : f.grade,
            }))
          } catch (err) {
            setForm((f) => ({
              ...f,
              cert_verification: {
                found: false,
                grading_company: recognized.grading_company,
                note: `Couldn't reach ${recognized.grading_company}'s site right now (${err.message}).`,
              },
            }))
          }
        }

        setIdentifyStatus('looking_up')
        try {
          const reference = await lookupCardDatabase({
            name: cardName,
            set_name: recognized.set_name,
            card_number: recognized.card_number,
          })
          setForm((f) => ({
            ...f,
            card_reference: reference,
            rarity: f.rarity || reference.rarity || '',
          }))
        } catch (err) {
          // Record it instead of leaving the box empty with no explanation.
          setForm((f) => ({
            ...f,
            card_reference: { found: false, note: `Couldn't check the card database right now (${err.message}).` },
          }))
        }

        setIdentifyStatus('pricing')
        try {
          const query = buildEbayQuery({
            name: cardName,
            set_name: recognized.set_name,
            card_number: recognized.card_number,
            category: form.category,
            grading_company: recognized.grading_company,
            grade: recognized.grade,
          })
          const estimate = await fetchEbaySoldPrices(query)
          setForm((f) => ({ ...f, market_estimate: estimate }))
        } catch {
          // Same — a failed price check shouldn't undo the identification.
        }
      }

      setIdentifyStatus('')
    } catch (err) {
      setIdentifyStatus('error')
      setTimeout(() => setIdentifyStatus(''), 3000)
      alert(err.message || 'Could not identify this card.')
    }
  }

  // Rough, photo-based condition estimate for raw cards — not a substitute
  // for professional grading, just a quick sort based on whatever front/back
  // photos are already attached.
  async function handleGradeCondition() {
    const imageUrls = [form.front_image_url, form.back_image_url].filter(Boolean)
    if (imageUrls.length === 0) {
      alert('Add at least a front photo first.')
      return
    }
    setGradingCondition(true)
    try {
      const report = await gradeCondition(imageUrls)
      setForm((f) => ({
        ...f,
        condition_report: report,
        condition: report.condition || f.condition,
      }))
    } catch (err) {
      alert(err.message || 'Could not check condition.')
    } finally {
      setGradingCondition(false)
    }
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
        purchase_date: form.purchase_date || null,
        sold_date: form.is_sold ? form.sold_date || null : null,
        asking_price: askingPreview,
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

      // Fire-and-forget: check eBay's recently-sold listings AND the card
      // database (whichever one hasn't already been filled in) for this
      // item, without holding up navigation.
      syncItemIntel(saved, user?.id)

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

        {/* One-tap identify: vision + card database + eBay pricing */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleAutoIdentify}
            disabled={Boolean(identifyStatus)}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple to-purple-dim text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-70 shadow-[0_0_24px_-6px_rgba(123,47,247,0.7)]"
          >
            {identifyStatus ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {identifyStatus === 'reading' && 'Reading the card…'}
                {identifyStatus === 'verifying_cert' && 'Verifying cert number…'}
                {identifyStatus === 'looking_up' && 'Pulling card intel…'}
                {identifyStatus === 'pricing' && 'Checking eBay sold prices…'}
                {identifyStatus === 'error' && 'Could not identify — try again'}
              </>
            ) : (
              <>
                <Sparkles size={16} /> Auto-Identify This Card
              </>
            )}
          </button>

          {form.card_reference?.found && (
            <div className="slab-frame rounded-2xl border border-line bg-surface p-3 flex gap-3">
              {form.card_reference.image_large && (
                <img
                  src={form.card_reference.image_large}
                  alt={form.card_reference.name}
                  className="w-16 rounded-lg object-cover shrink-0 border border-line"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-display text-gold">{form.card_reference.name}</p>
                <p className="text-[11px] text-cream/50 mt-0.5">
                  {[form.card_reference.set?.name, form.card_reference.number].filter(Boolean).join(' · ')}
                </p>
                {form.card_reference.match_confidence === 'low' && (
                  <p className="text-[10px] text-orange/70 mt-0.5">
                    Unconfirmed match — double-check this is the right print before saving.
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {form.card_reference.hp && <span className="mpc-badge !text-[9px] !py-1">HP {form.card_reference.hp}</span>}
                  {form.card_reference.rarity && <span className="mpc-badge !text-[9px] !py-1">{form.card_reference.rarity}</span>}
                  {form.card_reference.market?.prices?.holofoil?.market && (
                    <span className="mpc-badge !text-[9px] !py-1">
                      TCGplayer {money(form.card_reference.market.prices.holofoil.market)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {form.card_reference?.found === false && (
            <p className="text-[11px] text-cream/40">
              {form.card_reference.note || 'No match in the Pokémon card database for this card.'}
            </p>
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

            <button
              type="button"
              onClick={handleGradeCondition}
              disabled={gradingCondition}
              className="w-full h-11 rounded-xl border border-dashed border-purple/50 bg-purple/10 text-purple-glow font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-70"
            >
              {gradingCondition ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Checking corners, edges, surface…
                </>
              ) : (
                <>
                  <Sparkles size={15} /> AI Condition Check
                </>
              )}
            </button>

            {form.condition_report && <ConditionReport report={form.condition_report} />}
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

            {form.cert_verification?.found && (
              <div className="slab-frame rounded-2xl border border-line bg-surface p-3 flex gap-3">
                {form.cert_verification.image_front && (
                  <img
                    src={form.cert_verification.image_front}
                    alt="PSA-photographed front"
                    className="w-14 rounded-lg object-cover border border-line shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-display text-gold">Verified on {form.cert_verification.grading_company}.com</p>
                  {form.cert_verification.description && (
                    <p className="text-[11px] text-cream/60 mt-0.5">{form.cert_verification.description}</p>
                  )}
                  {form.cert_verification.grade && (
                    <p className="text-[11px] text-cream/40 mt-0.5">Grade {form.cert_verification.grade}</p>
                  )}
                </div>
              </div>
            )}
            {form.cert_verification?.found === false && (
              <p className="text-[11px] text-cream/40">{form.cert_verification.note}</p>
            )}
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
              <DateSelect value={form.purchase_date} onChange={(v) => set('purchase_date', v)} />
            </Field>
          </div>

          <Field label={`Fallback markup — ${form.markup_percent || 0}%`}>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={form.markup_percent}
              onChange={(e) => set('markup_percent', e.target.value)}
              className="w-full accent-gold"
            />
            <p className="text-[10px] text-cream/35 mt-1">
              Only used until eBay market data exists for this card, or if none turns up.
            </p>
          </Field>

          <div className="rounded-xl bg-gradient-to-br from-gold/15 to-transparent border border-gold/30 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-cream/60 font-semibold uppercase tracking-wide">Asking price</p>
              <p className="text-[11px] text-cream/40 mt-0.5">
                {usingMarketPrice
                  ? `Matched to eBay's recent market average (${form.market_estimate.sample_size} listings)`
                  : `Cost + ${form.markup_percent || 0}% markup — no market data yet`}
              </p>
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
                <DateSelect value={form.sold_date} onChange={(v) => set('sold_date', v)} />
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

function ConditionReport({ report }) {
  if (!report.condition) {
    return (
      <p className="text-xs text-orange">{report.notes || 'Could not read a condition from that photo — try again.'}</p>
    )
  }
  return (
    <div className="slab-frame rounded-2xl border border-line bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-display text-gold">AI estimate: {report.condition}</span>
        <span className="text-[10px] text-cream/40 uppercase tracking-wide">{report.confidence} confidence</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-cream/60">
        {report.corners && <p><span className="text-cream/40">Corners:</span> {report.corners}</p>}
        {report.edges && <p><span className="text-cream/40">Edges:</span> {report.edges}</p>}
        {report.surface && <p><span className="text-cream/40">Surface:</span> {report.surface}</p>}
        {report.centering && <p><span className="text-cream/40">Centering:</span> {report.centering}</p>}
      </div>
      {report.notes && <p className="text-[10px] text-cream/40 italic">{report.notes}</p>}
      <p className="text-[10px] text-cream/30 pt-1 border-t border-line">
        Photo-based AI estimate, not a professional grade — treat as a rough sort, not a substitute for PSA/BGS/CGC.
      </p>
    </div>
  )
}
