import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { PortfolioProvider } from '../context/PortfolioContext';

const USER = { id: 'u1', name: 'Rahul', email: 'r@example.com', phone: '', pan: '', memberSince: 'Sep 2026' };
const TCS = { id: 'h1', type: 'stocks', name: 'TCS', symbol: 'TCS', quantity: 10, invested: 38000, current: 41000, dayChange: 0, priceStatus: 'ok', purchaseDate: '2024-03-15' };
const FD = { id: 'h2', type: 'fixed_deposit', name: 'HDFC FD', invested: 100000, current: 104000, dayChange: 10, priceStatus: 'ok' };
const MF = { id: 'h3', type: 'mutual_fund', name: 'Some Fund', units: 100, invested: 6000, current: 7000, dayChange: 0, priceStatus: 'ok', purchaseDate: '2024-03-01' };
const GOLD = { id: 'h4', type: 'gold', name: 'Gold coin', grams: 10, invested: 60000, current: 90000, dayChange: 0, priceStatus: 'ok', purchaseDate: '2025-06-01' };

const SALE = {
  saleId: 's1', name: 'Reliance Industries', type: 'stocks', taxKind: 'listed_equity', taxClass: 'EQ_LTCG', term: 'long',
  purchaseDate: '2023-01-10', saleDate: '2026-08-01', holdingMonths: 42, saleValue: 300000, expenses: 0, cost: 100000, costUsed: 100000,
  gain: 200000, method: 'standard', notes: ['Cost stepped up to the 31 Jan 2018 value (grandfathering).'], warnings: [],
};
const reportFor = (fy, sales = [SALE]) => ({
  fy, period: { start: '2026-04-01', end: '2027-03-31' }, rulesVersion: 'test',
  settings: { slabRate: 30, surchargePercent: 0, advanceTaxPaid: 0, isDefault: true },
  sales,
  summary: { saleCount: sales.length, totalSaleValue: 300000, totalCost: 100000, netGain: sales.length ? 200000 : 0, exemptGain: 0 },
  tax: {
    lines: sales.length
      ? [{ taxClass: 'EQ_LTCG', label: 'Long-term: listed equity / equity funds', term: 'LT', rate: 12.5, netGain: 200000, afterSetOff: 200000, taxableGain: 75000, tax: 9375, surcharge: 0 }]
      : [],
    setOff: [], exemptionUsed: sales.length ? 125000 : 0, exemptionRemaining: sales.length ? 0 : 125000,
    carryForward: { shortTerm: 0, longTerm: 0 }, basicTax: 9375, surcharge: 0, cess: 375, totalTax: 9750, payable: sales.length ? 9750 : 0,
  },
  advanceTax: {
    threshold: 10000, belowThreshold: true, taxOnGainsToDate: 9750, paid: 0, balanceNow: 9750, nextDueDate: '2026-12-15', fyEnded: false, selfAssessmentDue: null,
    schedule: [
      { dueDate: '2026-09-15', label: 'By 2026-09-15', cumulativeDue: 9750, instalmentDue: 9750, status: 'past' },
      { dueDate: '2026-12-15', label: 'By 2026-12-15', cumulativeDue: 9750, instalmentDue: 0, status: 'upcoming' },
    ],
  },
  planning: {
    ltcgExemptionRemaining: 0,
    gainCandidates: [],
    lossCandidates: [{ id: 'h9', name: 'Infosys', unrealisedLoss: 10000, term: 'short', taxSaving: 1872 }],
    note: 'Ideas only.',
  },
  warnings: ['Some gains are taxed at your slab rate. You haven\'t set yours, so 30% is assumed - set your actual rate above.'],
  disclaimer: 'This is an ESTIMATE for a resident individual. It is not tax advice.',
});

let calls, holdings, sales;
const json = (status, body) => Promise.resolve({ ok: status < 300, status, headers: new Headers(), json: async () => body, blob: async () => new Blob(['csv']) });

function fakeFetch(url, init = {}) {
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, url, body });
  const path = url.replace('/api', '');
  if (path === '/auth/me') return json(200, { user: USER });
  if (path === '/investments') return json(200, { investments: holdings, pricesUpdatedAt: null, staleCount: 0 });
  if (path.startsWith('/portfolio/history')) return json(200, { range: 'ALL', points: [] });
  if (path.match(/^\/investments\/\w+\/sell$/) && method === 'POST') {
    if (body.salePricePerUnit === '1') return json(400, { message: 'Sale date cannot be before the purchase date' });
    return json(201, { sale: { id: 's1' }, holding: null });
  }
  if (path.startsWith('/tax/report.csv')) {
    return Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'Content-Disposition': 'attachment; filename="wealthtrack-capital-gains-2026-27.csv"' }), blob: async () => new Blob(['x']) });
  }
  if (path.startsWith('/tax/report')) return json(200, reportFor(decodeURIComponent(path.split('fy=')[1]), sales));
  if (path.startsWith('/tax/settings/') && method === 'PUT') {
    const r = reportFor('2026-27', sales);
    r.settings = { slabRate: Number(body.slabRate), surchargePercent: Number(body.surchargePercent), advanceTaxPaid: Number(body.advanceTaxPaid), isDefault: false };
    r.warnings = [];
    return json(200, r);
  }
  if (path.startsWith('/tax/sales/') && method === 'DELETE') { sales = []; return json(204, null); }
  return json(404, { message: `unmocked ${method} ${path}` });
}

const renderApp = (route) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider><PortfolioProvider><App /></PortfolioProvider></AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.setItem('wealthtrack_token', 'tok');
  calls = []; holdings = [TCS, FD, MF, GOLD]; sales = [SALE];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('alert', vi.fn());
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Sell dialog', () => {
  it('offers Sell on tradable holdings but not on fixed deposits', async () => {
    renderApp('/investments');
    await screen.findByText('TCS', { selector: 'h3' });
    expect(screen.getAllByRole('button', { name: /Sell/ })).toHaveLength(3); // TCS, MF, gold - not the FD
  });

  it('records a full sale: sends price per unit, dates and expenses, then confirms', async () => {
    const user = userEvent.setup();
    renderApp('/investments');
    await screen.findByText('TCS', { selector: 'h3' });
    await user.click(within(screen.getByText('TCS', { selector: 'h3' }).closest('.card')).getByRole('button', { name: /Sell/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Sell TCS' });
    expect(within(dialog).getByText(/you hold 10 shares/)).toBeTruthy();
    // purchase date is shown and prefilled - it decides short/long term
    expect(dialog.querySelector('input[type="date"][max]:not([min])').value).toBe('2024-03-15');

    await user.type(within(dialog).getByPlaceholderText('3000'), '4200');
    await user.type(within(dialog).getByPlaceholderText('0'), '60');
    expect(within(dialog).getByText('₹42,000')).toBeTruthy(); // 10 x 4,200 live total
    await user.click(within(dialog).getByRole('button', { name: 'Record sale' }));

    expect(await screen.findByText(/Sale of TCS recorded/)).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/investments/h1/sell');
    expect(post.body).toMatchObject({ salePricePerUnit: '4200', expenses: '60', purchaseDate: '2024-03-15' });
    expect(post.body).not.toHaveProperty('quantity'); // sell-all sends no quantity
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('partial sale sends the quantity', async () => {
    const user = userEvent.setup();
    renderApp('/investments');
    await screen.findByText('TCS', { selector: 'h3' });
    await user.click(within(screen.getByText('TCS', { selector: 'h3' }).closest('.card')).getByRole('button', { name: /Sell/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.type(within(dialog).getByPlaceholderText('How many shares?'), '4');
    await user.type(within(dialog).getByPlaceholderText('3000'), '4000');
    expect(within(dialog).getByText('₹16,000')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Record sale' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/investments/h1/sell')).toBe(true));
    expect(calls.find((c) => c.url === '/api/investments/h1/sell').body).toMatchObject({ quantity: '4', salePricePerUnit: '4000' });
  });

  it('asks for the tax subtype where it matters, and shows server errors', async () => {
    const user = userEvent.setup();
    renderApp('/investments');
    await screen.findByText('Some Fund', { selector: 'h3' });
    await user.click(within(screen.getByText('Some Fund', { selector: 'h3' }).closest('.card')).getByRole('button', { name: /Sell/ }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Fund category *')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await user.click(within(screen.getByText('Gold coin', { selector: 'h3' }).closest('.card')).getByRole('button', { name: /Sell/ }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Type of gold *')).toBeTruthy();

    // server-side rejection is displayed inside the dialog
    await user.selectOptions(within(dialog).getByRole('combobox'), 'physical');
    await user.type(within(dialog).getByPlaceholderText('3000'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Record sale' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/before the purchase date/);
    expect(screen.queryByText(/Sale of Gold coin recorded/)).toBeNull();

    // and the browser itself stops sale dates earlier than the supported rules
    expect(dialog.querySelector('input[type="date"][min="2024-07-23"]')).toBeTruthy();
  });
});

describe('Tax Centre', () => {
  it('shows the estimate, breakdown, payment schedule, booked sales and planning ideas', async () => {
    renderApp('/tax');
    expect(await screen.findByText('Tax Centre')).toBeTruthy();
    expect(screen.getByText(/It is not tax advice/)).toBeTruthy();

    await screen.findByText('Reliance Industries');
    expect(screen.getAllByText('₹9,750').length).toBeGreaterThan(0); // estimated tax
    expect(screen.getAllByText('+₹2,00,000').length).toBeGreaterThan(0); // net gain, Indian digit grouping
    expect(screen.getByText('Long-term')).toBeTruthy();
    expect(screen.getByText(/Cost stepped up/)).toBeTruthy();
    expect(screen.getByText('15 Sep 2026')).toBeTruthy(); // schedule
    expect(screen.getByText(/Pay by 15 Dec 2026/)).toBeTruthy();
    expect(screen.getByText(/30% is assumed/, { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Infosys')).toBeTruthy();
    expect(screen.getByText('₹1,872')).toBeTruthy(); // loss-harvest saving
  });

  it('saves the slab rate and refreshes the numbers', async () => {
    const user = userEvent.setup();
    renderApp('/tax');
    await screen.findByText('Reliance Industries');
    await user.selectOptions(screen.getByLabelText('Slab rate'), '20');
    await user.type(screen.getByLabelText(/Tax already paid/), '4000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT').body).toMatchObject({ slabRate: '20', advanceTaxPaid: '4000' });
    await waitFor(() => expect(screen.queryByText(/30% is assumed/, { selector: 'p' })).toBeNull());
  });

  it('undoing a sale calls the API and reloads', async () => {
    const user = userEvent.setup();
    renderApp('/tax');
    await user.click(await screen.findByRole('button', { name: 'Undo sale of Reliance Industries' }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/tax/sales/s1')).toBe(true));
    expect(await screen.findByText(/No sales recorded for this year/)).toBeTruthy();
  });

  it('exports the statement through an authenticated request', async () => {
    const user = userEvent.setup();
    renderApp('/tax');
    await screen.findByText('Reliance Industries');
    await user.click(screen.getByTitle(/Download capital-gains statement/));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(calls.find((c) => c.url.includes('/tax/report.csv')).url).toMatch(/fy=\d{4}-\d{2}$/);
  });

  it('lets you switch financial year', async () => {
    const user = userEvent.setup();
    renderApp('/tax');
    await screen.findByText('Reliance Industries');
    const select = screen.getByLabelText('Financial year');
    expect([...select.options].map((o) => o.value).at(-1)).toBe('2024-25');
    await user.selectOptions(select, '2024-25');
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tax/report?fy=2024-25')).toBe(true));
  });
});
