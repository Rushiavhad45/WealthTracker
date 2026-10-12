import { Router } from 'express';
import { PortfolioSnapshot } from '../models/PortfolioSnapshot.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { addDays, todayIST } from '../utils/dates.js';

const router = Router();
router.use(requireAuth);

const RANGE_DAYS = { '1M': 30, '6M': 183, '1Y': 365, ALL: null };

// GET /api/portfolio/history?range=1M|6M|1Y|ALL  -> one point per day (IST)
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const range = String(req.query.range || '1Y').toUpperCase();
    if (!(range in RANGE_DAYS)) throw httpError(400, 'range must be one of 1M, 6M, 1Y, ALL');

    const filter = { user: req.user.id };
    if (RANGE_DAYS[range] != null) filter.date = { $gte: addDays(todayIST(), -RANGE_DAYS[range]) };

    const rows = await PortfolioSnapshot.find(filter, 'date invested current -_id').sort({ date: 1 }).lean();
    res.json({ range, points: rows });
  })
);

export default router;
