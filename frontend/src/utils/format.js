export const fmt = (n, d = 8) => parseFloat(parseFloat(n || 0).toFixed(d));

export const fmtK = (n) => {
  const num = parseFloat(n || 0);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num;
};
