// Shared by CSV previews in the browser and server. Specific accessories and
// appliances precede broader matches (TV, cooker, etc.).
const rules: Array<[string, RegExp]> = [
  ['Appliance Stands', /\b(?:BASE FOR WASHING|BASE FOR.*REFRIGERATOR)\b/],
  [
    'TV Mounts & Stands',
    /\b(?:WALL MOUNT|TV MOUNT|TV WALL|STAND.*(?:TV|PANEL)|FLAT PANEL|LCD WALL|LED LCD PDP)\b/,
  ],
  ['Remote Controls', /\b(?:REMOTE CONTROL|REMONTE CONTROL|REMONT.*CONTROL)\b/],
  ['Water Pumps', /\bWATER P[OU]MP\b|مضخة|نربيش/],
  ['Range Hoods', /\b(?:HOOD|HOODS)\b/],
  ['Dishwashers', /\b(?:DISHWASHER|DISWASHER)\b/],
  ['Tumble Dryers', /\b(?:TRUMBLE DRYER|TUMBLE DRYER|DRYER HEAT PUMP|HEAT PUMP.*DRYER)\b/],
  ['Microwaves', /\bMICROWAVE\b/],
  ['Freezers', /\b(?:FREEZER|FREZER|FREZERS)\b/],
  ['Refrigerators', /\b(?:REFRIGERATOR|REFRIGRATOR|REFRIGERATORS|REF|FRIDGE)\b/],
  [
    'Vacuum Cleaners',
    /\b(?:VACUUM|VSCUUM|SITCK VACUUM|WASHSAUGER|CARPET WASHER|SWEEPER|HOOVER)\b|اكياس هوفر/,
  ],
  [
    'Washing Machines',
    /\b(?:WASHING MACHINE|WACHING MACHINE|WASHIN MACHINE|WASHER|WASHING|WACHING|TWIN TUB|TOP LOAD.*KG)\b/,
  ],
  ['Air Conditioners', /\b(?:AIR CONDITION\w*|PORTABLE AC|SPLIT INV|SPLIT.*(?:INVERTER|BTU)|AC)\b/],
  ['Air Coolers', /\bAIR COOLER\b/],
  ['Water Dispensers', /\b(?:WATER D[EI]SP[AE]NSER|WATER DISPENSER|BOTTLE WATER)\b/],
  ['Pressure Cookers', /\bPRESSURE COOKER\b/],
  ['Rice Cookers', /\bRICE COOKER\b/],
  ['Induction Cookers & Hot Plates', /\b(?:INDUCTION COOKER|HOT PLATE)\b/],
  ['Air Fryers', /\bAIR FRYER\b/],
  ['Hobs', /\b(?:HOB|HOBS|GAS TOP|GAZ TOP|TOP GAS|TOP GT|TOP COLOR BLACK GLASS|TOP \d+CM)\b/],
  ['Ovens', /\bOVEN\b/],
  ['Cookers', /\b(?:COOKER|GAS COOKER|BURNN?ERS?|BURNERS?)\b/],
  ['Heaters', /\b(?:HEATER|HEATERS|FAN HEATER)\b/],
  ['Fans', /\b(?:FAN|FANS|FAN MOTOR|CELEING FAN)\b/],
  [
    'TV Boxes & Satellite Receivers',
    /\b(?:TV BOX|ANDROID.*BOX|SATELLITE|RECEIVER|REVEIVER|RECEIVERS)\b/,
  ],
  [
    'TVs',
    /\b(?:TV|QNED|QLED|OLED|LED TV|SMART LED)\b|\b(?:SAMSUNG|SAMSNUGNHD|ELEMENTS)\s+\d+["']?\s+(?:UHD|ANDROID)\b/,
  ],
  ['Hair Dryers', /\b(?:HAIR DRYER|HAI DRYER|HAIER DRYER|HAIR DRYRE|SESHWAR|SISHWAR)\b/],
  [
    'Hair Straighteners & Curlers',
    /\b(?:STRAIGHTENER|SRAIGHTNER|STRAIGHTNER|STRAIGHT PERFECTION|WAVE STYLER|HAIR CURL\w*|CURLER|THERMAL BRUSH|SMOOTH BRUSH|SPLITEND|HOT AIR STYLER|HOT AIR SET|BABYLISS)\b/,
  ],
  ['Hair Removal Devices', /\b(?:HAIR REMOVE|HAIR REMOVER|HAIR REMOVABLE|SILK EPIL|SEILK EPIL)\b/],
  ['Trimmers & Shavers', /\b(?:TRIMMER|TRIMER|CLIPPER|SHAVER|EPILATOR)\b/],
  ['Massagers', /\b(?:MASSAGE|MASSAGER|MASSAGERS|FASCIA GUN|PERCUSSION|FOOT MASSAGER)\b/],
  ['Smart Watches', /\b(?:SMART WATCH|SMARTWATCH)\b/],
  ['Blenders', /\bBLENDER\b/],
  ['Choppers & Food Processors', /\b(?:CHOPPER|FOOD PROCESSOR|VEGETABLE CUTTER)\b/],
  ['Mixers', /\b(?:MIXER|ROBOT MIXER)\b/],
  ['Meat Grinders', /\bMEAT GRINDER\b/],
  ['Juicers', /\b(?:JUICER|FRUIT JUICER)\b/],
  ['Kettles', /\bKETTLE\b/],
  ['Coffee Makers', /\b(?:COFFEE MAKER|COFFEE MACHINE)\b/],
  ['Milk Frothers', /\bMILK FROTHER\b/],
  ['Toasters & Sandwich Makers', /\b(?:SANDWICH MAKER|TOASTER|CONTACT GRILL|GRILL SANDWICH)\b/],
  ['Irons & Garment Steamers', /\b(?:IRON|GARMENT STEAMER|STEAM BRUSH)\b/],
  [
    'Cookware',
    /\b(?:COOKWARE|CASSEROLE|FRYPAN|BAKING PAN|MILK POT|PAN|POT|STEAM COOKER|CUISEUR VAPEUR)\b/,
  ],
  ['Kitchen Accessories', /\b(?:MIXING BOWL|SPRING FORM)\b/],
  ['Knives & Cutlery', /\b(?:KNIFE|KNIVES|KNIFES|KINFE|CUTLERY)\b/],
  ['Cups & Drinkware', /\b(?:CUPS|CUP|MUG)\b/],
  ['Scales', /\b(?:SCALE|SCALES|PRICE COMPUTING)\b/],
  ['Calculators', /\bCALCULATOR\b/],
  ['Clocks', /\bCLOCK\b/],
  ['Speakers & Sound Systems', /\b(?:SPEAKER|SPEAKERS|SPK|SOUND BAR|ECHO WALL)\b/],
  ['Radios', /\bRADIO\b/],
  ['Phones', /\b(?:PHONE|PHONES|CORDLED|CORDED)\b/],
  ['Routers & Network Extenders', /\b(?:ROUTER|RANGE EXTENDER)\b/],
  ['Cameras', /\b(?:CAMERA|CAMERAS|DVR)\b/],
  ['Projectors', /\bPROJECTOR\b/],
  ['Gaming Consoles & Controllers', /\b(?:GAME|GAMES|CONTROLLER)\b/],
  ['Gaming Accessories', /\bPS[45] BAGS\b/],
  ['Computer Accessories', /\b(?:MOUSE|AUDIO CARD)\b/],
  [
    'Lighting',
    /\b(?:FLASHLIGHT|FLASH LIGHT|STRONG LIGHT|HEADLAMP|HEADLIGHT|HEADLIHTS|LANTERN|LED TORCH|LED LIGHT|LIGHT BULB|SOLAR.*LIGHT\w*|SOLAR PANEL|LAMP|LIGHT PROJECTOR)\b/,
  ],
  [
    'Chargers & Power Adapters',
    /\b(?:CHARGER|CHARGING|POWER ADAPTER|PORTATIL|DC UPS|UPS ADAPTER)\b/,
  ],
  ['Batteries & Power Banks', /\b(?:BATTERY|BATTERIES|POWERBANK|POWER BANK|MAH|DURACELL)\b/],
  ['Ladders', /\b(?:LADDER|LADDERS)\b|سلم/],
  ['Safes', /\bSAFE\b/],
  ['Clothes Drying Racks', /\b(?:CLOTHES DRY|CLOTHES DRYER|CLOTHES DRYING)\b/],
  ['Gas Regulators', /\b(?:REGULATOR|LPG)\b/],
  ['Cables & Power Sockets', /\b(?:CABLE|EXTENSION POWER|POWER SOCKET|HDTV)\b/],
  ['Voltage Protectors', /\b(?:VOLTAGE PROTECTOR|SURGE VOLTAGE)\b/],
  ['Air Compressors', /\b(?:COMPRESSOR|INFLATION PUMP|INFLATABLE)\b/],
];

export const DEFAULT_PRODUCT_TYPES = rules.map(([name]) => name);

export const PRODUCT_CATEGORY_FAMILIES: Record<string, readonly string[]> = {
  'Home Appliances': [
    'Refrigerators',
    'Freezers',
    'Washing Machines',
    'Dishwashers',
    'Tumble Dryers',
    'Air Conditioners',
    'Air Coolers',
    'Water Dispensers',
    'Cookers',
    'Ovens',
    'Hobs',
    'Range Hoods',
    'Heaters',
    'Fans',
    'Appliance Stands',
    'Clothes Drying Racks',
  ],
  'Small Appliances': [
    'Microwaves',
    'Vacuum Cleaners',
    'Rice Cookers',
    'Induction Cookers & Hot Plates',
    'Air Fryers',
    'Blenders',
    'Choppers & Food Processors',
    'Mixers',
    'Meat Grinders',
    'Juicers',
    'Kettles',
    'Coffee Makers',
    'Milk Frothers',
    'Toasters & Sandwich Makers',
    'Irons & Garment Steamers',
    'Scales',
  ],
  Electronics: [
    'TVs',
    'TV Mounts & Stands',
    'Remote Controls',
    'TV Boxes & Satellite Receivers',
    'Smart Watches',
    'Calculators',
    'Clocks',
    'Speakers & Sound Systems',
    'Radios',
    'Phones',
    'Routers & Network Extenders',
    'Cameras',
    'Projectors',
    'Computer Accessories',
    'Chargers & Power Adapters',
    'Batteries & Power Banks',
    'Cables & Power Sockets',
    'Voltage Protectors',
  ],
  Beauty: [
    'Hair Dryers',
    'Hair Straighteners & Curlers',
    'Hair Removal Devices',
    'Trimmers & Shavers',
    'Massagers',
  ],
  Kitchenware: [
    'Pressure Cookers',
    'Cookware',
    'Kitchen Accessories',
    'Knives & Cutlery',
    'Cups & Drinkware',
  ],
  'Lighting & Electrical': ['Lighting'],
  Tools: ['Water Pumps', 'Ladders', 'Safes', 'Gas Regulators', 'Air Compressors'],
  Gaming: ['Gaming Consoles & Controllers', 'Gaming Accessories'],
};

export function productCategoryFamily(productType: string): string | null {
  return (
    Object.entries(PRODUCT_CATEGORY_FAMILIES).find(([, categories]) =>
      categories.includes(productType)
    )?.[0] ?? null
  );
}

export function detectProductCategory(description: string): string | null {
  const text = description.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function productCategoryGroup(row: {
  family: string;
  description?: string;
  productType?: string | null;
}) {
  const productType =
    row.productType === undefined ? detectProductCategory(row.description ?? '') : row.productType;
  return productType
    ? {
        key: `type:${productType}`,
        label: productType,
        suggestedCategory: productType,
        family: productCategoryFamily(productType),
      }
    : {
        key: 'unclassified',
        label: 'Unidentified product types',
        suggestedCategory: null,
        family: null,
      };
}
