// Netlify serverless function used by the "Scan with phone" flow.
// Given one or more public image URLs (a raw card's front/back, or a
// graded slab's label), it asks Claude to read off the card details and
// returns them as structured JSON for the Tesla screen to prefill.
//
// Requires an ANTHROPIC_API_KEY environment variable set in
// Netlify: Site settings -> Environment variables.

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

  const { imageUrls, category } = body
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
    // Fetch each photo and inline it as base64 for the vision request.
    const imageBlocks = await Promise.all(
      imageUrls.slice(0, 3).map(async (url) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Could not fetch image: ${url}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const mediaType = res.headers.get('content-type') || 'image/jpeg'
        return { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } }
      })
    )

    const subject =
      category === 'graded'
        ? 'a graded trading card slab. Read the grading company logo, the grade printed on the label, the cert/serial number, and the card name/set/number printed on the label.'
        : 'an ungraded ("raw") trading card. Identify the card name, set, and card number, and estimate its condition from the visible wear on edges, corners, and surface.'

    const instructions = `These photos show ${subject}
Respond with ONLY minified JSON (no markdown fences, no commentary) matching exactly this shape:
{"name":string|null,"set_name":string|null,"card_number":string|null,"rarity":string|null,"condition":string|null,"grading_company":string|null,"grade":number|null,"cert_number":string|null,"confidence":"high"|"medium"|"low"}
Use null for any field you cannot read with confidence. Never guess a cert number, grade, or grading company that is not clearly visible in the photo. "condition" should be one of: Mint, Near Mint, Excellent, Good, Played, Poor — only for raw cards, otherwise null.`

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

    let recognized
    try {
      recognized = JSON.parse(clean)
    } catch {
      recognized = { name: null, confidence: 'low', raw: text }
    }

    return { statusCode: 200, body: JSON.stringify({ recognized }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
