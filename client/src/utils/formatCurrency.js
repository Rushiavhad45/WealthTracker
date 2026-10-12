/** Format number as Indian Rupees */
export function formatINR(amount, options = {}) {
  const { compact = false, showSign = false } = options;

  if (amount == null || isNaN(amount)) return '₹0';

  const sign = amount >= 0 ? '+' : '-';
  const abs = Math.abs(amount);

  if (compact) {
    if (abs >= 10000000) return `${showSign && amount !== 0 ? sign : ''}₹${(abs / 10000000).toFixed(2)} Cr`;
    if (abs >= 100000) return `${showSign && amount !== 0 ? sign : ''}₹${(abs / 100000).toFixed(2)} L`;
    if (abs >= 1000) return `${showSign && amount !== 0 ? sign : ''}₹${(abs / 1000).toFixed(1)}K`;
  }

  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(abs);

  return showSign && amount !== 0 ? `${sign}${formatted.replace('₹', '₹')}` : formatted;
}

/** Format percentage */
export function formatPercent(value, showSign = true) {
  if (value == null || isNaN(value)) return '0%';
  const sign = value >= 0 ? '+' : '';
  return showSign ? `${sign}${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
}

/** Indian number system (lakhs/crores) */
export function formatIndianNumber(num) {
  return new Intl.NumberFormat('en-IN').format(num);
}

/** Calculate returns */
export function calculateReturns(current, invested) {
  const gain = current - invested;
  const percent = invested > 0 ? (gain / invested) * 100 : 0;
  return { gain, percent };
}

/** Get greeting based on time */
export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
