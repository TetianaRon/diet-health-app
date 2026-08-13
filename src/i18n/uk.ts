// Single source of Ukrainian UI strings — don't hardcode UI text elsewhere.
export const uk = {
  appName: "Трекер Діабету",
  tabs: {
    today: "Сьогодні",
    foods: "Продукти",
    bloodSugar: "Цукор",
    settings: "Налаштування",
  },
  today: {
    title: "Сьогодні",
    placeholder: "Тут з'явиться щоденний журнал харчування.",
  },
  foods: {
    title: "Продукти",
    placeholder: "Тут з'являться інгредієнти та страви.",
  },
  bloodSugar: {
    title: "Цукор у крові",
    placeholder: "Тут з'явиться журнал вимірювань цукру.",
  },
  settings: {
    title: "Налаштування",
    placeholder: "Тут з'являться цілі та розклад харчування.",
  },
} as const;
