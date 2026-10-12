import { Router } from 'express';
import mongoose from 'mongoose';
import { Investment, INVESTMENT_TYPES } from '../models/Investment.js';
import { requireAuth } from '../middleware/auth.js';
import { refreshLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import {
  createInvestment,
  deleteInvestment,
  listInvestments,
  updateInvestment,
} from '../services/investmentService.js';
import { runPriceUpdate } from '../services/priceUpdater.js';
import { csvFilename, portfolioToCsv } from '../services/csvExport.js';
import { sellInvestment } from '../services/saleService.js';

const router = Router();
router.use(requireAuth);

/** Load a holding that belongs to the signed-in user, or 404 (never reveals other users' ids). */
async function loadOwned(req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Investment not found');
  const doc = await Investment.findOne({ _id: id, user: req.user.id });
  if (!doc) throw httpError(404, 'Investment not found');
  return doc;
}

function envelope(investments) {
  const times = investments.map((i) => i.lastPriceAt).filter(Boolean).map((d) => d.getTime());
  return {
    investments,
    pricesUpdatedAt: times.length ? new Date(Math.max(...times)) : null,
    staleCount: investments.filter((i) => i.priceStatus === 'stale' || i.priceStatus === 'pending').length,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.query.type;
    if (type !== undefined && !INVESTMENT_TYPES.includes(type)) throw httpError(400, 'Unknown investment type');
    res.json(envelope(await listInvestments(req.user.id, type)));
  })
);

// Download every holding as a spreadsheet-friendly CSV (optionally ?type=stocks).
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const type = req.query.type;
    if (type !== undefined && !INVESTMENT_TYPES.includes(type)) throw httpError(400, 'Unknown investment type');
    const holdings = await listInvestments(req.user.id, type).lean();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${csvFilename()}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(portfolioToCsv(holdings));
  })
);

// Refresh the signed-in user's own holdings now (the daily job does this for everyone).
router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    await runPriceUpdate({ reason: 'user-refresh', userId: req.user.id });
    res.json(envelope(await listInvestments(req.user.id)));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { investment, warning } = await createInvestment(req.user.id, req.body);
    res.status(201).json({ investment, warning });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ investment: await loadOwned(req) });
  })
);

// Record a sale (full or partial) -> booked profit/loss used by the Tax Centre.
router.post(
  '/:id/sell',
  asyncHandler(async (req, res) => {
    const doc = await loadOwned(req);
    const { sale, holding } = await sellInvestment(req.user.id, doc, req.body || {});
    res.status(201).json({ sale, holding });
  })
);

const update = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req);
  const { investment, warning } = await updateInvestment(doc, req.body || {});
  res.json({ investment, warning });
});
router.patch('/:id', update);
router.put('/:id', update);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteInvestment(await loadOwned(req));
    res.status(204).end();
  })
);

export default router;
