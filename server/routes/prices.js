import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { searchLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { PriceError, searchMutualFunds } from '../services/prices.js';

const router = Router();
router.use(requireAuth);

// GET /api/prices/mutual-funds/search?q=parag parikh
router.get(
  '/mutual-funds/search',
  searchLimiter,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 3) return res.json({ results: [] });
    try {
      res.json({ results: await searchMutualFunds(q) });
    } catch (err) {
      if (err instanceof PriceError) throw httpError(503, 'Fund search is temporarily unavailable');
      throw err;
    }
  })
);

export default router;
