import { z } from 'zod';
import { blankToUndefined, isoDate, nonNegative, optNumber, positive } from './investment.js';

export const sellSchema = z.object({
  // Confirm/correct when the asset was bought: it decides short-term vs long-term.
  purchaseDate: z.preprocess(blankToUndefined, isoDate.optional()),
  // omitted => sell the whole holding
  quantity: optNumber(positive('Quantity')),
  saleDate: z.preprocess(blankToUndefined, z.string({ required_error: 'Sale date is required' }).pipe(isoDate)),
  // give EITHER the price per unit OR the total amount received
  salePricePerUnit: optNumber(positive('Sale price')),
  saleAmount: optNumber(positive('Sale amount')),
  expenses: optNumber(nonNegative('Expenses')),
  // tax subtype - which one is needed depends on the holding type
  fundCategory: z.preprocess(blankToUndefined, z.enum(['equity', 'debt', 'other']).optional()),
  goldForm: z.preprocess(blankToUndefined, z.enum(['physical', 'etf', 'sgb_maturity', 'sgb_exchange']).optional()),
  bondListing: z.preprocess(blankToUndefined, z.enum(['listed', 'unlisted']).optional()),
  // equity bought before 1 Feb 2018: per-unit price on 31 Jan 2018 (grandfathering)
  fmv31Jan2018PerUnit: optNumber(nonNegative('31 Jan 2018 price')),
});

export const taxSettingsSchema = z.object({
  slabRate: z.coerce.number().min(0, 'Slab rate must be 0-30').max(30, 'Slab rate must be 0-30').optional(),
  surchargePercent: z.coerce.number().min(0).max(37).optional(),
  advanceTaxPaid: z.coerce.number().min(0, 'Amount cannot be negative').optional(),
});
