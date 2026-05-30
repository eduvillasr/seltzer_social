// lib/normalizeName.ts
//
// Canonical name normalization for drinks. Mirrors the SQL migrations
// supabase_standardize_data.sql and supabase_strict_naming.sql so client
// and DB agree on the canonical form. Used by:
//   - findOrCreateSeltzer (any user-typed input is normalized before save)
//   - the add-new-drink form in /create (live preview + isValidName())
//
// FLAVOR-NAME rules (strict — there is exactly one canonical form):
//   1. Smart quotes → straight ASCII.
//   2. Any "+" character → space.
//   3. Any hyphen "-" or en/em-dash → space. NO exceptions.
//      "Half-and-Half" → "Half and Half". "Pesca-Tea" → "Pesca Tea".
//      "Blackberry-Cucumber" → "Blackberry Cucumber".
//      This means there's exactly one way to spell every drink.
//   4. Any "&" → "and".
//   5. Collapse multiple spaces. Trim.
//
// BRAND names are touched more lightly — brands like "Good & Gather",
// "Hal's New York", "365 by Whole Foods" are legit canonical spellings
// the brand owns. We just normalize whitespace + smart-quotes there.

export function normalizeBrand(input: string): string {
  return collapseAndTrim(replaceSmartQuotes(input));
}

export function normalizeName(input: string): string {
  let s = replaceSmartQuotes(input);
  // Replace every separator-shaped character with a space:
  s = s.replace(/[-+]/g, ' '); // - +
  s = s.replace(/&/g, 'and');  // "& " or "&" → "and"
  return collapseAndTrim(s);
}

/**
 * Standardize a flavor name *relative to its brand*. Run after normalizeName.
 *   - strips ®, ™, © glyphs
 *   - removes a leading repeat of the brand baked into the flavor name
 *     ("White Claw Black Cherry" with brand "White Claw" → "Black Cherry")
 * This collapses the common duplicate where one reviewer prefixes the brand
 * into the name and another doesn't.
 */
export function standardizeName(brand: string, name: string): string {
  let n = normalizeName(name).replace(/[®™©]/g, '');
  n = collapseAndTrim(n);
  const b = normalizeBrand(brand);
  if (b) {
    const bl = b.toLowerCase();
    if (n.toLowerCase().startsWith(bl + ' ')) {
      n = n.slice(b.length).trim();
    }
  }
  return n || normalizeName(name); // never return empty if the name was just the brand
}

/** Tokens of length >= 2 from a normalized string, lowercased. */
export function nameTokens(s: string): string[] {
  return s.toLowerCase().split(' ').map((t) => t.trim()).filter((t) => t.length >= 2);
}

function replaceSmartQuotes(s: string): string {
  return s
    .replace(/[‘’]/g, "'") // ‘ ’
    .replace(/[“”]/g, '"') // “ ”
    .replace(/–|—/g, '-'); // – — → - (then normalizeName strips it)
}

function collapseAndTrim(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
