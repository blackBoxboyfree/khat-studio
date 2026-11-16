const form = (obj, prefix, out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
  }
  return out;
};
async function stripe(method, path, body) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error('not_configured'), { status: 503 });
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body ? form(body).join('&') : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'stripe_error'), { status: 502 });
  return j;
}
const price = () => ({
  amount: parseInt(process.env.PRICE_CENTS || '260', 10),
  currency: (process.env.CURRENCY || 'usd').toLowerCase(),
});
const paymentsOn = () => process.env.PAYMENTS_ENABLED === '1';
const origin = (req) => `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) s += c;
  try { return JSON.parse(s || '{}'); } catch { return {}; }
};
module.exports = { stripe, price, origin, readBody, paymentsOn };
