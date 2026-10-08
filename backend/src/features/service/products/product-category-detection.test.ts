import { describe, expect, it } from 'vitest';
import {
  detectProductCategory,
  productCategoryGroup,
  DEFAULT_PRODUCT_TYPES,
  PRODUCT_CATEGORY_FAMILIES,
  productCategoryFamily,
} from './product-category-detection';

describe('product type categories', () => {
  it('places every detected category in exactly one logical family', () => {
    const types = Object.values(PRODUCT_CATEGORY_FAMILIES).flat();
    expect(types.length).toBe(new Set(types).size);
    expect([...types].sort()).toEqual([...DEFAULT_PRODUCT_TYPES].sort());
    expect(productCategoryFamily('Hair Dryers')).toBe('Beauty');
    expect(productCategoryFamily('Air Conditioners')).toBe('Home Appliances');
    expect(productCategoryGroup({ family: 'BEAUTY', description: 'DSP BLENDER' }).family).toBe(
      'Small Appliances'
    );
  });
  it.each([
    ['TCL REFRIGRATOR 4 DOORS INVERTER', 'Refrigerators'],
    ['AGI REF 5 CF DEFROST BLACK', 'Refrigerators'],
    ['LG WASHIN MACHINE FRONT LOAD', 'Washing Machines'],
    ['HISENSE WASHER 10.5KG', 'Washing Machines'],
    ['TCL QLED 50 UHD SMART GOOGLE TV', 'TVs'],
    ['TV WALL MOUNT 17 - 60 MOVABLE', 'TV Mounts & Stands'],
    ['REMOTE CONTROL TV SAMSUNG', 'Remote Controls'],
    ['ANDROID TV BOX', 'TV Boxes & Satellite Receivers'],
    ['HAIER DISWASHER WHITE COLOR', 'Dishwashers'],
    ['HAIER 10KG HEAT PUMP TRUMBLE DRYER', 'Tumble Dryers'],
    ['COBA USB CHARGING HEADLAMP', 'Lighting'],
    ['ELBA GAS OVEN WITH FAN', 'Ovens'],
    ['GENE TECH BUILT IN MICROWAVE', 'Microwaves'],
    ['SUPERCHEF PYRAMID HOOD', 'Range Hoods'],
    ['KORKMAZ PRESSURE COOKER 7L', 'Pressure Cookers'],
    ['BASE FOR WASHING MACHINE AND REFRIGERATOR', 'Appliance Stands'],
    ['HOOVER CARPET WASHER', 'Vacuum Cleaners'],
    ['DSP HAIR DRYER', 'Hair Dryers'],
  ])('classifies %s as %s', (description, expected) => {
    expect(detectProductCategory(description)).toBe(expected);
  });

  it('keeps descriptions without a clear product type for review', () => {
    expect(detectProductCategory('NATIONAL LINE')).toBeNull();
    expect(productCategoryGroup({ family: 'HOME APPLIANCES', productType: null })).toEqual({
      key: 'unclassified',
      label: 'Unidentified product types',
      suggestedCategory: null,
      family: null,
    });
  });

  it('uses product type keys for both new and older draft rows', () => {
    expect(
      productCategoryGroup({ family: 'HOME APPLIANCES', productType: 'Refrigerators' }).key
    ).toBe('type:Refrigerators');
    expect(
      productCategoryGroup({ family: 'HOME APPLIANCES', description: 'TCL REFRIGERATOR' }).key
    ).toBe('type:Refrigerators');
  });
});
