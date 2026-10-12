import rateLimit from 'express-rate-limit';

const json = (message) => (req, res) => res.status(429).json({ message });

/** Brute-force protection for login / register (per IP). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Too many attempts. Please try again in a few minutes.'),
});

/** Manual price refresh hits external APIs - keep it modest (per signed-in user). */
export const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.REFRESH_RATE_LIMIT ?? 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || 'anonymous',
  handler: json('Refresh limit reached. Prices also update automatically every day.'),
});

/** Fund search proxies a third-party API. */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || 'anonymous',
  handler: json('Too many searches. Slow down a little.'),
});
