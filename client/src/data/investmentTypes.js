export const INVESTMENT_TYPES = {
  stocks: {
    id: 'stocks',
    label: 'Stocks',
    icon: 'TrendingUp',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    description: 'NSE & BSE listed equities',
  },
  mutual_fund: {
    id: 'mutual_fund',
    label: 'Mutual Funds',
    icon: 'PieChart',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    description: 'SIP & lump sum investments',
  },
  fixed_deposit: {
    id: 'fixed_deposit',
    label: 'Fixed Deposit',
    icon: 'Landmark',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    description: 'Bank & NBFC FDs',
  },
  gold: {
    id: 'gold',
    label: 'Gold',
    icon: 'Gem',
    color: '#EAB308',
    bgColor: '#FEFCE8',
    description: 'SGB, Gold ETF & Physical',
  },
  real_estate: {
    id: 'real_estate',
    label: 'Real Estate',
    icon: 'Building2',
    color: '#10B981',
    bgColor: '#ECFDF5',
    description: 'Property & REITs',
  },
  bonds: {
    id: 'bonds',
    label: 'Bonds',
    icon: 'FileText',
    color: '#6366F1',
    bgColor: '#EEF2FF',
    description: 'Govt & Corporate bonds',
  },
};

export function getPortfolioSummary(investments) {
  const totalInvested = investments.reduce((sum, inv) => sum + (inv.invested || 0), 0);
  const totalCurrent = investments.reduce((sum, inv) => sum + (inv.current || 0), 0);
  const totalGain = totalCurrent - totalInvested;
  const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  // Sum of each holding's change since the previous close (computed by the server).
  const dayChange = investments.reduce((sum, inv) => sum + (inv.dayChange || 0), 0);
  const previousValue = totalCurrent - dayChange;
  const dayChangePercent = previousValue > 0 ? (dayChange / previousValue) * 100 : 0;

  const allocation = {};
  investments.forEach((inv) => {
    if (!allocation[inv.type]) {
      allocation[inv.type] = { type: inv.type, value: 0, count: 0 };
    }
    allocation[inv.type].value += inv.current || 0;
    allocation[inv.type].count += 1;
  });

  return {
    totalInvested,
    totalCurrent,
    totalGain,
    totalGainPercent,
    dayChange,
    dayChangePercent,
    allocation: Object.values(allocation).map((a) => ({
      ...a,
      ...INVESTMENT_TYPES[a.type],
      percentage: totalCurrent > 0 ? (a.value / totalCurrent) * 100 : 0,
    })),
  };
}
