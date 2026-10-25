const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Formats an API money value (a decimal string like "283.55") as "$283.55". */
export function formatMoney(value: string | number): string {
  return usd.format(Number(value))
}

/** A user-typed amount: digits with up to two decimals, e.g. "12", "12.5", "1,250.00". */
export function parseMoneyInput(input: string): string | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? cleaned : null
}
