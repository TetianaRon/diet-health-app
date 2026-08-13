// Bundled starter dataset — common Ukrainian staple foods, checked before any
// USDA lookup (see src/lib/nutrition.ts). Values are per 100g, always the
// RAW/unprepared state — anything requiring cooking belongs in
// src/data/starter-dishes.ts instead (see src/lib/dishes.ts), computed from
// these via a cooking-yield model, since cooking changes carbs/100g too
// much (water dilution/loss) to treat as the same row.
//
// Scope note: this "raw here, cooked in Dishes" split is applied fully for
// grains and legumes, where cooking changes carb density by 2-5x (the
// primary metric this app cares about for diabetes management). Meat/fish/
// eggs (~0 carbs regardless of cooking state) and lightly-boiled vegetables
// (potato, beet, pumpkin, corn — carb content barely changes when boiled)
// are left as directly-labeled cooked Ingredients rows for now, rather than
// modeled through the yield mechanism — the accuracy gain wouldn't be worth
// the added entries. Could be extended later if it matters in practice.
//
// Figures are typical reference values (USDA-style macros; GI from
// published glycemic-index research) meant as sensible defaults — mom
// reviews and approves before anything is saved, same as a USDA-sourced
// estimate. First-pass list covering the most common staples; expand over
// time as real usage surfaces gaps.

export interface StarterFood {
  nameUk: string;
  nameEn: string;
  carbsG: number;
  gi: number;
  fiberG: number;
  sugarsG: number;
  proteinG: number;
  fatG: number;
  caloriesKcal: number;
  sodiumMg: number;
}

export const STARTER_FOODS: StarterFood[] = [
  // Grains & cereals — RAW/dry. Cooked forms live in starter-dishes.ts.
  // GI carried here is the published value for the cooked/eaten form (GI
  // isn't measured on inedible raw grain) — it's just a place for Dishes to
  // pull from when computing a prepared dish's GI.
  { nameUk: "Гречка суха", nameEn: "buckwheat, raw", carbsG: 71.5, gi: 54, fiberG: 10, sugarsG: 0, proteinG: 13.2, fatG: 3.4, caloriesKcal: 343, sodiumMg: 1 },
  { nameUk: "Рис білий сирий", nameEn: "white rice, raw", carbsG: 79, gi: 73, fiberG: 1.3, sugarsG: 0.1, proteinG: 7.1, fatG: 0.7, caloriesKcal: 365, sodiumMg: 5 },
  { nameUk: "Рис бурий сирий", nameEn: "brown rice, raw", carbsG: 77, gi: 68, fiberG: 3.5, sugarsG: 0.9, proteinG: 7.9, fatG: 2.9, caloriesKcal: 370, sodiumMg: 7 },
  { nameUk: "Вівсяні пластівці сирі", nameEn: "rolled oats, raw", carbsG: 66, gi: 55, fiberG: 10, sugarsG: 1, proteinG: 17, fatG: 7, caloriesKcal: 389, sodiumMg: 2 },
  { nameUk: "Пшоно сире", nameEn: "millet, raw", carbsG: 73, gi: 71, fiberG: 8.5, sugarsG: 0, proteinG: 11, fatG: 4.2, caloriesKcal: 378, sodiumMg: 5 },
  { nameUk: "Перлова крупа суха", nameEn: "pearl barley, raw", carbsG: 77.7, gi: 25, fiberG: 15.6, sugarsG: 0.8, proteinG: 9.9, fatG: 1.2, caloriesKcal: 352, sodiumMg: 9 },
  { nameUk: "Манна крупа суха", nameEn: "semolina, raw", carbsG: 77, gi: 55, fiberG: 3.9, sugarsG: 0.7, proteinG: 12.7, fatG: 1.1, caloriesKcal: 360, sodiumMg: 1 },
  { nameUk: "Кукурудзяна крупа суха", nameEn: "cornmeal, raw", carbsG: 76.9, gi: 68, fiberG: 7.3, sugarsG: 0.6, proteinG: 8.1, fatG: 3.6, caloriesKcal: 370, sodiumMg: 6 },
  { nameUk: "Макарони сухі", nameEn: "pasta, dry", carbsG: 75, gi: 50, fiberG: 3.2, sugarsG: 2.7, proteinG: 13, fatG: 1.5, caloriesKcal: 371, sodiumMg: 6 },
  { nameUk: "Хліб житній", nameEn: "rye bread", carbsG: 48, gi: 58, fiberG: 6, sugarsG: 4, proteinG: 8.5, fatG: 1.7, caloriesKcal: 250, sodiumMg: 660 },
  { nameUk: "Хліб білий", nameEn: "white bread", carbsG: 49, gi: 75, fiberG: 2.7, sugarsG: 5, proteinG: 9, fatG: 3.2, caloriesKcal: 265, sodiumMg: 490 },

  // Dairy
  { nameUk: "Кефір", nameEn: "kefir, low-fat", carbsG: 4.0, gi: 32, fiberG: 0, sugarsG: 4.0, proteinG: 3.4, fatG: 1.0, caloriesKcal: 41, sodiumMg: 40 },
  { nameUk: "Молоко", nameEn: "milk, 2.5%", carbsG: 4.7, gi: 30, fiberG: 0, sugarsG: 4.7, proteinG: 3.2, fatG: 2.5, caloriesKcal: 52, sodiumMg: 44 },
  { nameUk: "Йогурт натуральний", nameEn: "plain yogurt, low-fat", carbsG: 4.7, gi: 35, fiberG: 0, sugarsG: 4.7, proteinG: 5.3, fatG: 1.5, caloriesKcal: 56, sodiumMg: 46 },
  { nameUk: "Сир кисломолочний нежирний", nameEn: "cottage cheese, low-fat", carbsG: 3.4, gi: 30, fiberG: 0, sugarsG: 3.4, proteinG: 18, fatG: 1.8, caloriesKcal: 98, sodiumMg: 405 },
  { nameUk: "Сир твердий", nameEn: "hard cheese", carbsG: 1.3, gi: 0, fiberG: 0, sugarsG: 1.3, proteinG: 25, fatG: 27, caloriesKcal: 356, sodiumMg: 620 },
  { nameUk: "Сметана 15%", nameEn: "sour cream 15%", carbsG: 3.0, gi: 0, fiberG: 0, sugarsG: 3.0, proteinG: 2.6, fatG: 15, caloriesKcal: 158, sodiumMg: 32 },
  { nameUk: "Масло вершкове", nameEn: "butter", carbsG: 0.1, gi: 0, fiberG: 0, sugarsG: 0.1, proteinG: 0.9, fatG: 82, caloriesKcal: 717, sodiumMg: 11 },

  // Proteins: meat, fish, eggs — kept as directly-labeled cooked Ingredients
  // (see scope note above: ~0 carbs regardless of cooking state).
  { nameUk: "Курка (грудка, варена)", nameEn: "chicken breast, cooked", carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 31, fatG: 3.6, caloriesKcal: 165, sodiumMg: 74 },
  { nameUk: "Яловичина (варена)", nameEn: "beef, cooked, lean", carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 26, fatG: 15, caloriesKcal: 250, sodiumMg: 60 },
  { nameUk: "Індичка (варена)", nameEn: "turkey, cooked", carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 29, fatG: 2, caloriesKcal: 135, sodiumMg: 60 },
  { nameUk: "Тріска (варена)", nameEn: "cod, cooked", carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 23, fatG: 0.9, caloriesKcal: 105, sodiumMg: 78 },
  { nameUk: "Лосось (варений)", nameEn: "salmon, cooked", carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 25, fatG: 13, caloriesKcal: 208, sodiumMg: 59 },
  { nameUk: "Яйце (варене)", nameEn: "egg, boiled", carbsG: 1.1, gi: 0, fiberG: 0, sugarsG: 1.1, proteinG: 13, fatG: 11, caloriesKcal: 155, sodiumMg: 124 },

  // Legumes — RAW/dry. Cooked forms live in starter-dishes.ts (dry legumes
  // roughly triple in weight when cooked, same reasoning as grains).
  { nameUk: "Квасоля суха", nameEn: "kidney beans, dry", carbsG: 60, gi: 29, fiberG: 15, sugarsG: 2, proteinG: 24, fatG: 0.8, caloriesKcal: 333, sodiumMg: 5 },
  { nameUk: "Сочевиця суха", nameEn: "lentils, dry", carbsG: 60, gi: 32, fiberG: 11, sugarsG: 2, proteinG: 24, fatG: 1.1, caloriesKcal: 353, sodiumMg: 6 },
  { nameUk: "Нут сухий", nameEn: "chickpeas, dry", carbsG: 61, gi: 28, fiberG: 17, sugarsG: 11, proteinG: 19, fatG: 6, caloriesKcal: 364, sodiumMg: 24 },
  // Green peas: almost always used frozen/fresh in this household, not dried
  // split peas — boiling doesn't meaningfully change them, so no separate
  // Dish entry (see scope note above).
  { nameUk: "Горошок зелений", nameEn: "green peas", carbsG: 14, gi: 51, fiberG: 5.5, sugarsG: 5.9, proteinG: 5.4, fatG: 0.4, caloriesKcal: 81, sodiumMg: 5 },

  // Vegetables (raw unless noted — potato/beet/pumpkin/corn stay as labeled
  // cooked Ingredients, see scope note above)
  { nameUk: "Капуста білокачанна", nameEn: "cabbage", carbsG: 5.8, gi: 15, fiberG: 2.5, sugarsG: 3.2, proteinG: 1.3, fatG: 0.1, caloriesKcal: 25, sodiumMg: 18 },
  { nameUk: "Морква", nameEn: "carrot", carbsG: 9.6, gi: 39, fiberG: 2.8, sugarsG: 4.7, proteinG: 0.9, fatG: 0.2, caloriesKcal: 41, sodiumMg: 69 },
  { nameUk: "Буряк варений", nameEn: "beetroot, cooked", carbsG: 10, gi: 64, fiberG: 2.8, sugarsG: 8, proteinG: 1.6, fatG: 0.2, caloriesKcal: 44, sodiumMg: 77 },
  { nameUk: "Картопля варена", nameEn: "potato, boiled", carbsG: 17, gi: 78, fiberG: 1.8, sugarsG: 0.8, proteinG: 2, fatG: 0.1, caloriesKcal: 87, sodiumMg: 6 },
  { nameUk: "Огірок", nameEn: "cucumber", carbsG: 3.6, gi: 15, fiberG: 0.5, sugarsG: 1.7, proteinG: 0.7, fatG: 0.1, caloriesKcal: 15, sodiumMg: 2 },
  { nameUk: "Помідор", nameEn: "tomato", carbsG: 3.9, gi: 15, fiberG: 1.2, sugarsG: 2.6, proteinG: 0.9, fatG: 0.2, caloriesKcal: 18, sodiumMg: 5 },
  { nameUk: "Цибуля", nameEn: "onion", carbsG: 9.3, gi: 15, fiberG: 1.7, sugarsG: 4.2, proteinG: 1.1, fatG: 0.1, caloriesKcal: 40, sodiumMg: 4 },
  { nameUk: "Часник", nameEn: "garlic", carbsG: 33, gi: 30, fiberG: 2.1, sugarsG: 1, proteinG: 6.4, fatG: 0.5, caloriesKcal: 149, sodiumMg: 17 },
  { nameUk: "Кабачок", nameEn: "zucchini", carbsG: 3.1, gi: 15, fiberG: 1, sugarsG: 2.5, proteinG: 1.2, fatG: 0.3, caloriesKcal: 17, sodiumMg: 8 },
  { nameUk: "Броколі", nameEn: "broccoli", carbsG: 6.6, gi: 15, fiberG: 2.6, sugarsG: 1.7, proteinG: 2.8, fatG: 0.4, caloriesKcal: 34, sodiumMg: 33 },
  { nameUk: "Перець солодкий", nameEn: "bell pepper", carbsG: 6, gi: 15, fiberG: 2.1, sugarsG: 4.2, proteinG: 1, fatG: 0.3, caloriesKcal: 31, sodiumMg: 4 },
  { nameUk: "Гарбуз варений", nameEn: "pumpkin, cooked", carbsG: 6.5, gi: 75, fiberG: 0.5, sugarsG: 2.8, proteinG: 1, fatG: 0.1, caloriesKcal: 26, sodiumMg: 1 },
  { nameUk: "Шпинат", nameEn: "spinach", carbsG: 3.6, gi: 15, fiberG: 2.2, sugarsG: 0.4, proteinG: 2.9, fatG: 0.4, caloriesKcal: 23, sodiumMg: 79 },
  { nameUk: "Салат листовий", nameEn: "lettuce", carbsG: 2.9, gi: 15, fiberG: 1.3, sugarsG: 0.8, proteinG: 1.4, fatG: 0.2, caloriesKcal: 15, sodiumMg: 28 },
  { nameUk: "Редис", nameEn: "radish", carbsG: 3.4, gi: 15, fiberG: 1.6, sugarsG: 1.9, proteinG: 0.7, fatG: 0.1, caloriesKcal: 16, sodiumMg: 39 },
  { nameUk: "Гриби печериці", nameEn: "mushrooms, white button", carbsG: 3.3, gi: 15, fiberG: 1, sugarsG: 2, proteinG: 3.1, fatG: 0.3, caloriesKcal: 22, sodiumMg: 5 },
  { nameUk: "Кукурудза варена", nameEn: "corn, boiled", carbsG: 19, gi: 60, fiberG: 2.7, sugarsG: 3.2, proteinG: 3.4, fatG: 1.5, caloriesKcal: 96, sodiumMg: 15 },

  // Fruits
  { nameUk: "Яблуко", nameEn: "apple", carbsG: 14, gi: 36, fiberG: 2.4, sugarsG: 10, proteinG: 0.3, fatG: 0.2, caloriesKcal: 52, sodiumMg: 1 },
  { nameUk: "Груша", nameEn: "pear", carbsG: 15, gi: 38, fiberG: 3.1, sugarsG: 10, proteinG: 0.4, fatG: 0.1, caloriesKcal: 57, sodiumMg: 1 },
  { nameUk: "Банан", nameEn: "banana", carbsG: 23, gi: 51, fiberG: 2.6, sugarsG: 12, proteinG: 1.1, fatG: 0.3, caloriesKcal: 89, sodiumMg: 1 },
  { nameUk: "Апельсин", nameEn: "orange", carbsG: 12, gi: 43, fiberG: 2.4, sugarsG: 9, proteinG: 0.9, fatG: 0.1, caloriesKcal: 47, sodiumMg: 0 },
  { nameUk: "Полуниця", nameEn: "strawberries", carbsG: 7.7, gi: 40, fiberG: 2, sugarsG: 4.9, proteinG: 0.7, fatG: 0.3, caloriesKcal: 32, sodiumMg: 1 },
  { nameUk: "Слива", nameEn: "plum", carbsG: 11, gi: 39, fiberG: 1.4, sugarsG: 9.9, proteinG: 0.7, fatG: 0.3, caloriesKcal: 46, sodiumMg: 0 },
  { nameUk: "Виноград", nameEn: "grapes", carbsG: 18, gi: 59, fiberG: 0.9, sugarsG: 16, proteinG: 0.6, fatG: 0.2, caloriesKcal: 69, sodiumMg: 2 },

  // Nuts & fats
  { nameUk: "Волоські горіхи", nameEn: "walnuts", carbsG: 13.7, gi: 15, fiberG: 6.7, sugarsG: 2.6, proteinG: 15, fatG: 65, caloriesKcal: 654, sodiumMg: 2 },
  { nameUk: "Мигдаль", nameEn: "almonds", carbsG: 22, gi: 15, fiberG: 12.5, sugarsG: 4.4, proteinG: 21, fatG: 50, caloriesKcal: 579, sodiumMg: 1 },
  { nameUk: "Олія соняшникова", nameEn: "sunflower oil", carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 100, caloriesKcal: 884, sodiumMg: 0 },
  { nameUk: "Олія оливкова", nameEn: "olive oil", carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 100, caloriesKcal: 884, sodiumMg: 2 },
];
