import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { getPortfolioSummary } from '../data/investmentTypes';

const PortfolioContext = createContext(null);

export function PortfolioProvider({ children }) {
  const { user } = useAuth();
  const [investments, setInvestments] = useState([]);
  const [history, setHistory] = useState([]);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState(null);
  const [staleCount, setStaleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hideBalance, setHideBalance] = useState(false);

  const applyList = (res) => {
    setInvestments(res.investments);
    setPricesUpdatedAt(res.pricesUpdatedAt);
    setStaleCount(res.staleCount);
  };

  const load = useCallback(async () => {
    const [list, hist] = await Promise.all([api.listInvestments(), api.history('ALL')]);
    applyList(list);
    setHistory(hist.points);
  }, []);

  // (Re)load whenever the signed-in user changes; clear everything on logout.
  useEffect(() => {
    if (!user) {
      setInvestments([]);
      setHistory([]);
      setPricesUpdatedAt(null);
      setStaleCount(0);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => getPortfolioSummary(investments), [investments]);

  // Returns the API response so the form can show a "price pending" warning.
  const addInvestment = async (payload) => {
    const res = await api.createInvestment(payload);
    await load();
    return res;
  };

  const removeInvestment = async (id) => {
    await api.deleteInvestment(id);
    await load();
  };

  // Record a sale; the holding shrinks or disappears, so reload everything.
  const sellInvestment = async (id, payload) => {
    const res = await api.sellInvestment(id, payload);
    await load();
    return res;
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      applyList(await api.refreshPrices());
      setHistory((await api.history('ALL')).points);
    } finally {
      setRefreshing(false);
    }
  };

  const getInvestmentsByType = (type) =>
    type === 'all' ? investments : investments.filter((inv) => inv.type === type);

  return (
    <PortfolioContext.Provider
      value={{
        investments,
        history,
        user,
        summary,
        loading,
        error,
        refreshing,
        pricesUpdatedAt,
        staleCount,
        hideBalance,
        setHideBalance,
        addInvestment,
        removeInvestment,
        sellInvestment,
        reload: load,
        refreshPrices,
        getInvestmentsByType,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}
