import { describe, expect, it } from 'vitest';
import { toInventoryItemStack } from './inventory-ui';
import { ARMOR_ITEM_IDS } from './survival';

describe('inventory item presentation', () => {
  it('classifies beef, leather, and leather armor with their dedicated icon families', () => {
    expect(toInventoryItemStack({ item: 'raw_beef', count: 2 })).toMatchObject({
      itemId: 'raw_beef',
      icon: 'food',
      count: 2,
      maxCount: 64
    });
    expect(toInventoryItemStack({ item: 'cooked_beef', count: 1 })).toMatchObject({
      itemId: 'cooked_beef',
      icon: 'food'
    });
    expect(toInventoryItemStack({ item: 'leather', count: 3 })).toMatchObject({
      itemId: 'leather',
      icon: 'material'
    });
    expect(toInventoryItemStack({
      item: ARMOR_ITEM_IDS.leatherHelmet,
      count: 1,
      durability: 55
    })).toMatchObject({
      itemId: ARMOR_ITEM_IDS.leatherHelmet,
      icon: 'armor',
      maxCount: 1,
      durability: { current: 55, max: 55 }
    });
  });
});
