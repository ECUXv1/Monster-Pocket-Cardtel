// Gives a rough, photo-based condition estimate for a raw (ungraded) card —
// corners, edges, surface, and centering, plus an overall suggestion mapped
// to the same condition scale used elsewhere in the app (Mint, Near Mint,
// Excellent, Good, Played, Poor).
//
// Important: this is an estimate from ordinary phone/webcam photos, not a
// professional grade. Real grading services (PSA, BGS, CGC) use raking
// light, magnification loupes, and precise centering measurement that a
// photo simply can't replicate — corner whitening and fine surface
// scratches in particular are easy to miss or over-call from an image.
// Treat the result as a starting point for sorting your own collection,
// not as a substitute for submitting anything valuable for real grading.

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { imageUrls } = body
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'imageUrls is required' }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }),
    }
  }

  try {
    const imageBlocks = await Promise.all(
      imageUrls.slice(0, 2).map(async (url) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Could not fetch image: ${url}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const mediaType = res.headers.get('content-type') || 'image/jpeg'
        return { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } }
      })
    )

    const instructions = `These photos show the front${imageUrls.length > 1 ? ' and back' : ''} of an ungraded trading card. Give a rough, photo-based condition estimate — this is not a professional grade, so be conservative and note when something can't be judged reliably from a photo (e.g. fine surface scratches, precise centering percentage, corner whitening under raking light).

Assess these four areas briefly (one short phrase each):
- corners: whitening, fraying, or rounding visible
- edges: whitening or nicks along the border
- surface: scratches, scuffing, print lines, indentations visible
- centering: how far off-center the border margins look (rough estimate only)

Then give one overall condition word from exactly this list: Mint, Near Mint, Excellent, Good, Played, Poor.

Respond with ONLY minified JSON (no markdown fences, no commentary) matching exactly this shape:
{"condition":"Mint"|"Near Mint"|"Excellent"|"Good"|"Played"|"Poor","confidence":"low"|"medium","corners":string,"edges":string,"surface":string,"centering":string,"notes":string|null}
"notes" should mention anything you genuinely can't assess from the photo (blank if nothing notable). Keep every field short — a sentence fragment, not a paragraph.`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [...imageBlocks, { type: 'text', text: instructions }],
          },
        ],
      }),
    })

    const data = await anthropicRes.json()
    if (!anthropicRes.ok) {
      throw new Error(data?.error?.message || 'Claude API request failed')
    }

    const text = data.content?.find((b) => b.type === 'text')?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()

    let report
    try {
      report = JSON.parse(clean)
    } catch {
      report = { condition: null, confidence: 'low', notes: 'Could not parse a result — try again.' }
    }
    report.checked_at = new Date().toISOString()

    return { statusCode: 200, body: JSON.stringify({ report }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
