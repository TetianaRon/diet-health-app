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
    searchPlaceholder: "Пошук продукту...",
    addButton: "Додати продукт",
    cancelButton: "Скасувати",
    loading: "Завантаження...",
    empty: "Продуктів ще немає.",
    noResults: "Нічого не знайдено.",
    signIn: {
      message: "Увійдіть через Google, щоб переглянути та додати продукти.",
      button: "Увійти через Google",
    },
    form: {
      nameUkLabel: "Назва (українською)",
      nameEnLabel: "Назва (англійською, для пошуку)",
      lookupButton: "Знайти",
      lookupLoading: "Пошук...",
      saveButton: "Зберегти",
      notFound: "Не знайдено — введіть дані вручну.",
      validationError: "Заповніть усі числові поля коректними значеннями.",
      sourceLabel: "Джерело",
      source: {
        starter: "Базова база",
        usda: "USDA",
        manual: "Вручну",
      },
      fields: {
        carbsG: "Вуглеводи (г)",
        gi: "Глікемічний індекс",
        fiberG: "Клітковина (г)",
        sugarsG: "Цукри (г)",
        proteinG: "Білки (г)",
        fatG: "Жири (г)",
        caloriesKcal: "Калорії (ккал)",
        sodiumMg: "Натрій (мг)",
      },
    },
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
