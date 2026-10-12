import { TAX_RULES as R } from '../../config/taxRules.js';
import { advanceTaxDates, fyBounds } from '../../utils/fy.js';
import { computeTax } from './engine.js';

/**
 * Advance-tax schedule for capital gains.
 *
 * Capital gains are not predictable, so the rule is: tax on gains realised up to
 * an instalment date is due by that date; gains realised after it are covered by
 * the remaining instalments (last date 31 Mar) with no interest. So we compute
 * "tax on gains realised up to <date>" at each checkpoint.
 */
export function buildAdvanceTax({ startYear, rows, settings, today }) {
  const { end } = fyBounds(startYear);
  const taxUpTo = (date) => computeTax(rows.filter((r) => r.saleDate <= date), settings).totalTax;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const checkpoints = [
    ...advanceTaxDates(startYear).map((d) => ({ date: d.date, label: `By ${d.date}`, percentOfEstimate: d.cumulativePercent })),
    { date: end, label: 'By 31 Mar (gains after 15 Mar)', percentOfEstimate: null },
  ];

  const total = computeTax(rows, settings).totalTax;
  let prev = 0;
  const schedule = [];
  for (const c of checkpoints) {
    const cumulative = Math.max(prev, taxUpTo(c.date));
    const instalment = round2(cumulative - prev);
    // Skip the extra 31-Mar row when nothing was realised after 15 Mar
    if (c.percentOfEstimate === null && instalment === 0) continue;
    schedule.push({
      dueDate: c.date,
      label: c.label,
      cumulativeDue: round2(cumulative),
      instalmentDue: instalment,
      status: c.date < today ? 'past' : 'upcoming',
    });
    prev = cumulative;
  }

  const asOf = today < end ? today : end;
  const taxToDate = taxUpTo(asOf);
  const paid = Number(settings.advanceTaxPaid || 0);
  const fyEnded = today > end;
  // s.288B: the amount payable is rounded to the nearest ₹10 (same figure as the report headline)
  const payableTotal = Math.round(total / R.roundTaxToNearest) * R.roundTaxToNearest;

  return {
    threshold: R.advanceTaxThreshold,
    belowThreshold: total < R.advanceTaxThreshold,
    schedule,
    taxOnGainsToDate: round2(taxToDate),
    paid: round2(paid),
    balanceNow: round2(Math.max(0, taxToDate - paid)),
    nextDueDate: fyEnded ? null : (schedule.find((s) => s.dueDate >= today)?.dueDate ?? null),
    fyEnded,
    // After the year ends, whatever is unpaid is "self-assessment tax" due before filing the ITR
    selfAssessmentDue: fyEnded ? round2(Math.max(0, payableTotal - paid)) : null,
  };
}
