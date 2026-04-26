// Client-side catalog duplicate for Telegram Mini Apps (M1 calculator, future M2
// reorder). Source of truth is trainersource-bot/src/catalog.ts — if you change
// one, change the other. TODO-CATALOG-UNIFY tracks extracting to a shared
// workspace package.

export type PeptideCategory = "metabolic" | "cognitive" | "performance";

export type Product = {
  sku: string;
  name: string;
  category: PeptideCategory;
  price: string;
  cas: string;
  urlPath: string;
  notes: string;
  imagePath: string | null;
  vialMg: number;
};

export const CATALOG: Product[] = [
  { sku: "UP-RETA-10MG", name: "Retatrutide",          category: "metabolic",   price: "$180–230", cas: "2381089-83-2", urlPath: "/retatrutide-reta/", notes: "Triple agonist (GLP-1/GIP/glucagon)", imagePath: null, vialMg: 10 },
  { sku: "UP-SEMA",      name: "Semaglutide",          category: "metabolic",   price: "$89.99",   cas: "910463-68-2",  urlPath: "/semaglutide/",      notes: "GLP-1 receptor agonist",              imagePath: null, vialMg: 5  },
  { sku: "UP-TIRZ",      name: "Tirzepatide",          category: "metabolic",   price: "$110.00",  cas: "2023788-19-2", urlPath: "/tirzepatide/",      notes: "Dual GLP-1/GIP agonist",              imagePath: null, vialMg: 10 },
  { sku: "UP-EPITH",     name: "Epithalon",            category: "cognitive",   price: "$340.00",  cas: "307297-39-8",  urlPath: "/epithalon/",        notes: "Telomerase activator peptide",        imagePath: null, vialMg: 10 },
  { sku: "UP-SELANK",    name: "Selank",               category: "cognitive",   price: "$150.00",  cas: "129954-34-3",  urlPath: "/selank/",           notes: "Anxiolytic peptide",                  imagePath: null, vialMg: 10 },
  { sku: "UP-SEMAX",     name: "Semax",                category: "cognitive",   price: "$140.00",  cas: "80714-61-0",   urlPath: "/semax/",            notes: "Nootropic heptapeptide",              imagePath: null, vialMg: 10 },
  { sku: "UP-BPC157",    name: "BPC-157 + TB-500",     category: "performance", price: "$180.00",  cas: "137525-51-0",  urlPath: "/bpc-157-tb-500/",   notes: "Combo peptide formulation",           imagePath: null, vialMg: 10 },
  { sku: "UP-IPAM",      name: "Ipamorelin",           category: "performance", price: "$140.00",  cas: "170851-70-4",  urlPath: "/ipamorelin/",       notes: "Growth hormone secretagogue",         imagePath: null, vialMg: 5  },
  { sku: "UP-TB500",     name: "TB-500",               category: "performance", price: "$54.99",   cas: "77591-33-4",   urlPath: "/tb-500/",           notes: "Thymosin beta-4 fragment",            imagePath: null, vialMg: 5  },
  { sku: "UP-GHKCU",     name: "GHK-Cu",               category: "performance", price: "$120.00",  cas: "89030-95-5",   urlPath: "/ghk-cu/",           notes: "Copper tripeptide",                   imagePath: null, vialMg: 50 },
  { sku: "UP-CJC1295",   name: "CJC-1295",             category: "performance", price: "$360.00",  cas: "863288-34-0",  urlPath: "/cjc-1295/",         notes: "GHRH analog",                         imagePath: null, vialMg: 5  },
  { sku: "UP-TESA",      name: "Tesamorelin",          category: "performance", price: "$390.00",  cas: "218949-48-5",  urlPath: "/tesamorelin/",      notes: "GHRH analog",                         imagePath: null, vialMg: 10 },
];

export function getProduct(sku: string): Product | undefined {
  return CATALOG.find((p) => p.sku === sku);
}
