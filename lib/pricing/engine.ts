export function proposePriceDelta(utilizationRate: number, targetRate = 0.72) {
  const diff = utilizationRate - targetRate;
  const change = Math.max(-0.15, Math.min(0.15, diff * 0.2));
  return Number(change.toFixed(4));
}
