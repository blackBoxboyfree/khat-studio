const { stripe, price, origin, readBody } = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try {
    const b = await readBody(req);
    const n = parseInt(b.design, 10);
    const text = String(b.text || '').trim().replace(/\s+/g, ' ');
    if (!(n >= 1 && n <= 88)) return res.status(400).json({ error: 'bad_design' });
    if (text.length < 1 || text.length > 60) return res.status(400).json({ error: 'bad_text' });
    const p = price();
    const o = origin(req);
    const md = { design: String(n), text };
    const s = await stripe('POST', '/checkout/sessions', {
      mode: 'payment',
      success_url: `${o}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${o}/?canceled=1`,
      line_items: { 0: { quantity: 1, price_data: { currency: p.currency, unit_amount: p.amount, product_data: { name: `تصميم خط رقم ${n}` } } } },
      metadata: md,
      payment_intent_data: { metadata: md },
    });
    res.json({ url: s.url });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};
