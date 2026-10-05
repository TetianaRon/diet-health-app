// The built-in items as they were before release 1.8 (starter-foods.ts +
// starter-dishes.ts, generated from them on 2026-10-05, after which those
// files were removed). Frozen — never edit. Used for two things only:
//   • recognising sheet rows saved under an OLD built-in name (pre-1.6 rows
//     without BasedOn, and the sheet upgrade's name linking);
//   • the copy-update offer: a saved copy (BasedOn = B…) that still holds these
//     values wasn't changed by the user, so it can be offered the verified
//     values from verified-foods.json.
// B0058–B0069 were built-in *dishes* (raw value ÷ cooking yield); since 1.8 the
// same IDs are ordinary built-in products with measured cooked values.

export interface LegacyBuiltIn {
  id: string;
  nameUk: string;
  kind: "food" | "dish";
  values: { carbsG: number; gi: number; fiberG: number; sugarsG: number; proteinG: number; fatG: number; caloriesKcal: number; sodiumMg: number };
}

export const LEGACY_BUILT_INS: readonly LegacyBuiltIn[] = [
  { id: "B0001", nameUk: "Гречка суха", kind: "food", values: { carbsG: 71.5, gi: 50, fiberG: 10, sugarsG: 0, proteinG: 13.2, fatG: 3.4, caloriesKcal: 343, sodiumMg: 1 } },
  { id: "B0002", nameUk: "Рис білий сирий", kind: "food", values: { carbsG: 79, gi: 73, fiberG: 1.3, sugarsG: 0.1, proteinG: 7.1, fatG: 0.7, caloriesKcal: 365, sodiumMg: 5 } },
  { id: "B0003", nameUk: "Рис бурий сирий", kind: "food", values: { carbsG: 77, gi: 68, fiberG: 3.5, sugarsG: 0.9, proteinG: 7.9, fatG: 2.9, caloriesKcal: 370, sodiumMg: 7 } },
  { id: "B0004", nameUk: "Вівсяні пластівці сирі", kind: "food", values: { carbsG: 66, gi: 58, fiberG: 10, sugarsG: 1, proteinG: 17, fatG: 7, caloriesKcal: 389, sodiumMg: 2 } },
  { id: "B0005", nameUk: "Пшоно сире", kind: "food", values: { carbsG: 73, gi: 71, fiberG: 8.5, sugarsG: 0, proteinG: 11, fatG: 4.2, caloriesKcal: 378, sodiumMg: 5 } },
  { id: "B0006", nameUk: "Перлова крупа суха", kind: "food", values: { carbsG: 77.7, gi: 25, fiberG: 15.6, sugarsG: 0.8, proteinG: 9.9, fatG: 1.2, caloriesKcal: 352, sodiumMg: 9 } },
  { id: "B0007", nameUk: "Манна крупа суха", kind: "food", values: { carbsG: 77, gi: 55, fiberG: 3.9, sugarsG: 0.7, proteinG: 12.7, fatG: 1.1, caloriesKcal: 360, sodiumMg: 1 } },
  { id: "B0008", nameUk: "Кукурудзяна крупа суха", kind: "food", values: { carbsG: 76.9, gi: 68, fiberG: 7.3, sugarsG: 0.6, proteinG: 8.1, fatG: 3.6, caloriesKcal: 370, sodiumMg: 6 } },
  { id: "B0009", nameUk: "Макарони сухі", kind: "food", values: { carbsG: 75, gi: 50, fiberG: 3.2, sugarsG: 2.7, proteinG: 13, fatG: 1.5, caloriesKcal: 371, sodiumMg: 6 } },
  { id: "B0010", nameUk: "Хліб житній", kind: "food", values: { carbsG: 48, gi: 58, fiberG: 6, sugarsG: 4, proteinG: 8.5, fatG: 1.7, caloriesKcal: 250, sodiumMg: 660 } },
  { id: "B0011", nameUk: "Хліб білий", kind: "food", values: { carbsG: 49, gi: 75, fiberG: 2.7, sugarsG: 5, proteinG: 9, fatG: 3.2, caloriesKcal: 265, sodiumMg: 490 } },
  { id: "B0012", nameUk: "Кефір знежирений", kind: "food", values: { carbsG: 4, gi: 32, fiberG: 0, sugarsG: 4, proteinG: 3.4, fatG: 1, caloriesKcal: 41, sodiumMg: 40 } },
  { id: "B0013", nameUk: "Молоко 2.5%", kind: "food", values: { carbsG: 4.7, gi: 30, fiberG: 0, sugarsG: 4.7, proteinG: 3.2, fatG: 2.5, caloriesKcal: 52, sodiumMg: 44 } },
  { id: "B0014", nameUk: "Йогурт натуральний знежирений", kind: "food", values: { carbsG: 4.7, gi: 35, fiberG: 0, sugarsG: 4.7, proteinG: 5.3, fatG: 1.5, caloriesKcal: 56, sodiumMg: 46 } },
  { id: "B0015", nameUk: "Сир кисломолочний нежирний", kind: "food", values: { carbsG: 3.4, gi: 30, fiberG: 0, sugarsG: 3.4, proteinG: 18, fatG: 1.8, caloriesKcal: 98, sodiumMg: 405 } },
  { id: "B0016", nameUk: "Сир твердий", kind: "food", values: { carbsG: 1.3, gi: 0, fiberG: 0, sugarsG: 1.3, proteinG: 25, fatG: 27, caloriesKcal: 356, sodiumMg: 620 } },
  { id: "B0017", nameUk: "Сметана 15%", kind: "food", values: { carbsG: 3, gi: 0, fiberG: 0, sugarsG: 3, proteinG: 2.6, fatG: 15, caloriesKcal: 158, sodiumMg: 32 } },
  { id: "B0018", nameUk: "Масло вершкове", kind: "food", values: { carbsG: 0.1, gi: 0, fiberG: 0, sugarsG: 0.1, proteinG: 0.9, fatG: 82, caloriesKcal: 717, sodiumMg: 11 } },
  { id: "B0019", nameUk: "Курка (грудка, варена)", kind: "food", values: { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 31, fatG: 3.6, caloriesKcal: 165, sodiumMg: 74 } },
  { id: "B0020", nameUk: "Яловичина пісна (варена)", kind: "food", values: { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 26, fatG: 15, caloriesKcal: 250, sodiumMg: 60 } },
  { id: "B0021", nameUk: "Індичка (варена)", kind: "food", values: { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 29, fatG: 2, caloriesKcal: 135, sodiumMg: 60 } },
  { id: "B0022", nameUk: "Тріска (варена)", kind: "food", values: { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 23, fatG: 0.9, caloriesKcal: 105, sodiumMg: 78 } },
  { id: "B0023", nameUk: "Лосось (варений)", kind: "food", values: { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 25, fatG: 13, caloriesKcal: 208, sodiumMg: 59 } },
  { id: "B0024", nameUk: "Яйце (варене)", kind: "food", values: { carbsG: 1.1, gi: 0, fiberG: 0, sugarsG: 1.1, proteinG: 13, fatG: 11, caloriesKcal: 155, sodiumMg: 124 } },
  { id: "B0025", nameUk: "Квасоля суха", kind: "food", values: { carbsG: 60, gi: 29, fiberG: 15, sugarsG: 2, proteinG: 24, fatG: 0.8, caloriesKcal: 333, sodiumMg: 5 } },
  { id: "B0026", nameUk: "Сочевиця суха", kind: "food", values: { carbsG: 60, gi: 32, fiberG: 11, sugarsG: 2, proteinG: 24, fatG: 1.1, caloriesKcal: 353, sodiumMg: 6 } },
  { id: "B0027", nameUk: "Нут сухий", kind: "food", values: { carbsG: 61, gi: 28, fiberG: 17, sugarsG: 11, proteinG: 19, fatG: 6, caloriesKcal: 364, sodiumMg: 24 } },
  { id: "B0028", nameUk: "Горошок зелений", kind: "food", values: { carbsG: 14, gi: 51, fiberG: 5.5, sugarsG: 5.9, proteinG: 5.4, fatG: 0.4, caloriesKcal: 81, sodiumMg: 5 } },
  { id: "B0029", nameUk: "Капуста білокачанна", kind: "food", values: { carbsG: 5.8, gi: 15, fiberG: 2.5, sugarsG: 3.2, proteinG: 1.3, fatG: 0.1, caloriesKcal: 25, sodiumMg: 18 } },
  { id: "B0030", nameUk: "Морква сира", kind: "food", values: { carbsG: 9.6, gi: 16, fiberG: 2.8, sugarsG: 4.7, proteinG: 0.9, fatG: 0.2, caloriesKcal: 41, sodiumMg: 69 } },
  { id: "B0031", nameUk: "Морква варена", kind: "food", values: { carbsG: 9.6, gi: 39, fiberG: 2.8, sugarsG: 4.7, proteinG: 0.9, fatG: 0.2, caloriesKcal: 41, sodiumMg: 69 } },
  { id: "B0032", nameUk: "Буряк варений", kind: "food", values: { carbsG: 10, gi: 64, fiberG: 2.8, sugarsG: 8, proteinG: 1.6, fatG: 0.2, caloriesKcal: 44, sodiumMg: 77 } },
  { id: "B0033", nameUk: "Картопля варена", kind: "food", values: { carbsG: 17, gi: 78, fiberG: 1.8, sugarsG: 0.8, proteinG: 2, fatG: 0.1, caloriesKcal: 87, sodiumMg: 6 } },
  { id: "B0034", nameUk: "Огірок", kind: "food", values: { carbsG: 3.6, gi: 15, fiberG: 0.5, sugarsG: 1.7, proteinG: 0.7, fatG: 0.1, caloriesKcal: 15, sodiumMg: 2 } },
  { id: "B0035", nameUk: "Помідор", kind: "food", values: { carbsG: 3.9, gi: 15, fiberG: 1.2, sugarsG: 2.6, proteinG: 0.9, fatG: 0.2, caloriesKcal: 18, sodiumMg: 5 } },
  { id: "B0036", nameUk: "Цибуля", kind: "food", values: { carbsG: 9.3, gi: 15, fiberG: 1.7, sugarsG: 4.2, proteinG: 1.1, fatG: 0.1, caloriesKcal: 40, sodiumMg: 4 } },
  { id: "B0037", nameUk: "Часник", kind: "food", values: { carbsG: 33, gi: 30, fiberG: 2.1, sugarsG: 1, proteinG: 6.4, fatG: 0.5, caloriesKcal: 149, sodiumMg: 17 } },
  { id: "B0038", nameUk: "Кабачок", kind: "food", values: { carbsG: 3.1, gi: 15, fiberG: 1, sugarsG: 2.5, proteinG: 1.2, fatG: 0.3, caloriesKcal: 17, sodiumMg: 8 } },
  { id: "B0039", nameUk: "Броколі", kind: "food", values: { carbsG: 6.6, gi: 15, fiberG: 2.6, sugarsG: 1.7, proteinG: 2.8, fatG: 0.4, caloriesKcal: 34, sodiumMg: 33 } },
  { id: "B0040", nameUk: "Перець солодкий", kind: "food", values: { carbsG: 6, gi: 15, fiberG: 2.1, sugarsG: 4.2, proteinG: 1, fatG: 0.3, caloriesKcal: 31, sodiumMg: 4 } },
  { id: "B0041", nameUk: "Гарбуз варений", kind: "food", values: { carbsG: 6.5, gi: 75, fiberG: 0.5, sugarsG: 2.8, proteinG: 1, fatG: 0.1, caloriesKcal: 26, sodiumMg: 1 } },
  { id: "B0042", nameUk: "Шпинат", kind: "food", values: { carbsG: 3.6, gi: 15, fiberG: 2.2, sugarsG: 0.4, proteinG: 2.9, fatG: 0.4, caloriesKcal: 23, sodiumMg: 79 } },
  { id: "B0043", nameUk: "Салат листовий", kind: "food", values: { carbsG: 2.9, gi: 15, fiberG: 1.3, sugarsG: 0.8, proteinG: 1.4, fatG: 0.2, caloriesKcal: 15, sodiumMg: 28 } },
  { id: "B0044", nameUk: "Редис", kind: "food", values: { carbsG: 3.4, gi: 15, fiberG: 1.6, sugarsG: 1.9, proteinG: 0.7, fatG: 0.1, caloriesKcal: 16, sodiumMg: 39 } },
  { id: "B0045", nameUk: "Гриби печериці", kind: "food", values: { carbsG: 3.3, gi: 15, fiberG: 1, sugarsG: 2, proteinG: 3.1, fatG: 0.3, caloriesKcal: 22, sodiumMg: 5 } },
  { id: "B0046", nameUk: "Кукурудза варена", kind: "food", values: { carbsG: 19, gi: 60, fiberG: 2.7, sugarsG: 3.2, proteinG: 3.4, fatG: 1.5, caloriesKcal: 96, sodiumMg: 15 } },
  { id: "B0047", nameUk: "Яблуко", kind: "food", values: { carbsG: 14, gi: 36, fiberG: 2.4, sugarsG: 10, proteinG: 0.3, fatG: 0.2, caloriesKcal: 52, sodiumMg: 1 } },
  { id: "B0048", nameUk: "Груша", kind: "food", values: { carbsG: 15, gi: 38, fiberG: 3.1, sugarsG: 10, proteinG: 0.4, fatG: 0.1, caloriesKcal: 57, sodiumMg: 1 } },
  { id: "B0049", nameUk: "Банан", kind: "food", values: { carbsG: 23, gi: 51, fiberG: 2.6, sugarsG: 12, proteinG: 1.1, fatG: 0.3, caloriesKcal: 89, sodiumMg: 1 } },
  { id: "B0050", nameUk: "Апельсин", kind: "food", values: { carbsG: 12, gi: 43, fiberG: 2.4, sugarsG: 9, proteinG: 0.9, fatG: 0.1, caloriesKcal: 47, sodiumMg: 0 } },
  { id: "B0051", nameUk: "Полуниця", kind: "food", values: { carbsG: 7.7, gi: 40, fiberG: 2, sugarsG: 4.9, proteinG: 0.7, fatG: 0.3, caloriesKcal: 32, sodiumMg: 1 } },
  { id: "B0052", nameUk: "Слива", kind: "food", values: { carbsG: 11, gi: 39, fiberG: 1.4, sugarsG: 9.9, proteinG: 0.7, fatG: 0.3, caloriesKcal: 46, sodiumMg: 0 } },
  { id: "B0053", nameUk: "Виноград", kind: "food", values: { carbsG: 18, gi: 59, fiberG: 0.9, sugarsG: 16, proteinG: 0.6, fatG: 0.2, caloriesKcal: 69, sodiumMg: 2 } },
  { id: "B0054", nameUk: "Волоські горіхи", kind: "food", values: { carbsG: 13.7, gi: 15, fiberG: 6.7, sugarsG: 2.6, proteinG: 15, fatG: 65, caloriesKcal: 654, sodiumMg: 2 } },
  { id: "B0055", nameUk: "Мигдаль", kind: "food", values: { carbsG: 22, gi: 15, fiberG: 12.5, sugarsG: 4.4, proteinG: 21, fatG: 50, caloriesKcal: 579, sodiumMg: 1 } },
  { id: "B0056", nameUk: "Олія соняшникова", kind: "food", values: { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 100, caloriesKcal: 884, sodiumMg: 0 } },
  { id: "B0057", nameUk: "Олія оливкова", kind: "food", values: { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 100, caloriesKcal: 884, sodiumMg: 2 } },
  { id: "B0058", nameUk: "Гречка варена", kind: "dish", values: { carbsG: 19.86, gi: 50, fiberG: 2.78, sugarsG: 0, proteinG: 3.67, fatG: 0.94, caloriesKcal: 95.28, sodiumMg: 0.28 } },
  { id: "B0059", nameUk: "Рис білий варений", kind: "dish", values: { carbsG: 28.21, gi: 73, fiberG: 0.46, sugarsG: 0.04, proteinG: 2.54, fatG: 0.25, caloriesKcal: 130.36, sodiumMg: 1.79 } },
  { id: "B0060", nameUk: "Рис бурий варений", kind: "dish", values: { carbsG: 22.99, gi: 68, fiberG: 1.04, sugarsG: 0.27, proteinG: 2.36, fatG: 0.87, caloriesKcal: 110.45, sodiumMg: 2.09 } },
  { id: "B0061", nameUk: "Вівсяна каша на воді", kind: "dish", values: { carbsG: 12, gi: 58, fiberG: 1.82, sugarsG: 0.18, proteinG: 3.09, fatG: 1.27, caloriesKcal: 70.73, sodiumMg: 0.36 } },
  { id: "B0062", nameUk: "Пшоно варене", kind: "dish", values: { carbsG: 22.81, gi: 71, fiberG: 2.66, sugarsG: 0, proteinG: 3.44, fatG: 1.31, caloriesKcal: 118.13, sodiumMg: 1.56 } },
  { id: "B0063", nameUk: "Перлова крупа варена", kind: "dish", values: { carbsG: 27.75, gi: 25, fiberG: 5.57, sugarsG: 0.29, proteinG: 3.54, fatG: 0.43, caloriesKcal: 125.71, sodiumMg: 3.21 } },
  { id: "B0064", nameUk: "Манна каша варена", kind: "dish", values: { carbsG: 15.4, gi: 55, fiberG: 0.78, sugarsG: 0.14, proteinG: 2.54, fatG: 0.22, caloriesKcal: 72, sodiumMg: 0.2 } },
  { id: "B0065", nameUk: "Кукурудзяна каша варена", kind: "dish", values: { carbsG: 20.51, gi: 68, fiberG: 1.95, sugarsG: 0.16, proteinG: 2.16, fatG: 0.96, caloriesKcal: 98.67, sodiumMg: 1.6 } },
  { id: "B0066", nameUk: "Макарони варені", kind: "dish", values: { carbsG: 25.86, gi: 50, fiberG: 1.1, sugarsG: 0.93, proteinG: 4.48, fatG: 0.52, caloriesKcal: 127.93, sodiumMg: 2.07 } },
  { id: "B0067", nameUk: "Квасоля варена", kind: "dish", values: { carbsG: 23.08, gi: 29, fiberG: 5.77, sugarsG: 0.77, proteinG: 9.23, fatG: 0.31, caloriesKcal: 128.08, sodiumMg: 1.92 } },
  { id: "B0068", nameUk: "Сочевиця варена", kind: "dish", values: { carbsG: 20, gi: 32, fiberG: 3.67, sugarsG: 0.67, proteinG: 8, fatG: 0.37, caloriesKcal: 117.67, sodiumMg: 2 } },
  { id: "B0069", nameUk: "Нут варений", kind: "dish", values: { carbsG: 27.11, gi: 28, fiberG: 7.56, sugarsG: 4.89, proteinG: 8.44, fatG: 2.67, caloriesKcal: 161.78, sodiumMg: 10.67 } },
];
