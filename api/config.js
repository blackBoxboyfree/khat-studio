const { price, paymentsOn } = require('./_lib');
module.exports = (req, res) => {
  const p = price(), on = paymentsOn();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ amount: p.amount, currency: p.currency, payments: on,
    ready: !!(process.env.GEMINI_API_KEY && (!on || process.env.STRIPE_SECRET_KEY)) });
};
