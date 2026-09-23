// Phase 4 (Billing Control Center): shared currency formatting so every
// billing page renders amounts the same way rather than each hand-rolling
// its own Intl.NumberFormat call or (worse) printing a raw number.
export function formatCurrency(amount: number | string, currency: string = "INR"): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}
