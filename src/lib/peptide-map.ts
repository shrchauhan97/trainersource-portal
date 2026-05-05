// The classifier (Gemini) writes peptide_tags in mixed case as it sees them
// in forum posts ("BPC-157", "Tirzepatide", "ghk-cu"). Postgres array overlap
// is case-sensitive, so a slug → tag map needs to emit ALL plausible
// case variants of each canonical name to match what the classifier produced.
function caseVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const upper = name.toUpperCase();
  // Title-case each hyphen-separated component: bpc-157 → Bpc-157
  const title = lower.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
  // All-caps for acronymic names: bpc-157 → BPC-157
  const acronym = upper.replace(/-(\d+)/g, "-$1"); // numbers stay numbers
  return [...new Set([name, lower, upper, title, acronym])];
}

const CANONICAL: Record<string, string[]> = {
  "bpc-157": ["BPC-157"],
  "body-protective-compound-157": ["BPC-157"],
  "tb-500": ["TB-500"],
  "thymosin-beta-4": ["TB-500"],
  "epitalon": ["Epitalon"],
  "epithalon": ["Epitalon"],
  "ipamorelin": ["Ipamorelin"],
  "cjc-1295": ["CJC-1295"],
  "tesamorelin": ["Tesamorelin"],
  "semax": ["Semax"],
  "selank": ["Selank"],
  "ghk-cu": ["GHK-Cu"],
  "copper-peptide": ["GHK-Cu"],
  "mots-c": ["MOTS-c"],
  "ss-31": ["SS-31"],
  "elamipretide": ["SS-31"],
  "hexarelin": ["Hexarelin"],
  "retatrutide": ["Retatrutide"],
  "tirzepatide": ["Tirzepatide"],
  "aod-9604": ["AOD-9604"],
  "pt-141": ["PT-141"],
  "bremelanotide": ["PT-141"],
  "melanotan-2": ["Melanotan-2"],
  "kpv": ["KPV"],
  // BigCommerce product entries (verified against ultimate-peptides.com 2026-04-26).
  // The UP storefront accepts BOTH numeric IDs (/products/115) and slugs
  // (/products/bpc-157-tb-500/) — the homepage links use IDs but the
  // canonical URL for a product page is the slug. The widget script extracts
  // the LAST path segment, which is the slug when arriving from a search/menu.
  "112": ["Semaglutide"],
  "113": ["Tirzepatide"],
  "114": ["Retatrutide"],
  "115": ["BPC-157", "TB-500"],
  "118": ["Ipamorelin"],
  "121": ["Selank"],
  "123": ["GHK-Cu"],
  "124": ["Epitalon"],
  // Slug-only additions (rest already in the canonical block above):
  "bpc-157-tb-500": ["BPC-157", "TB-500"],
  "ipamorelin-10mg": ["Ipamorelin"],
};

export function slugToPeptideTags(slug: string): string[] {
  const canonicals = CANONICAL[slug.toLowerCase()];
  if (!canonicals) return [];
  return [...new Set(canonicals.flatMap(caseVariants))];
}
