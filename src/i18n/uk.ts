// Single source of Ukrainian UI strings — don't hardcode UI text elsewhere.
export const uk = {
  appName: "Трекер харчування",
  tabs: {
    today: "Сьогодні",
    foods: "Продукти",
    bloodSugar: "Цукор",
    settings: "Налаштування",
  },
  // Per-item GI/GL classification labels — see classifyGi/classifyGl in
  // src/lib/health.ts (standard bands, matching mom's own reference table).
  // Distinct from the *daily* GL target in Settings.
  health: {
    gi: { low: "низький", medium: "середній", high: "високий" },
    gl: { low: "низьке", moderate: "помірне", high: "високе" },
  },
  today: {
    title: "Сьогодні",
    loading: "Завантаження...",
    signIn: {
      message: "Увійдіть через Google, щоб вести щоденний журнал харчування.",
      button: "Увійти через Google",
    },
    offlineNotice:
      "Немає з'єднання — показано збережені раніше дані. Нові записи не збережуться, доки з'єднання не відновиться.",
    progress: {
      carbs: "Вуглеводи",
      calories: "Калорії",
      glycemicLoad: "Глікемічне навантаження",
    },
    totals: {
      fat: (grams: number) => `Жири сьогодні: ${grams} г`,
      sugars: (grams: number) => `Цукри сьогодні: ${grams} г`,
      protein: (grams: number) => `Білки сьогодні: ${grams} г`,
      sodium: (mg: number) => `Натрій сьогодні: ${mg} мг`,
    },
    mealGapWarning: (hours: number) =>
      `Минуло ${hours.toFixed(1)} год з останнього прийому їжі — час перекусити.`,
    fatWarning: (mealType: string, overByGrams: number) =>
      `${mealType}: жиру забагато на ${overByGrams.toFixed(1)} г понад ліміт на прийом їжі.`,
    addButton: "Додати прийом їжі",
    addAnotherHint: "Продукт додано. Можете додати ще один, або натиснути «Зберегти запис».",
    doneButton: "Зберегти запис",
    empty: "Сьогодні ще немає записів.",
    historyTitle: "Останні 3 дні",
    historyEmpty: "За останні 3 дні записів немає.",
    latestBloodSugar: (valueMmolL: number, contextLabel: string) => `${valueMmolL} ммоль/л (${contextLabel})`,
    entryMeta: (portionGrams: number, carbsG: number, caloriesKcal: number) =>
      `${portionGrams} г — ${carbsG} г вуглеводів, ${caloriesKcal} ккал`,
    // "1. Сніданок" — a simple running count of today's meal occasions, so
    // mom can tell apart e.g. her 2nd snack of the day from her 1st at a
    // glance, without needing to read the clock time next to it.
    mealHeading: (index: number, mealType: string) => `${index}. ${mealType}`,
    mealTotal: (carbsG: number, caloriesKcal: number, gl: number) =>
      `Разом за прийом: ${carbsG} г вуглеводів, ${caloriesKcal} ккал, ГН ${gl}`,
    form: {
      mealTypeLabel: "Прийом їжі",
      timestampLabel: "Час",
      itemLabel: "Продукт або страва",
      itemPlaceholder: "Пошук продукту...",
      portionLabel: "Порція (г)",
      notesLabel: "Примітка",
      notesPlaceholder: "необов'язково",
      noMatches: "Нічого не знайдено. Спочатку додайте продукт на вкладці «Продукти».",
      preview: (carbsG: number, caloriesKcal: number, gl: number) =>
        `${carbsG} г вуглеводів, ${caloriesKcal} ккал, ГЛ ${gl}`,
      saveButton: "Додати",
      validationError: "Оберіть продукт, вкажіть порцію у грамах і час прийому їжі.",
    },
  },
  foods: {
    title: "Продукти",
    subTabs: {
      ingredients: "Продукти",
      dishes: "Страви",
    },
    searchPlaceholder: "Пошук продукту...",
    addButton: "Додати продукт",
    cancelButton: "Скасувати",
    loading: "Завантаження...",
    noResults: "Нічого не знайдено.",
    giLegend:
      "ГІ — глікемічний індекс (наскільки швидко продукт підвищує цукор у крові). Значок «≈» означає орієнтовне значення, ще не перевірене за надійним джерелом.",
    favoriteLabel: "Додати в обране",
    unfavoriteLabel: "Прибрати з обраного",
    editLabel: "Редагувати",
    editForm: {
      title: "Редагувати продукт",
      nameUkLabel: "Назва (укр.)",
      nameEnLabel: "Назва (англ., необов'язково)",
      saveButton: "Зберегти зміни",
      validationError: "Заповніть назву і всі числові поля коректними значеннями.",
    },
    glycemicFlag: {
      none: "Без позначки",
      watch: "Обережно",
      avoid: "Уникати",
      toggleLabel: (state: "none" | "watch" | "avoid") =>
        `Позначка: ${
          state === "none" ? "без позначки" : state === "watch" ? "обережно" : "уникати"
        }. Натисніть, щоб змінити.`,
    },
    signIn: {
      message: "Увійдіть через Google, щоб переглянути та додати продукти.",
      button: "Увійти через Google",
    },
    form: {
      nameUkLabel: "Пошук продукту",
      nameUkPlaceholder: "напр. гречка варена",
      nameUkHint:
        "Якщо важливо, вкажіть спосіб приготування (варене, смажене, сире тощо) та тип продукту (сухий, консервований, свіжий, морожений тощо) — це впливає на калорійність і допомагає пошуку знайти точніший варіант.",
      pickButton: "Обрати",
      lookupButton: "Знайти",
      lookupLoading: "Пошук...",
      saveNameLabel: "Назва для збереження",
      saveNameHint:
        "Це буде назва продукту у вашому списку. Якщо ви шукали загальну назву (наприклад «квасоля») і обрали конкретний варіант, уточніть назву тут — так кілька варіантів не переплутаються між собою.",
      saveButton: "Зберегти",
      notFound: "Не знайдено — введіть дані вручну.",
      validationError: "Заповніть назву для збереження і всі числові поля коректними значеннями.",
      duplicateNameWarning: (name: string) =>
        `Продукт «${name}» вже є у вашому списку. Зберегти однаково? Існуючий запис буде замінено новими даними.`,
      confirmOverwriteButton: "Так, замінити",
      giVerifiedLabel: "Я перевірив(ла) глікемічний індекс за надійним джерелом",
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
  dishes: {
    addButton: "Додати страву",
    noResults: "Нічого не знайдено.",
    editLabel: "Редагувати",
    composeLinkLabel: "Створити власний рецепт з кількох продуктів",
    backToStarterLabel: "← Назад до готових страв",
    containsFlaggedIngredientHint: "△ Містить продукт із позначкою — можливо, варто перевірити склад",
    approximateGiNote:
      "≈ ГІ страви — приблизний розрахунок за інгредієнтами, а не лабораторний вимір. Для страв, де все готується разом (суп, рагу), реальний ГІ може відрізнятися — спосіб приготування та поєднання продуктів впливають на нього, а це неможливо точно порахувати.",
    flagIngredientsPrompt: {
      title: "Позначити окремі продукти цієї страви? (необов'язково)",
    },
    form: {
      searchLabel: "Пошук готової страви",
      searchPlaceholder: "напр. гречка варена",
      addButton: "Додати",
      hint: "Готові страви з базової бази — додаються одразу. Для власного рецепту з кількох продуктів скористайтесь вкладкою «Власний рецепт».",
    },
    composeForm: {
      nameLabel: "Назва страви",
      namePlaceholder: "напр. борщ",
      ingredientLabel: "Інгредієнт",
      ingredientPlaceholder: "Пошук продукту...",
      gramsLabel: "Грамів (сирих)",
      addIngredientButton: "Додати інгредієнт",
      removeIngredientButton: "Прибрати",
      yieldLabel: "Вага готової страви (г)",
      yieldHint: "Загальна вага після приготування — вода додає вагу, але не калорії.",
      unresolvedIngredient: "Такого продукту немає в базі — спочатку додайте його на вкладці «Продукти».",
      // giVerifiedMarker: "" once she's checked "Я перевірив(ла)...", "≈" until then.
      preview: (carbsG: number, caloriesKcal: number, gi: number, giVerifiedMarker: string) =>
        `На 100г готової страви: ${carbsG} г вуглеводів, ${caloriesKcal} ккал, ${giVerifiedMarker}ГІ ${gi}`,
      saveButton: "Зберегти",
      validationError: "Заповніть назву страви, оберіть інгредієнти з бази з коректними грамами та вкажіть вагу готової страви.",
    },
  },
  bloodSugar: {
    title: "Цукор у крові",
    loading: "Завантаження...",
    signIn: {
      message: "Увійдіть через Google, щоб вести журнал вимірювань цукру.",
      button: "Увійти через Google",
    },
    addButton: "Додати вимірювання",
    cancelButton: "Скасувати",
    empty: "Записів ще немає.",
    latestLabel: "Останнє вимірювання",
    status: {
      inRange: "У межах норми",
      tooLow: "Нижче норми",
      tooHigh: "Вище норми",
    },
    context: {
      fasting: "Натщесерце",
      "after-meal": "Після їжі",
      other: "Інше",
    },
    form: {
      valueLabel: "Рівень цукру (ммоль/л)",
      contextLabel: "Коли",
      notesLabel: "Примітка",
      notesPlaceholder: "необов'язково",
      saveButton: "Зберегти",
      validationError: "Вкажіть коректне значення цукру.",
    },
    mealsBefore: {
      toggleLabel: "Прийоми їжі перед цим вимірюванням",
      empty: "Немає записів прийомів їжі перед цим вимірюванням.",
      lessThanHourAgo: "менше години тому",
      hoursAgo: (hours: number) => `${hours.toFixed(1)} год тому`,
    },
  },
  settings: {
    title: "Налаштування",
    loading: "Завантаження...",
    saveButton: "Зберегти",
    saved: "Збережено!",
    validationError: "Заповніть усі поля коректними числовими значеннями.",
    privacyPolicyLink: "Політика конфіденційності",
    account: {
      title: "Обліковий запис Google",
      notSignedIn: "Не увійшли",
      signedIn: "Увійшли",
      signInButton: "Увійти через Google",
      signOutButton: "Вийти",
    },
    spreadsheet: {
      title: "Таблиця Google Sheets",
      newSpreadsheetTitle: "Нова таблиця",
      newSpreadsheetHint:
        "Створити нову таблицю Google Sheets у папці «Track My Meals» на вашому Google Диску — з усіма потрібними вкладками одразу.",
      newNameLabel: "Назва таблиці",
      newNameDefault: "Мої дані — Трекер харчування",
      newNameValidationError: "Введіть назву для нової таблиці.",
      createButton: "Створити",
      creating: "Створення таблиці...",
      createdNew: "Нову таблицю створено та підключено!",
      signInToCreateHint: "Увійдіть через Google, щоб створити нову таблицю.",
      existingSpreadsheetTitle: "Наявна таблиця",
      hint: "Вставте посилання на вашу таблицю Google Sheets (або тільки її ID). Кожен пристрій може використовувати свою таблицю.",
      inputLabel: "Посилання або ID таблиці",
      placeholder: "https://docs.google.com/spreadsheets/d/...",
      saveButton: "Зберегти",
      saved: "Збережено!",
      validationError: "Вставте посилання або ID таблиці.",
      connectMomButton: "Підключити мамину таблицю",
      connectMomSaved: "Підключено мамину таблицю!",
      connectTestButton: "Підключити тестову таблицю",
      connectTestSaved: "Підключено тестову таблицю!",
      copyLinkButton: "Копіювати посилання на таблицю",
      copyLinkSaved: "Посилання скопійовано!",
      copyLinkError: "Не вдалося скопіювати посилання.",
      checking: "Перевірка вкладок таблиці...",
      tabsOk: "✓ Усі потрібні вкладки знайдено.",
      tabsMissing: (missing: string[]) =>
        `У цій таблиці відсутні вкладки: ${missing.join(", ")}. Це трапляється з новою порожньою таблицею Google Sheets. Натисніть «Ініціалізувати», щоб створити їх автоматично.`,
      initializeButton: "Ініціалізувати таблицю",
      initializing: "Створення вкладок...",
      initializeError: "Не вдалося ініціалізувати таблицю.",
      initializeDone: "Готово! Таблицю налаштовано.",
    },
    fields: {
      dailyCarbsTarget: "Денна норма вуглеводів (г)",
      fatPerMealLimit: "Ліміт жиру на прийом їжі (г)",
      dailyCaloriesTarget: "Денна норма калорій (ккал)",
      mealsPerDay: "Прийомів їжі на день",
      maxGapHours: "Макс. проміжок між прийомами їжі (год)",
      bloodSugarMin: "Мінімальний цукор (ммоль/л)",
      bloodSugarMax: "Максимальний цукор (ммоль/л)",
      wakeTime: "Час пробудження",
      sleepTime: "Час сну",
      dailyGlycemicLoadTarget: "Денна норма глікемічного навантаження",
      showCarbsProgress: "Показувати вуглеводи на екрані «Сьогодні»",
      showCaloriesProgress: "Показувати калорії на екрані «Сьогодні»",
      showGlycemicLoadProgress: "Показувати глікемічне навантаження на екрані «Сьогодні»",
      showFatTotal: "Показувати денну суму жирів на екрані «Сьогодні»",
      showSugarsTotal: "Показувати денну суму цукрів на екрані «Сьогодні»",
      showProteinTotal: "Показувати денну суму білків на екрані «Сьогодні»",
      showSodiumTotal: "Показувати денну суму натрію на екрані «Сьогодні»",
    },
  },
  reminders: {
    notificationTitle: "Трекер харчування",
    notificationBody: "Час перевірити, чи не пора поїсти",
  },
} as const;
