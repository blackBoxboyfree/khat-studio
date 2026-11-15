const { price } = require('./_lib');
module.exports = (req, res) => {
  const p = price();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ amount: p.amount, currency: p.currency, ready: !!(process.env.STRIPE_SECRET_KEY && process.env.GEMINI_API_KEY) });
};
