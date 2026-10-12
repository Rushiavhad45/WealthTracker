import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { fyOf, parseFy } from '../utils/fy.js';
import { todayIST } from '../utils/dates.js';
import { taxSettingsSchema } from '../validators/tax.js';
import { buildTaxReport } from '../services/tax/report.js';
import { saveTaxSettings, undoSale } from '../services/saleService.js';
import { taxStatementToCsv } from '../services/csvExport.js';

const router = Router();
router.use(requireAuth);

function fyParam(value) {
  const fy = value === undefined ? fyOf(todayIST()) : String(value);
  if (parseFy(fy) == null) throw httpError(400, 'Financial year must look like 2026-27');
  return fy;
}

// GET /api/tax/report?fy=2026-27   (defaults to the current financial year)
router.get(
  '/report',
  asyncHandler(async (req, res) => {
    res.json(await buildTaxReport(req.user.id, fyParam(req.query.fy)));
  })
);

// GET /api/tax/report.csv?fy=2026-27  - statement for your CA / ITR Schedule CG
router.get(
  '/report.csv',
  asyncHandler(async (req, res) => {
    const fy = fyParam(req.query.fy);
    const report = await buildTaxReport(req.user.id, fy);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wealthtrack-capital-gains-${fy}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(taxStatementToCsv(report));
  })
);

// PUT /api/tax/settings/2026-27  { slabRate, surchargePercent, advanceTaxPaid }
router.put(
  '/settings/:fy',
  asyncHandler(async (req, res) => {
    const fy = fyParam(req.params.fy);
    const updates = taxSettingsSchema.parse(req.body);
    await saveTaxSettings(req.user.id, fy, updates);
    res.json(await buildTaxReport(req.user.id, fy));
  })
);

// DELETE /api/tax/sales/:id  - undo a sale entered by mistake (restores the holding)
router.delete(
  '/sales/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Sale not found');
    await undoSale(req.user.id, req.params.id);
    res.status(204).end();
  })
);

export default router;
