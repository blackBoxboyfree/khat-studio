const { stripe, origin, readBody, paymentsOn } = require('./_lib');
const last = new Map();
const MODELS = [process.env.GEMINI_MODEL, 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'].filter(Boolean);

function prompt(text) {
  return `The attached image is a STYLE REFERENCE: an Arabic calligraphy / lettering design.
Create a NEW square image in exactly the same visual style: the same lettering style, materials, textures, colors, lighting, decorative elements, background and composition.
The ONLY text written in the new image must be exactly this Arabic/Latin text: «${text}»
Rules:
- Spell the text exactly as given, with correct Arabic letter shaping and connections, right-to-left.
- Do NOT reuse the words that appear in the reference image.
- Do NOT draw any crown icon, name label, caption bar, watermark or app interface.
- Fill the frame similar to the reference. No other text.`;
}

async function gemini(refB64, text) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('not_configured'), { status: 503 });
  let last = 'no_image';
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(text) }, { inlineData: { mimeType: 'image/jpeg', data: refB64 } }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { last = j.error?.message || ('gemini_' + r.status); if (r.status === 404) continue; break; }
    const parts = j.candidates?.[0]?.content?.parts || [];
    const img = parts.filter(p => !p.thought).map(p => p.inlineData || p.inline_data).find(Boolean);
    if (img?.data) return { mime: img.mimeType || img.mime_type || 'image/png', data: img.data };
    last = 'no_image';
  }
  throw Object.assign(new Error(last), { status: 502 });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  let piId = null;
  try {
    const b = await readBody(req);
    let n, text;
    if (!paymentsOn()) {
      // free mode (payments disabled): simple per-IP throttle, best effort
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
      const t = Date.now();
      if (t - (last.get(ip) || 0) < 20000) return res.status(429).json({ error: 'slow_down' });
      last.set(ip, t);
      if (last.size > 500) last.clear();
      n = parseInt(b.design, 10);
      text = String(b.text || '').trim().replace(/\s+/g, ' ');
      if (!(n >= 1 && n <= 88)) return res.status(400).json({ error: 'bad_design' });
      if (text.length < 1 || text.length > 60) return res.status(400).json({ error: 'bad_text' });
    } else {
      const sid = String(b.session_id || '');
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: 'bad_session' });
      const s = await stripe('GET', `/checkout/sessions/${sid}?expand[]=payment_intent`);
      if (s.payment_status !== 'paid') return res.status(402).json({ error: 'not_paid' });
      const pi = s.payment_intent;
      piId = pi.id;
      const md = pi.metadata || {};
      if (md.used === '1') return res.status(409).json({ error: 'already_used' });
      if (md.lock && Date.now() - Number(md.lock) < 90000) return res.status(409).json({ error: 'busy' });
      n = parseInt(s.metadata.design, 10); text = s.metadata.text;
      if (!(n >= 1 && n <= 88) || !text) return res.status(400).json({ error: 'bad_order' });
      await stripe('POST', `/payment_intents/${piId}`, { metadata: { lock: String(Date.now()) } });
    }
    const ref = await fetch(`${origin(req)}/img/${String(n).padStart(3, '0')}.jpg`);
    if (!ref.ok) throw Object.assign(new Error('ref_missing'), { status: 500 });
    const refB64 = Buffer.from(await ref.arrayBuffer()).toString('base64');
    const out = await gemini(refB64, text);
    if (piId) await stripe('POST', `/payment_intents/${piId}`, { metadata: { used: '1', lock: '' } });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ mime: out.mime, data: out.data, design: n, text });
  } catch (e) {
    if (piId) { try { await stripe('POST', `/payment_intents/${piId}`, { metadata: { lock: '' } }); } catch {} }
    res.status(e.status || 500).json({ error: e.message });
  }
};
