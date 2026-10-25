/**
 * Odoo stores many category names in capitals ("CAR ACCESSORIES"). For filter chips and headings we
 * show those in sentence case ("Car accessories"); names that already have lowercase letters (and
 * short acronyms) are left untouched.
 */
export function sentenceCase(label: string): string {
  const letters = label.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || label !== label.toUpperCase()) return label;
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
