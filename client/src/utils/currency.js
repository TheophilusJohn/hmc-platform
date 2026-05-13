export function formatINR(amount) {
  if (amount == null) return '₹0';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount));
}

export function formatUSD(amount) {
  if (amount == null) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(amount));
}

export function formatCurrency(amount, currency = 'INR') {
  return currency === 'USD' ? formatUSD(amount) : formatINR(amount);
}

export function formatNumber(num) {
  return new Intl.NumberFormat('en-IN').format(num);
}
