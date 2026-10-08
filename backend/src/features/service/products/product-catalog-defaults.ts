import { DEFAULT_PRODUCT_TYPES } from './product-category-detection';

export const DEFAULT_PRODUCT_CATEGORIES = DEFAULT_PRODUCT_TYPES;
export const CSV_PRODUCT_FAMILIES = [
  'BEAUTY', 'BUILT IN', 'ELECTRONICS', 'GAMING', 'HOME APPLIANCES',
  'LIGHTS', 'SMALL APPLIANCES', 'TOOLS', 'WHITE',
] as const;

export const ALL_PRODUCT_IMPORT_BRANDS = '__ALL_BRANDS__';

export const DEFAULT_PRODUCT_BRANDS = [
  'ADMIRAL', 'AFIFA/QUALITEC', 'AGA', 'AGI', 'AI GENERAL', 'ANDOWL', 'ARISTON', 'ARTEL', 'AUX',
  'BABYVERSE', 'BARTALONI', 'BEKO', 'BERLINGER', 'BICCUL', 'BLUE TECH', 'BLUEBERRY', 'BRAUN', 'BUMIL',
  'CAMRY', 'CAMPOMATIC', 'CASIO', 'CCLAMP', 'CHIQ', 'CHN', 'CMIK', 'COBA', 'CONCORD', 'CONSTANT', 'CROWN',
  'DAEWOO', 'DESSINI', 'DINGLING', 'DORSCH', 'DREAM WAVE', 'DSP', 'DURACELL',
  'ELBA', 'ELECTRO', 'ELECTROLUX', 'ELEMENT', 'ELEMENTS', 'ELITE', 'FAKIR', 'FANSHINE', 'FRESH',
  'GD PLUS', 'GEEMY', 'GENE TECH', 'GENERAL', 'GENERAL CROME', 'GENERAL GOLD', 'GENERAL HUAWE', 'GENERAL OCEAN',
  'GIANT', 'GLEMGAS', 'GOLON', 'GORENJE', 'GSMART', 'HIMK', 'HISENSE', 'HITACHI', 'HOCO', 'HOFFMANS',
  'HONEYWELL', 'HOOVER', 'HOWWEAR', 'JAMAKY', 'JTC', 'KEMEI', 'KENWOOD', 'KORKMAZ', 'KOZANO', 'KUMTEL',
  'LA GERMANIA', 'LEBOSS', 'LENOVO', 'LG', 'LUXELLGAS', 'LUXOR', 'LUXPER',
  'MAC STYLER', 'MAGIC CHEF', 'MASTER CHEF', 'MEETION', 'MERCUSYS', 'MGC', 'MICROTEL', 'MIDEA', 'MILANO',
  'MIRAGE', 'MOULINEX', 'MOXOM', 'MR CHEF', 'NATIONAL LINE', 'NOVA', 'NOVOX',
  'PANAPHONE', 'PANASONIC', 'PHILIPS', 'PLATINUM', 'PRADO', 'PROVENT', 'QUEEN CHEF', 'QUEEN GENERAL',
  'RAF', 'RED TIGER', 'ROYAL SWISS', 'SAMSUNG', 'SANYORD', 'SEB', 'SHARP', 'SILVER CREST', 'SKY WORTH',
  'SKYDBAI', 'SOKANY', 'SONIFER', 'SPITZE', 'STARSAT', 'SUNCHONGLIC', 'SUOER', 'SUPER CHEF',
  'SUPER TECNO MATIC', 'SUTAI', 'TAC', 'TCL', 'TECNO NAF', 'TECNOMATIC', 'TEFAL', 'TESLA',
  'TOSHIBA', 'TOTAL', 'TOUCH', 'TP-LINK', 'UGA', 'UNIDEN', 'UNION', 'V-STAR', 'VERETTO', 'VGR',
  'WALTON', 'WAVE', 'WKE', 'XIAOMI', 'YEUGAN', 'ZENO',
] as const;

const brandAliases: Record<string, string> = {
  'AI GENERAL': 'AI GENERAL', 'ANDOWI': 'ANDOWL', 'BLUE BERRY': 'BLUEBERRY',
  'DORCSH': 'DORSCH', 'DREAM WAVE': 'DREAM WAVE', 'GC GENERAL CROME': 'GENERAL CROME',
  'KB ELEMENT': 'ELEMENT', 'KORKMAZE': 'KORKMAZ', 'KOZNO': 'KOZANO',
  'MAC': 'MAC STYLER', 'NATIONAL': 'NATIONAL LINE', 'REMOVER LINT JAMAYKI': 'JAMAKY',
  'MN1500 DURACELL': 'DURACELL',
  'SALON HAIR DRYER': 'MAC STYLER', 'SILVERCREST': 'SILVER CREST',
  'SKYWORTH': 'SKY WORTH', 'SUPERCHEF': 'SUPER CHEF', 'SUPER TECNOMATIC': 'SUPER TECNO MATIC',
};

const brandPrefixes = [
  ...DEFAULT_PRODUCT_BRANDS.map((brand) => [brand, brand] as const),
  ...Object.entries(brandAliases),
].sort(([left], [right]) => right.length - left.length);

export function detectProductBrand(description: string): string | null {
  const name = description.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
  for (const [prefix, brand] of brandPrefixes) {
    if (name === prefix || name.startsWith(`${prefix} `)) return brand;
  }
  return null;
}

export function productImportRowBrand(row: { description: string; brand?: string | null }, selectedBrand: string): string | null {
  return selectedBrand === ALL_PRODUCT_IMPORT_BRANDS
    ? row.brand === undefined ? detectProductBrand(row.description) : row.brand
    : selectedBrand;
}
