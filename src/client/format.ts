/** Cost display: sub-cent amounts keep enough digits to stay non-zero. */
export const fmtCost = (cost: number): string => cost.toLocaleString(undefined, {
  minimumFractionDigits: cost > 0 && cost < 0.01 ? 4 : 2,
  maximumFractionDigits: cost > 0 && cost < 0.01 ? 6 : 4,
})
