import type { LogEntry, Nutrient } from './api'

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

/** "1234.5" + mg → "1,234.5 mg"; calories read "250 kcal". */
export function formatNutrient(value: string | number, nutrient: Pick<Nutrient, 'unit'>): string {
  return `${number.format(Number(value))} ${nutrient.unit}`
}

/** A food's standard amount, e.g. "100 g", "1 tbsp", "0.5 cup". */
export function formatQuantity(amount: string | number, unit: string): string {
  return `${quantity.format(Number(amount))} ${unit}`
}

/** How much of a food was eaten: "1.2 × 100 g = 120 g", or "2 × 1 egg". */
export function describeServing(servings: string | number, standardQuantity: string, unit: string): string {
  const s = Number(servings)
  const total = s * Number(standardQuantity)
  if (s === 1) return formatQuantity(standardQuantity, unit)
  if (Number(standardQuantity) === 1) return `${quantity.format(s)} × ${formatQuantity(1, unit)}`
  return `${quantity.format(s)} × ${formatQuantity(standardQuantity, unit)} = ${formatQuantity(total, unit)}`
}

/** A log entry's amount, or "Quick add" for a one-off entry (it has no standard quantity). */
export function describeEntry(entry: LogEntry): string {
  if (entry.standard_quantity == null || entry.standard_unit == null) return 'Quick add'
  return describeServing(entry.servings, entry.standard_quantity, entry.standard_unit)
}

/** Common units offered as suggestions (free text is still allowed). */
export const UNIT_SUGGESTIONS = ['g', 'oz', 'ml', 'fl oz', 'cup', 'tbsp', 'tsp', 'piece', 'slice', 'serving', 'scoop', 'lb']
