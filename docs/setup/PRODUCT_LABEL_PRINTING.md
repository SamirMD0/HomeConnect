# Product Label Printing

HomeConnect product labels contain only brand, product name, model, SKU, barcode, and an optional internal staff code. They never contain a monetary price, cost, percentage, stock quantity, or specification.

## Printer setup

1. Open a product and select **Print label**.
2. Enter the physical sticker width and height in millimeters. The default is 50 x 30 mm.
3. Leave **Show internal code** off unless staff need the derived memory aid.
4. In the Windows print dialog, select the label printer, use 100% scale, disable margins, and select the matching paper size.
5. Print one test label before printing a batch.

The dimensions are saved on the current PC, allowing each workstation or printer to use different label stock.

## Scanner setup

Configure the scanner as a keyboard device that sends `Enter` after each scan. Focus the Products search field and scan the label. An exact SKU or manufacturer-barcode match opens the product directly.

## Required physical checks

- Print on the real label roll and confirm that no content is clipped.
- Scan the HomeConnect barcode using the real scanner.
- Scan an original manufacturer barcode and verify product lookup.
- Confirm that the sticker exposes no price information.

If scanning fails, verify print contrast, 100% scale, clean printer hardware, and the scanner's CODE128 support.
