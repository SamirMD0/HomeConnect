import JsBarcode from 'jsbarcode';

/**
 * Physical barcode geometry for printed labels.
 *
 * The business prints on a 203 dpi thermal printer (8 dots per millimetre).
 * A bar or space that is a fraction of a dot gets rounded unevenly by the
 * driver, and thermal dot gain then closes the narrow spaces, so the symbol
 * stops scanning. The module (narrowest bar) is therefore a whole number of
 * dots and the barcode is sized in millimetres — never fitted to its box.
 */
export const DOTS_PER_MM = 8;
/** Exactly 3 dots at 203 dpi. */
export const MODULE_MM = 0.375;
/** Exactly 2 dots — used only when the barcode will not fit at MODULE_MM. */
export const FALLBACK_MODULE_MM = 0.25;
export const BAR_HEIGHT_MM = 10;
export const TEXT_SIZE_MODULES = 8;
export const TEXT_MARGIN_MODULES = 1;

export type BarcodeFormat = 'EAN13' | 'UPC' | 'EAN8' | 'CODE128';

/**
 * Quiet zone added on each side, in modules, on top of what JsBarcode draws.
 * GS1/ISO minimums: CODE128 10X; EAN-13 11X left / 7X right; EAN-8 7X; UPC-A 9X.
 * With the digits shown, JsBarcode already reserves a 12-module blank block for
 * the EAN-13 leading digit (≥ 11X) and 8-module blocks for the UPC-A outside
 * digits (so one more module reaches 9X).
 */
export const QUIET_ZONE_MODULES: Record<BarcodeFormat, { left: number; right: number }> = {
  CODE128: { left: 10, right: 10 },
  EAN13: { left: 0, right: 7 },
  EAN8: { left: 7, right: 7 },
  UPC: { left: 1, right: 1 },
};

export function barcodeFormat(value: string): BarcodeFormat {
  if (/^\d{13}$/.test(value) && hasValidEan13Checksum(value)) return 'EAN13';
  if (/^\d{12}$/.test(value)) return 'UPC';
  if (/^\d{8}$/.test(value)) return 'EAN8';
  return 'CODE128';
}

function hasValidEan13Checksum(value: string): boolean {
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

interface Encoding { data: string; text?: string }

/** Encodes into a plain object (no DOM) and returns JsBarcode's encodings. Throws for an invalid value. */
export function barcodeEncodings(value: string, format: BarcodeFormat): Encoding[] {
  const target: { encodings?: Encoding[] } = {};
  JsBarcode(target as never, value, { format, width: 1, margin: 0, displayValue: true });
  return target.encodings ?? [];
}

/** Total modules JsBarcode draws, including its blank blocks for outside digits. */
export function countModules(value: string, format: BarcodeFormat): number {
  return barcodeEncodings(value, format).reduce((total, encoding) => total + encoding.data.length, 0);
}

export interface BarcodeLayout {
  format: BarcodeFormat;
  moduleMm: number;
  modules: number;
  /** Full symbol width including quiet zones. */
  widthMm: number;
  fits: boolean;
  options: {
    format: BarcodeFormat;
    width: 1;
    height: number;
    margin: 0;
    marginLeft: number;
    marginRight: number;
    marginTop: 0;
    marginBottom: 0;
    displayValue: true;
    fontSize: number;
    textMargin: number;
  };
}

/**
 * Chooses the physical size of the barcode for `value` within `availableWidthMm`.
 *
 * Tries the 3-dot module, then the 2-dot one. If neither fits, `fits` is false
 * and the caller must not draw bars — a squeezed barcode is worse than none.
 * The options never set `text`, so the digits printed under the bars are always
 * exactly the encoded value.
 */
export function barcodeLayout(value: string, availableWidthMm: number): BarcodeLayout {
  let format = barcodeFormat(value);
  let modules: number;
  try {
    modules = countModules(value, format);
  } catch {
    format = 'CODE128';
    modules = countModules(value, format);
  }
  const quiet = QUIET_ZONE_MODULES[format];
  const totalModules = modules + quiet.left + quiet.right;
  const moduleMm = [MODULE_MM, FALLBACK_MODULE_MM].find((size) => totalModules * size <= availableWidthMm);
  const chosen = moduleMm ?? MODULE_MM;
  return {
    format,
    moduleMm: chosen,
    modules,
    widthMm: totalModules * chosen,
    fits: moduleMm !== undefined,
    options: {
      format,
      width: 1,
      height: Math.round(BAR_HEIGHT_MM / chosen),
      margin: 0,
      marginLeft: quiet.left,
      marginRight: quiet.right,
      marginTop: 0,
      marginBottom: 0,
      displayValue: true,
      fontSize: TEXT_SIZE_MODULES,
      textMargin: TEXT_MARGIN_MODULES,
    },
  };
}
