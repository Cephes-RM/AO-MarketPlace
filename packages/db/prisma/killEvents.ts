export interface ItemSlot {
  id?: string;
  type?: string;
  tier?: number;
  enchant?: number;
  quality?: number;
  en_name?: string;
  count?: number;
}

export interface PlayerLoadout {
  main_hand?: ItemSlot | null;
  off_hand?: ItemSlot | null;
  head?: ItemSlot | null;
  body?: ItemSlot | null;
  shoe?: ItemSlot | null;
  bag?: ItemSlot | null;
  cape?: ItemSlot | null;
  mount?: ItemSlot | null;
  potion?: ItemSlot | null;
  food?: ItemSlot | null;
}

export interface EventParticipantSeed {
  playerId: string;
  damageDone?: number;
  healingDone?: number;
  killFame?: bigint;
  isPrimary?: boolean;
  itemPower?: number;
  loadout?: PlayerLoadout;
}

export interface KillEventSeed {
  id: string;
  killerId: string;
  victimId: string;
  location: string;
  createdAt: Date;
  totalFame: bigint;
  killerItemPower?: number;
  victimItemPower?: number;
  killerLoadout?: PlayerLoadout;
  victimLoadout?: PlayerLoadout;
  participants?: EventParticipantSeed[];
}

export const events: KillEventSeed[] = [
  {
    id: "1",
    killerId: "wgyqjCcYRoistNUSfZgYLQ",
    victimId: "KgXzr2H7RF2PcYKr1uJGQA",
    location: "Blackthorn Quarry",
    createdAt: new Date("2024-03-01T15:30:00.000Z"),
    totalFame: 535353535n,
    killerItemPower: 1566,
    victimItemPower: 1446,
    killerLoadout: {
      main_hand: {
        id: "T6_MAIN_HOLYSTAFF_AVALON@2",
        type: "MAIN_HOLYSTAFF_AVALON",
        tier: 6,
        enchant: 2,
        quality: 3,
        en_name: "Master's Redemption Staff",
      },
      off_hand: null,
      head: {
        id: "T6_HEAD_CLOTH_ROYAL@2",
        type: "HEAD_CLOTH_ROYAL",
        tier: 6,
        enchant: 2,
        quality: 4,
        en_name: "Master's Royal Cowl",
      },
      body: {
        id: "T6_ARMOR_CLOTH_ROBE@2",
        type: "ARMOR_CLOTH_ROBE",
        tier: 6,
        enchant: 2,
        quality: 4,
        en_name: "Master's Robe of Purity",
      },
      shoe: {
        id: "T6_SHOES_LEATHER_ROYAL@2",
        type: "SHOES_LEATHER_ROYAL",
        tier: 6,
        enchant: 2,
        quality: 3,
        en_name: "Master's Royal Shoes",
      },
      bag: {
        id: "T6_BAG@1",
        type: "BAG",
        tier: 6,
        enchant: 1,
        quality: 2,
        en_name: "Master's Bag",
      },
      cape: {
        id: "T6_CAPEITEM_FW_FORTSTERLING@2",
        type: "CAPEITEM_FW_FORTSTERLING",
        tier: 6,
        enchant: 2,
        quality: 4,
        en_name: "Master's Fort Sterling Cape",
      },
      mount: {
        id: "T5_MOUNT_ARMORED_HORSE",
        type: "MOUNT_ARMORED_HORSE",
        tier: 5,
        quality: 1,
        en_name: "Expert's Armored Horse",
      },
      potion: {
        id: "T6_POTION_HEAL",
        type: "POTION_HEAL",
        tier: 6,
        count: 5,
        quality: 0,
        en_name: "Major Healing Potion",
      },
      food: {
        id: "T7_MEAL_OMELETTE",
        type: "MEAL_OMELETTE",
        tier: 7,
        count: 2,
        quality: 0,
        en_name: "Pork Omelette",
      },
    },
    victimLoadout: {
      main_hand: {
        id: "T6_MAIN_ROCKMACE_KEEPER@1",
        type: "MAIN_ROCKMACE_KEEPER",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Bedrock Mace",
      },
      off_hand: {
        id: "T6_OFF_BOOK@2",
        type: "OFF_BOOK",
        tier: 6,
        enchant: 2,
        quality: 4,
        en_name: "Master's Tome of Spells",
      },
      head: {
        id: "T6_HEAD_PLATE_HELL@1",
        type: "HEAD_PLATE_HELL",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Demon Helmet",
      },
      body: {
        id: "T6_ARMOR_PLATE_SET3@1",
        type: "ARMOR_PLATE_SET3",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Guardian Armor",
      },
      shoe: {
        id: "T6_SHOES_PLATE_SET1@1",
        type: "SHOES_PLATE_SET1",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Soldier Boots",
      },
      bag: {
        id: "T5_BAG",
        type: "BAG",
        tier: 5,
        quality: 2,
        en_name: "Expert's Bag",
      },
      cape: {
        id: "T6_CAPEITEM_FW_MARTLOCK@1",
        type: "CAPEITEM_FW_MARTLOCK",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Martlock Cape",
      },
      mount: {
        id: "T5_MOUNT_ARMORED_HORSE",
        type: "MOUNT_ARMORED_HORSE",
        tier: 5,
        quality: 1,
        en_name: "Expert's Armored Horse",
      },
      potion: {
        id: "T6_POTION_STONESKIN",
        type: "POTION_STONESKIN",
        tier: 6,
        count: 2,
        quality: 0,
        en_name: "Major Resistance Potion",
      },
      food: {
        id: "T7_MEAL_ROAST",
        type: "MEAL_ROAST",
        tier: 7,
        count: 1,
        quality: 0,
        en_name: "Roast Pork",
      },
    },
    participants: [
      {
        playerId: "5N33rMGDQH-LjQghZumvoA", // Phildas assisting
        damageDone: 2450,
        healingDone: 0,
        killFame: 150000n,
        isPrimary: false,
        itemPower: 1520,
        loadout: {
          main_hand: {
            id: "T6_2H_BOW@2",
            type: "2H_BOW",
            tier: 6,
            enchant: 2,
            quality: 4,
            en_name: "Master's Bow",
          },
          off_hand: null,
          head: {
            id: "T6_HEAD_LEATHER_SET1@2",
            type: "HEAD_LEATHER_SET1",
            tier: 6,
            enchant: 2,
            quality: 3,
            en_name: "Master's Mercenary Hood",
          },
          body: {
            id: "T6_ARMOR_LEATHER_SET1@2",
            type: "ARMOR_LEATHER_SET1",
            tier: 6,
            enchant: 2,
            quality: 4,
            en_name: "Master's Mercenary Jacket",
          },
          shoe: {
            id: "T6_SHOES_LEATHER_SET1@2",
            type: "SHOES_LEATHER_SET1",
            tier: 6,
            enchant: 2,
            quality: 3,
            en_name: "Master's Mercenary Shoes",
          },
        },
      },
    ],
  },
  {
    id: "2",
    killerId: "KgXzr2H7RF2PcYKr1uJGQA",
    victimId: "wgyqjCcYRoistNUSfZgYLQ",
    location: "Deadvein Gully",
    createdAt: new Date("2024-03-02T18:45:00.000Z"),
    totalFame: 9994444n,
    killerItemPower: 1480,
    victimItemPower: 1510,
    killerLoadout: {
      main_hand: {
        id: "T6_2H_CURSEDSTAFF@1",
        type: "2H_CURSEDSTAFF",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Great Cursed Staff",
      },
      off_hand: null,
      head: {
        id: "T6_HEAD_CLOTH_SET2@1",
        type: "HEAD_CLOTH_SET2",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Cleric Cowl",
      },
      body: {
        id: "T6_ARMOR_CLOTH_SET2@1",
        type: "ARMOR_CLOTH_SET2",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Cleric Robe",
      },
      shoe: {
        id: "T6_SHOES_CLOTH_SET2@1",
        type: "SHOES_CLOTH_SET2",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Cleric Sandals",
      },
      bag: null,
      cape: null,
      mount: null,
      potion: null,
      food: null,
    },
    victimLoadout: {
      main_hand: {
        id: "T6_MAIN_HOLYSTAFF_AVALON@2",
        type: "MAIN_HOLYSTAFF_AVALON",
        tier: 6,
        enchant: 2,
        quality: 3,
        en_name: "Master's Redemption Staff",
      },
      off_hand: null,
      head: null,
      body: null,
      shoe: null,
      bag: null,
      cape: null,
      mount: null,
      potion: null,
      food: null,
    },
    participants: [],
  },
  {
    id: "3",
    killerId: "5N33rMGDQH-LjQghZumvoA",
    victimId: "wgyqjCcYRoistNUSfZgYLQ",
    location: "Sunkenbough Woods",
    createdAt: new Date("2024-03-03T11:10:00.000Z"),
    totalFame: 123456789n,
    killerItemPower: 1540,
    victimItemPower: 1490,
    killerLoadout: {
      main_hand: {
        id: "T6_2H_BOW@2",
        type: "2H_BOW",
        tier: 6,
        enchant: 2,
        quality: 4,
        en_name: "Master's Bow",
      },
      off_hand: null,
      head: null,
      body: null,
      shoe: null,
      bag: null,
      cape: null,
      mount: null,
      potion: null,
      food: null,
    },
    victimLoadout: {
      main_hand: {
        id: "T6_MAIN_HOLYSTAFF_AVALON@2",
        type: "MAIN_HOLYSTAFF_AVALON",
        tier: 6,
        enchant: 2,
        quality: 3,
        en_name: "Master's Redemption Staff",
      },
      off_hand: null,
      head: null,
      body: null,
      shoe: null,
      bag: null,
      cape: null,
      mount: null,
      potion: null,
      food: null,
    },
    participants: [
      {
        playerId: "JLz63ANFSKyZ9ufMvTx_ow", // RuskiePlacki assisting
        damageDone: 1100,
        healingDone: 0,
        killFame: 50000n,
        isPrimary: false,
        itemPower: 1350,
      },
    ],
  },
  {
    id: "4",
    killerId: "5N33rMGDQH-LjQghZumvoA",
    victimId: "KgXzr2H7RF2PcYKr1uJGQA",
    location: "Timbertop Dell",
    createdAt: new Date("2024-03-04T20:00:00.000Z"),
    totalFame: 423456789n,
    killerItemPower: 1555,
    victimItemPower: 1460,
    killerLoadout: {
      main_hand: {
        id: "T6_2H_BOW@2",
        type: "2H_BOW",
        tier: 6,
        enchant: 2,
        quality: 4,
        en_name: "Master's Bow",
      },
      off_hand: null,
      head: null,
      body: null,
      shoe: null,
      bag: null,
      cape: null,
      mount: null,
      potion: null,
      food: null,
    },
    victimLoadout: {
      main_hand: {
        id: "T6_MAIN_ROCKMACE_KEEPER@1",
        type: "MAIN_ROCKMACE_KEEPER",
        tier: 6,
        enchant: 1,
        quality: 3,
        en_name: "Master's Bedrock Mace",
      },
      off_hand: null,
      head: null,
      body: null,
      shoe: null,
      bag: null,
      cape: null,
      mount: null,
      potion: null,
      food: null,
    },
    participants: [],
  },
];