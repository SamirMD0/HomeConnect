import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateLabelSheetLayout } from '../utils/label-sheet-layout';
import { DEFAULT_PRODUCT_LABEL_SHEET_SETTINGS } from '../utils/product-label-settings';
import { LabelSheetLayoutControls } from './LabelSheetLayoutControls';
import { ProductLabelPrintSettings } from './ProductLabelPrintSettings';

describe('print setting millimetre bounds', () => {
  it('allows the 210 mm desktop print ceiling in both legacy controls', () => {
    const noop = () => undefined;
    const settings = DEFAULT_PRODUCT_LABEL_SHEET_SETTINGS;
    const sheet = renderToStaticMarkup(
      <LabelSheetLayoutControls
        settings={settings}
        onChange={noop}
        layout={calculateLabelSheetLayout(settings, 1)}
        showPrice
        onShowPriceChange={noop}
        showPriceCode={false}
        onShowPriceCodeChange={noop}
      />,
    );
    const sticker = renderToStaticMarkup(
      <ProductLabelPrintSettings
        dimensions={{ widthMm: 148, heightMm: 105, autoFit: false }}
        onChange={noop}
        showPrice
        onShowPriceChange={noop}
        showCode={false}
        onShowCodeChange={noop}
      />,
    );

    expect((sheet.match(/max="210"/g) ?? []).length).toBe(2);
    expect((sticker.match(/max="210"/g) ?? []).length).toBe(2);
  });
});
