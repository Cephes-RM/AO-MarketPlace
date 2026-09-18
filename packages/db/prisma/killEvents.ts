// Equipment mirrors what the Albion killboard returns: a slot is simply absent
// when the player wore nothing there. Event 4 carries no equipment at all, which
// is what every event looked like before the ingestion worker recorded gear.
export const events = [

    {
        //no names duplicate
        //add equipements / number of participations / external Id from the albion api
        //rename from killevent to event
        //eventid to id
        id: "1",
        killerId: "wgyqjCcYRoistNUSfZgYLQ",
        victimId: "KgXzr2H7RF2PcYKr1uJGQA",
        location: "unknown",
        createdAt: new Date(),
        totalFame: 535353535n,
        killerEquipment: {
            mainHand: { itemType: "T8_MAIN_HOLYSTAFF@3", quality: 4 },
            offHand: { itemType: "T7_OFF_TOWERSHIELD@2", quality: 3 },
            head: { itemType: "T8_HEAD_CLOTH_SET3@2", quality: 4 },
            armor: { itemType: "T8_ARMOR_CLOTH_SET3@3", quality: 5 },
            shoes: { itemType: "T7_SHOES_CLOTH_SET3@2", quality: 3 },
            cape: { itemType: "T8_CAPEITEM_FW_MARTLOCK@1", quality: 3 },
            bag: { itemType: "T6_BAG@1", quality: 2 },
            mount: { itemType: "T8_MOUNT_ARMORED_HORSE", quality: 1 },
            potion: { itemType: "T7_POTION_HEAL", count: 3 },
            food: { itemType: "T7_MEAL_OMELETTE", count: 1 },
        },
        victimEquipment: {
            mainHand: { itemType: "T8_2H_CLAYMORE@2", quality: 3 },
            head: { itemType: "T8_HEAD_PLATE_SET2@1", quality: 3 },
            armor: { itemType: "T8_ARMOR_PLATE_SET2@2", quality: 4 },
            shoes: { itemType: "T7_SHOES_PLATE_SET2@1", quality: 2 },
            cape: { itemType: "T7_CAPEITEM_FW_LYMHURST@1", quality: 2 },
            mount: { itemType: "T5_MOUNT_HORSE", quality: 1 },
        },
    },
    {
        id: "2",
        killerId: "KgXzr2H7RF2PcYKr1uJGQA",
        victimId: "wgyqjCcYRoistNUSfZgYLQ",
        location: "unknown",
        createdAt: new Date(),
        totalFame: 9994444n,
        killerEquipment: {
            mainHand: { itemType: "T8_2H_BOW@3", quality: 4 },
            head: { itemType: "T8_HEAD_LEATHER_SET3@2", quality: 3 },
            armor: { itemType: "T8_ARMOR_LEATHER_SET3@3", quality: 4 },
            shoes: { itemType: "T8_SHOES_LEATHER_SET3@2", quality: 3 },
            cape: { itemType: "T8_CAPEITEM_HERETIC@2", quality: 3 },
            potion: { itemType: "T8_POTION_ENERGY", count: 2 },
            food: { itemType: "T8_MEAL_SANDWICH", count: 1 },
        },
        victimEquipment: {
            mainHand: { itemType: "T7_MAIN_ARCANESTAFF@2", quality: 3 },
            offHand: { itemType: "T7_OFF_BOOK@1", quality: 2 },
            armor: { itemType: "T7_ARMOR_CLOTH_SET1@2", quality: 3 },
            mount: { itemType: "T6_MOUNT_OX", quality: 1 },
        },
    },
    {
        // Only a weapon was recorded: every other slot must degrade gracefully.
        id: "3",
        killerId: "5N33rMGDQH-LjQghZumvoA",
        victimId: "wgyqjCcYRoistNUSfZgYLQ",
        location: "unknown",
        createdAt: new Date(),
        totalFame: 123456789n,
        killerEquipment: {
            mainHand: { itemType: "T6_2H_AXE@1", quality: 2 },
        },
        victimEquipment: {},
    },
    {
        // No equipment recorded at all, like every event ingested before this feature.
        id: "4",
        killerId: "5N33rMGDQH-LjQghZumvoA",
        victimId: "KgXzr2H7RF2PcYKr1uJGQA",
        location: "unknown",
        createdAt: new Date(),
        totalFame: 423456789n,
    }

]
