import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { PortfolioProvider } from '../context/PortfolioContext';

/* ---------- a tiny fake API ---------- */
const USER = { id: 'u1', name: 'Rahul Sharma', email: 'rahul@example.com', phone: '', pan: '', memberSince: 'Sep 2026' };
const TCS = {
  id: 'h1', type: 'stocks', name: 'TCS', symbol: 'TCS', exchange: 'NSE', quantity: 10,
  invested: 38000, current: 41000, dayChange: 500, currentPrice: 4100, priceStatus: 'ok',
};
const STALE_FD = {
  id: 'h2', type: 'gold', name: 'Gold bar', grams: 5, invested: 30000, current: 32000, dayChange: 0, priceStatus: 'stale',
};

let holdings;
let calls;
let tokenValid;

function json(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    blob: async () => new Blob(['csv']),
  });
}

function fakeFetch(url, init = {}) {
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, url, body, auth: init.headers?.Authorization });
  const path = url.replace('/api', '');

  if (path === '/auth/login') {
    return body.password === 'right-password'
      ? json(200, { token: 'tok', user: USER })
      : json(401, { message: 'Invalid email or password' });
  }
  if (!tokenValid) return json(401, { message: 'Session expired. Please sign in again.' });

  if (path === '/auth/me') return json(200, { user: USER });
  if (path.startsWith('/investments/export.csv')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="wealthtrack-portfolio-2026-09-19.csv"' }),
      blob: async () => new Blob(['Type,Name']),
    });
  }
  if (path === '/investments' && method === 'GET') {
    return json(200, { investments: holdings, pricesUpdatedAt: '2026-09-18T18:00:00.000Z', staleCount: holdings.filter((h) => h.priceStatus === 'stale').length });
  }
  if (path === '/investments' && method === 'POST') {
    const created = { id: `n${holdings.length}`, ...body, current: body.invested, dayChange: 0, priceStatus: 'ok' };
    holdings = [created, ...holdings];
    return json(201, { investment: created });
  }
  if (path.startsWith('/investments/') && method === 'DELETE') {
    holdings = holdings.filter((h) => h.id !== path.split('/')[2]);
    return json(204, null);
  }
  if (path.startsWith('/portfolio/history')) {
    return json(200, { range: 'ALL', points: [{ date: '2026-09-17', invested: 68000, current: 70000 }, { date: '2026-09-18', invested: 68000, current: 73000 }] });
  }
  if (path.startsWith('/prices/mutual-funds/search')) {
    return json(200, { results: [{ schemeCode: '122639', name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' }] });
  }
  return json(404, { message: `unmocked ${method} ${path}` });
}

function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <PortfolioProvider>
          <App />
        </PortfolioProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  holdings = [TCS, STALE_FD];
  calls = [];
  tokenValid = true;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('alert', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const submitButton = async () =>
  (await screen.findAllByRole('button', { name: 'Sign in' })).find((b) => b.type === 'submit');

const signIn = async (user) => {
  await user.type(await screen.findByPlaceholderText('you@example.com'), 'rahul@example.com');
  await user.type(screen.getByPlaceholderText('Your password'), 'right-password');
  await user.click(await submitButton());
};

describe('authentication', () => {
  it('redirects signed-out visitors to the login page', async () => {
    renderApp('/investments');
    expect(await submitButton()).toBeTruthy();
    expect(calls.some((c) => c.url.includes('/investments'))).toBe(false); // no data fetched while signed out
  });

  it('shows the server error for bad credentials and stays on login', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.type(await screen.findByPlaceholderText('you@example.com'), 'rahul@example.com');
    await user.type(screen.getByPlaceholderText('Your password'), 'wrong');
    await user.click(await submitButton());
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password');
    expect(localStorage.getItem('wealthtrack_token')).toBeNull();
  });

  it('signs in, stores the JWT, and loads the dashboard from the API in INR', async () => {
    const user = userEvent.setup();
    renderApp();
    await signIn(user);

    expect(await screen.findByText('Total Portfolio Value')).toBeTruthy();
    expect(localStorage.getItem('wealthtrack_token')).toBe('tok');
    // 41,000 + 32,000 = ₹73,000 total; invested 68,000; day change +500
    await waitFor(() => expect(screen.getAllByText('₹73,000').length).toBeGreaterThan(0));
    expect(screen.getByText('₹68,000')).toBeTruthy();
    expect(screen.getByText(/\+₹500/)).toBeTruthy();
    // requests carry the bearer token
    expect(calls.filter((c) => c.url.includes('/investments')).every((c) => c.auth === 'Bearer tok')).toBe(true);
    // the old hard-coded mock number is gone
    expect(screen.queryByText(/12,450/)).toBeNull();
    expect(screen.getByText(/1 holding showing last known price/)).toBeTruthy();
  });

  it('restores a saved session on reload', async () => {
    localStorage.setItem('wealthtrack_token', 'tok');
    renderApp();
    expect(await screen.findByText('Total Portfolio Value')).toBeTruthy();
  });

  it('signs out automatically when the token has expired', async () => {
    localStorage.setItem('wealthtrack_token', 'expired');
    tokenValid = false;
    renderApp();
    expect(await submitButton()).toBeTruthy();
    expect(localStorage.getItem('wealthtrack_token')).toBeNull();
  });

  it('logout clears the session', async () => {
    const user = userEvent.setup();
    localStorage.setItem('wealthtrack_token', 'tok');
    renderApp('/profile');
    await user.click(await screen.findByRole('button', { name: /Logout/ }));
    expect(await submitButton()).toBeTruthy();
    expect(localStorage.getItem('wealthtrack_token')).toBeNull();
  });
});

describe('investments', () => {
  it('lists holdings, flags stale prices, and deletes via the API', async () => {
    const user = userEvent.setup();
    localStorage.setItem('wealthtrack_token', 'tok');
    renderApp('/investments');

    expect(await screen.findByText('TCS', { selector: 'h3' })).toBeTruthy();
    expect(screen.getByText(/showing last known value/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove TCS' }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('TCS', { selector: 'h3' })).toBeNull());
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/investments/h1')).toBe(true);
  });

  it('export button downloads via an authenticated request', async () => {
    const user = userEvent.setup();
    localStorage.setItem('wealthtrack_token', 'tok');
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    renderApp('/investments/stocks');
    await user.click(await screen.findByTitle('Download as CSV'));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const req = calls.find((c) => c.url.includes('export.csv'));
    expect(req.url).toBe('/api/investments/export.csv?type=stocks');
    expect(req.auth).toBe('Bearer tok');
  });

  it('add stock: sends only the fields the backend needs - no current value', async () => {
    const user = userEvent.setup();
    localStorage.setItem('wealthtrack_token', 'tok');
    renderApp('/add');

    await user.click(await screen.findByRole('button', { name: /Stocks/ }));
    await user.type(screen.getByPlaceholderText('RELIANCE'), 'infy');
    await user.type(screen.getByPlaceholderText('10'), '15');
    await user.type(screen.getByPlaceholderText('25000'), '22500');
    await user.click(screen.getByRole('button', { name: 'Add to Portfolio' }));

    expect(await screen.findByText('Investment Added!')).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/investments');
    expect(post.body).toMatchObject({ type: 'stocks', symbol: 'INFY', exchange: 'NSE', quantity: '15', invested: '22500' });
    expect(post.body).not.toHaveProperty('current');
    expect(post.body).not.toHaveProperty('name'); // blank optional name is not sent
  });

  it('add mutual fund: must pick a fund from search; sends its scheme code', async () => {
    const user = userEvent.setup();
    localStorage.setItem('wealthtrack_token', 'tok');
    renderApp('/add');

    await user.click(await screen.findByRole('button', { name: /Mutual Funds/ }));
    await user.type(screen.getByPlaceholderText('450.5'), '100');
    await user.type(screen.getByPlaceholderText('28000'), '6000');
    await user.click(screen.getByRole('button', { name: 'Add to Portfolio' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/select it from the list/);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await user.type(screen.getByPlaceholderText(/Parag Parikh Flexi Cap Direct Growth/), 'parag');
    await user.click(await screen.findByText('Parag Parikh Flexi Cap Fund - Direct Plan - Growth'));
    expect(screen.getByText('Scheme code 122639')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add to Portfolio' }));

    expect(await screen.findByText('Investment Added!')).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST');
    expect(post.body).toMatchObject({ type: 'mutual_fund', schemeCode: '122639', units: '100', invested: '6000' });
  });

  it('shows API validation errors inside the form', async () => {
    const user = userEvent.setup();
    localStorage.setItem('wealthtrack_token', 'tok');
    fetch.mockImplementationOnce(fakeFetch).mockImplementationOnce(fakeFetch).mockImplementationOnce(fakeFetch); // me, list, history
    renderApp('/add');
    await user.click(await screen.findByRole('button', { name: /Stocks/ }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/portfolio/history'))).toBe(true));
    fetch.mockImplementation((url, init) =>
      init?.method === 'POST' ? json(400, { message: 'No price data found for NOSUCH.NS' }) : fakeFetch(url, init)
    );
    await user.type(screen.getByPlaceholderText('RELIANCE'), 'NOSUCH');
    await user.type(screen.getByPlaceholderText('10'), '1');
    await user.type(screen.getByPlaceholderText('25000'), '100');
    await user.click(screen.getByRole('button', { name: 'Add to Portfolio' }));
    expect((await screen.findByRole('alert')).textContent).toBe('No price data found for NOSUCH.NS');
    expect(screen.queryByText('Investment Added!')).toBeNull();
  });
});
