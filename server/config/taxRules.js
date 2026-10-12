/**
 * Indian capital-gains rules used by the Tax Centre - ALL numbers live here so
 * they can be updated (Budget changes) without touching any logic.
 *
 * Basis: Finance (No. 2) Act 2024 (transfers on/after 23 Jul 2024) as amended by
 * Finance Act 2025, for a resident individual. Section numbers below are from the
 * Income-tax Act, 1961; the Income-tax Act, 2025 (in force from 1 Apr 2026)
 * renumbers them but this file assumes the rates and periods are carried over.
 * >>> Re-verify every value here at the start of each financial year. <<<
 */
export const TAX_RULES = {
  version: 'Finance (No.2) Act 2024 + Finance Act 2025 (verify for the current year)',

  // Sales before this date were taxed under the older 15% / 10% / indexation regime.
  minSaleDate: '2024-07-23',

  cessPercent: 4, // health & education cess on tax + surcharge
  roundTaxToNearest: 10, // s.288B: tax payable is rounded to the nearest ₹10
  advanceTaxThreshold: 10000, // no advance tax if total tax liability < ₹10,000

  // Listed equity shares & equity-oriented mutual funds (STT paid): s.111A / s.112A
  equity: {
    longTermMonths: 12,
    stcgRate: 20,
    ltcgRate: 12.5,
    ltcgExemption: 125000, // per financial year, on LTCG under s.112A
  },

  // Holding period beyond which other assets are long-term
  longTermMonths: {
    listed: 12, // listed securities: gold ETFs, listed bonds, SGB on exchange
    unlisted: 24, // property, physical gold, debt/other mutual funds
  },
  ltcgRate: 12.5, // s.112, no indexation
  // Property bought before 23 Jul 2024 may alternatively use 20% with indexation
  // (resident individual / HUF only) - whichever gives lower tax.
  indexedRate: 20,
  indexationCutoff: '2024-07-23',

  // Equity acquired before 1 Feb 2018: cost = max(actual, min(FMV on 31 Jan 2018, sale value))
  grandfatherCutoff: '2018-02-01',

  // Debt mutual funds acquired on/after this date: gains are ALWAYS short-term, taxed at slab (s.50AA)
  debtFundCutoff: '2023-04-01',

  // Surcharge on capital gains taxed at special rates is capped at 15%
  surchargeCapSpecialRate: 15,

  // Cost Inflation Index by financial-year START year (2001 = FY 2001-02).
  // FY 2026-27 is null: set it once CBDT notifies it. Until then the indexation
  // option for property sold in that year is not evaluated (and the report says so).
  cii: {
    2001: 100, 2002: 105, 2003: 109, 2004: 113, 2005: 117, 2006: 122, 2007: 129,
    2008: 137, 2009: 148, 2010: 167, 2011: 184, 2012: 200, 2013: 220, 2014: 240,
    2015: 254, 2016: 264, 2017: 272, 2018: 280, 2019: 289, 2020: 301, 2021: 317,
    2022: 331, 2023: 348, 2024: 363, 2025: 376, 2026: null,
  },
};

/** How each `taxKind` (chosen when recording a sale) is treated. */
export const TAX_KINDS = {
  listed_equity: 'Listed equity shares',
  equity_mf: 'Equity-oriented mutual fund (65%+ domestic equity)',
  debt_mf: 'Debt mutual fund (65%+ debt & money market)',
  other_mf: 'Other mutual fund (hybrid, international, gold/silver fund of funds)',
  gold_etf: 'Gold ETF (listed)',
  gold_physical: 'Physical / digital gold',
  sgb_maturity: 'Sovereign Gold Bond redeemed at maturity',
  sgb_exchange: 'Sovereign Gold Bond sold on exchange',
  property: 'Land / building',
  bond_listed: 'Listed bond / debenture',
  bond_unlisted: 'Unlisted bond / debenture',
};
