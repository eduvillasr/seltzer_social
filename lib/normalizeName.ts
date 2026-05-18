// lib/normalizeName.ts
//
// Canonical name normalization for drinks. Mirrors
// supabase_standardize_data.sql so client and DB agree on the canonical
// form. Used by:
//   - findOrCreateSeltzer (so a user typing "AHA Lime + Watermelon" winds
//     up matching the canonical "AHA Lime Watermelon")
//   - the add-new-drink form in /create (warn or auto-clean the input)
//
// Rules (kept tight, no surprises):
//   1. " + " (plus surrounded by spaces) → " " (single space)
//   2. Specific hyphenated flavor pairs become plain spaces:
//        "Razz-Cranberry"  → "Razz Cranberry"
//        "Lemon-Lime"      → "Lemon Lime"
//      Real words with dashes (Half-and-Half, Pesca-Tea) are preserved.
//   3. Smart quotes/apostrophes (’ ‘ " ") → straight ASCII versions.
//   4. Collapse multiple spaces. Trim.

const HYPHEN_PAIRS_TO_NORMALIZE = new Set<string>([
  'razz-cranberry',
  'lemon-lime',
]);

export function normalizeBrand(input: string): string {
  return collapseAndTrim(replaceSmartQuotes(input));
}

export function normalizeName(input: string): string {
  let s = replaceSmartQuotes(input);
  // " + " → " "
  s = s.split(' + ').join(' ');
  // Specific hyphenated flavor pairs → spaces. We only convert pairs we've
  // whitelisted so we don't accidentally mangle "Half-and-Half".
  s = s
    .split(/\s+/)
    .map((token) => {
      if (HYPHEN_PAIRS_TO_NORMALIZE.has(token.toLowerCase())) {
        return token.replace(/-/g, ' ');
      }
      return token;
    })
    .join(' ');
  return collapseAndTrim(s);
}

export function normalizeBrandAndName(
  brand: string,
  name: string,
): { brand: string; name: string } {
  return { brand: normalizeBrand(brand), name: normalizeName(name) };
}

function replaceSmartQuotes(s: string): string {
  return s
    .replace(/[‘’]/g, "'") // ‘ ’
    .replace(/[“”]/g, '"') // “ ”
    .replace(/–|—/g, '-'); // – —
}

function collapseAndTrim(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
