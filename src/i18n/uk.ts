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
    empty: "Сьогодні ще немає записів.",
    mealsLeft: (left: number, planned: number) => `Залишилось прийомів їжі: ${left}/${planned}`,
    latestBloodSugar: (valueMmolL: number, contextLabel: string) => `${valueMmolL} ммоль/л (${contextLabel})`,
    // A dish's line inside a meal on Today — weight only; the meal's own
    // line carries the full stats (see mealStat below).
    dishWeight: (portionGrams: number) => `${portionGrams} г`,
    carbsValue: (g: number) => `${g} г вуглеводів`,
    caloriesValue: (kcal: number) => `${kcal} ккал`,
    unknownValueLabel: "невідомо",
    // Meal- and day-level caveats — the underlying totals already exclude
    // an unknown field from the sum (see sumKnownField in dailyLog.ts), so
    // these are purely "something here has a gap," not a correctness fix.
    mealHasUnknownSuffix: "(є позиції з невідомими значеннями)",
    unknownValuesNotice: (count: number) => `Позицій з невідомими значеннями: ${count} (не враховано в підсумках вище).`,
    // One edit button per meal (opens the meal editor) — replaced the old
    // per-dish Редагувати/Перенести/Видалити row, which was too crowded.
    editMealButton: "Редагувати",
    editMealLabel: (mealType: string) => `Редагувати прийом їжі: ${mealType}`,
    // The same stats the daily status shows (Settings' show* toggles), plus
    // the meal's weight — see mealStatItems in lib/mealStats.ts.
    mealStat: {
      weight: (g: number) => `Вага: ${g} г`,
      carbs: (g: number) => `Вуглеводи: ${g} г`,
      calories: (kcal: number) => `Калорії: ${kcal} ккал`,
      gl: (gl: number) => `ГН: ${gl}`,
      fat: (g: number) => `Жири: ${g} г`,
      sugars: (g: number) => `Цукри: ${g} г`,
      protein: (g: number) => `Білки: ${g} г`,
      sodium: (mg: number) => `Натрій: ${mg} мг`,
    },
    // Label-only forms of the mealStat entries, for a stat with no known value ("Калорії: невідомо").
    mealStatLabel: {
      weight: "Вага",
      carbs: "Вуглеводи",
      calories: "Калорії",
      gl: "ГН",
      fat: "Жири",
      sugars: "Цукри",
      protein: "Білки",
      sodium: "Натрій",
    },
    mealEditor: {
      newTitle: "Новий прийом їжі",
      editTitle: "Редагувати прийом їжі",
      dishesTitle: "Страви в цьому прийомі",
      noDishes: "Страв ще не додано.",
      addDishButton: "+ Додати страву",
      selectDishLabel: (name: string) => `Позначити «${name}»`,
      editDishLabel: (name: string) => `Редагувати страву «${name}»`,
      deleteSelectedButton: (count: number) => `Видалити вибрані (${count})`,
      totalsLabel: "Разом у цьому прийомі",
      saveButton: "Зберегти прийом їжі",
      cancelButton: "Скасувати",
      discardConfirm: "Відхилити внесені зміни?",
      discardYes: "Так, відхилити",
      discardNo: "Продовжити редагування",
      deleteMealButton: "Видалити весь прийом їжі",
      deleteMealConfirm: "Видалити весь цей прийом їжі разом з усіма стравами? Цю дію не можна скасувати.",
      deleteMealYes: "Так, видалити",
      emptyMealError: "Додайте хоча б одну страву або видаліть весь прийом їжі.",
      timeError: "Вкажіть час прийому їжі.",
      addDish: {
        title: "Додати страву",
        addButton: "Додати до прийому",
      },
      editDish: {
        title: "Редагувати страву",
        saveButton: "Зберегти страву",
      },
    },
    // A plain arithmetic split of the person's own daily limits — never
    // medical advice, and the disclaimer below must stay next to the numbers.
    recommendation: {
      title: "Орієнтир на цей прийом",
      disclaimer:
        "Це лише математичний розрахунок рівномірного розподілу ваших власних денних лімітів, а не медична порада. Питання харчування й лікування обговорюйте з лікарем.",
      basis: (mealsSharing: number, fullPercent: number, snackPercent: number | null) =>
        `Залишок денних лімітів поділено на заплановані прийоми, що ще залишилися (${mealsSharing}). Повний прийом — ${fullPercent} % денного ліміту (налаштування)${
          snackPercent !== null ? `, перекус — ${Math.round(snackPercent * 10) / 10} % (розраховано з решти)` : ""
        }.`,
      dailyLeft: (left: number, target: number, unit: string) => `Залишиться за день: ${left} із ${target}${unit}`,
      dailyOver: (over: number, unit: string) => `Ліміт на день перевищено на ${over}${unit}`,
      calories: (current: number, recommended: number) => `Калорії: ${current} із ≈${recommended} ккал`,
      carbs: (current: number, recommended: number) => `Вуглеводи: ${current} із ≈${recommended} г`,
      gl: (current: number, recommended: number) => `ГН: ${current} із ≈${recommended}`,
      fat: (current: number, limit: number) => `Жири: ${current} г (ліміт на прийом ${limit} г)`,
      fewerFitNote:
        "До вашого часу сну за звичайного інтервалу вже не встигнуть усі заплановані прийоми. Залишок не переноситься на пізніші прийоми — це лише орієнтир.",
    },
    form: {
      mealTypeLabel: "Прийом їжі",
      timestampLabel: "Час",
      itemLabel: "Продукт або страва",
      itemPlaceholder: "Пошук продукту...",
      portionLabel: "Порція (г)",
      notesLabel: "Примітка",
      notesPlaceholder: "необов'язково",
      noMatches: "Нічого не знайдено. Спочатку додайте продукт на вкладці «Продукти».",
      // Pre-formatted pieces (see carbsValue/caloriesValue/unknownValueLabel)
      // so an unknown value shows "невідомо" rather than a misleading 0.
      preview: (carbsText: string, caloriesText: string, glText: string) => `${carbsText}, ${caloriesText}, ГЛ ${glText}`,
      saveButton: "Додати",
      validationError: "Оберіть продукт, вкажіть порцію у грамах і час прийому їжі.",
      // Custom/estimated entries — a genuinely one-off item not in the
      // database (restaurant food, a homemade dish with no exact recipe).
      // Always a one-off DailyLog row, never saved to Ingredients — see the
      // 2026-09-11 build-log entry for why.
      switchToCustomButton: "Власний запис (страва не з бази)",
      switchToPickButton: "← Обрати з бази",
      customNameLabel: "Назва страви",
      customNamePlaceholder: "напр. Борщ у ресторані",
      customHint: "Заповніть відомі значення, невідомі залиште порожніми — вони не враховуватимуться в денних підсумках.",
      customFieldPlaceholder: "невідомо",
      customValidationError: "Введіть назву страви, порцію, час і хоча б одне відоме значення.",
      customFieldLabels: {
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
      validationError: "Вкажіть назву. Числові поля можна залишити порожніми, але вписане має бути числом не менше 0.",
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
      searchFailed: "Пошук зараз недоступний — спробуйте пізніше або введіть дані вручну.",
      translationLimitedNotice:
        "Переклад назв продуктів сьогодні недоступний. Ви можете шукати англійською (наприклад, «corn») або ввести дані вручну.",
      translationLimitedSearch:
        "Сьогодні пошук працює лише англійською — введіть назву англійською (наприклад, «corn») або введіть дані вручну.",
      untranslatedNote:
        "Інші збіги — без перекладу. Щоб потрібний продукт був угорі списку, уточніть пошук (наприклад, «кукурудза варена» замість «кукурудза»).",
      validationError:
        "Вкажіть назву для збереження. Числові поля можна залишити порожніми, але вписане має бути числом не менше 0.",
      unknownHint:
        "Невідомі значення (наприклад, ГІ) можна залишити порожніми — вони збережуться як «невідомо» і не враховуватимуться в підсумках.",
      unknownPlaceholder: "невідомо",
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
    editTitle: "Редагувати страву",
    customRecipeCrumb: "Власний рецепт",
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
      unknownFromIngredients: (fields: string) =>
        `Деякі інгредієнти мають невідомі значення (${fields}) — для страви вони теж збережуться як невідомі.`,
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
    editButton: "Редагувати",
    editTitle: "Редагувати вимірювання",
    editEntryLabel: (time: string) => `Редагувати вимірювання о ${time}`,
    todayLabel: "Сьогодні",
    editNotFound: "Не вдалося знайти цей запис — можливо, його змінили на іншому пристрої. Відкрийте екран заново.",
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
      timeLabel: "Коли зроблено вимірювання",
      timeHint: "Час самого вимірювання, а не запису — його можна змінити.",
      futureError: "Час вимірювання не може бути в майбутньому.",
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
    timeFormatOptions: { "24h": "24 години (14:30)", "12h": "12 годин (2:30 PM)" },
    fullMealShareError:
      "Частка повного прийому має бути більше 0, і разом з усіма повними прийомами не перевищувати 100 % — інакше на перекуси нічого не лишається.",
    shareSummary: {
      full: (percent: number, kcal: number | null) =>
        `Повний прийом: ${percent} % денного ліміту${kcal !== null ? ` (≈${kcal} ккал)` : ""}.`,
      snack: (percent: number, kcal: number | null) =>
        `Перекус (розраховується з решти): ${percent} %${kcal !== null ? ` (≈${kcal} ккал)` : ""}.`,
    },
    snacksValidationError: "Кількість перекусів має бути від 0 до кількості прийомів їжі на день.",
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
      connectedLabel: "Підключена таблиця:",
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
      connectDevButton: "Підключити dev-таблицю",
      connectDevSaved: "Підключено dev-таблицю!",
      checking: "Перевірка структури таблиці...",
      tabsOk: "✓ Усі потрібні вкладки та стовпці знайдено.",
      problemsFound: "Структура таблиці потребує виправлення:",
      issueMissingTab: (tab: string) => `Немає вкладки «${tab}» — її буде створено.`,
      issueNotAppLayout: (tab: string) =>
        `Вкладка «${tab}» має стовпці, яких додаток не знає. Автоматично це виправити не можна: виправте вкладку вручну або створіть нову таблицю (вище).`,
      issueMissingColumns: (tab: string, headers: string[]) =>
        `«${tab}»: бракує стовпців ${headers.join(", ")} — їх буде додано в кінці.`,
      issueDuplicateColumns: (tab: string, headers: string[]) =>
        headers.length === 1
          ? `«${tab}»: стовпець ${headers[0]} повторюється — залишиться той, де є дані, значення з дубліката буде перенесено в нього, а зайвий стовпець видалено.`
          : `«${tab}»: ${headers.length} стовпців повторюються (${headers.join(", ")}) — залишиться по одному (той, де є дані), значення з дублікатів буде перенесено, а зайві стовпці видалено.`,
      issueDuplicateConflict: (tab: string, header: string, columns: string[], rows: number[]) =>
        `«${tab}»: стовпець ${header} повторюється (${columns.join(", ")}), і в рядках ${rows.join(", ")} значення різні. Автоматично це виправити не можна — залиште один стовпець вручну.`,
      issueFormatUpgrade: (tab: string) =>
        `«${tab}»: заголовки буде оновлено — у першому рядку службові назви стовпців, у другому зрозумілі назви.`,
      issueMissingSettingsKeys: (keys: string[]) => `Налаштування: бракує ${keys.join(", ")} — буде додано зі стандартними значеннями.`,
      repairBackupNote:
        "Перед змінами кожну вкладку, яку буде змінено, буде скопійовано в нову вкладку «… — копія …», тож жодні дані не загубляться.",
      unfixableNote: "Вкладки з проблемами, які не можна виправити автоматично, змінено не буде.",
      repairButton: "Виправити таблицю",
      repairing: "Виправлення таблиці...",
    },
    fields: {
      dailyCarbsTarget: "Денна норма вуглеводів (г)",
      fatPerMealLimit: "Ліміт жиру на прийом їжі (г)",
      dailyCaloriesTarget: "Денна норма калорій (ккал)",
      mealsPerDay: "Прийомів їжі на день",
      snacksPerDay: "З них перекусів",
      fullMealSharePercent: "Частка денного ліміту на повний прийом (%)",
      maxGapHours: "Макс. проміжок між прийомами їжі (год)",
      bloodSugarMin: "Мінімальний цукор (ммоль/л)",
      bloodSugarMax: "Максимальний цукор (ммоль/л)",
      wakeTime: "Час пробудження",
      sleepTime: "Час сну",
      timeFormat: "Формат часу",
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
  sheetStructure: {
    brokenTab: (tab: string) =>
      `Вкладка «${tab}» у таблиці має неправильну структуру, тому дані з неї не можна безпечно прочитати чи зберегти. Відкрийте Налаштування (⚙) і натисніть «Виправити таблицю».`,
    dialogTitleBlocking: "Таблицю потрібно виправити",
    dialogSpreadsheet: (name: string) => `Таблиця: «${name}»`,
    dialogTitleSuggested: "Таблицю можна оновити",
    dialogIntroBlocking: "Поки структуру таблиці не виправлено, дані не читаються й не зберігаються. Ось що знайдено:",
    dialogIntroSuggested: "Таблиця працює, але її можна оновити до поточного формату:",
    dialogUnfixable:
      "Частину проблем неможливо виправити автоматично. Виправте ці вкладки в таблиці вручну або створіть нову таблицю в Налаштуваннях (⚙).",
    dialogRepairFailed: (error: string) =>
      `Автоматичне виправлення не вдалося: ${error}. Виправте таблицю вручну або створіть нову в Налаштуваннях (⚙). Резервні копії вкладок, якщо їх уже створено, залишаються в таблиці.`,
    updateButton: "Оновити таблицю",
    openSettings: "Відкрити налаштування",
    later: "Пізніше",
    close: "Закрити",
  },
  // Readable names written into row 2 of every tab (row 1 keeps the fixed
  // keys the app reads — they never change with the language). Adding a
  // language = another object of the same shape (see sheetLabels.ts).
  sheetLabels: {
    columns: {
      NameUk: "Назва (укр.)",
      NameEn: "Назва (англ.)",
      IngredientsJson: "Інгредієнти (JSON)",
      YieldGrams: "Вихід, г",
      Carbs_g: "Вуглеводи, г",
      GI: "Глікемічний індекс",
      Fiber_g: "Клітковина, г",
      Sugars_g: "Цукри, г",
      Protein_g: "Білки, г",
      Fat_g: "Жири, г",
      Calories_kcal: "Калорії, ккал",
      Sodium_mg: "Натрій, мг",
      Source: "Джерело",
      DateAdded: "Дата додавання",
      Favorite: "Улюблене",
      GlycemicFlag: "Глікемічна позначка",
      GiVerified: "ГІ перевірено",
      UnknownFields: "Невідомі значення",
      Timestamp: "Час",
      MealType: "Прийом їжі",
      ItemName: "Назва продукту/страви",
      PortionGrams: "Порція, г",
      GL: "Глікемічне навантаження",
      Notes: "Примітки",
      MealId: "Ідентифікатор прийому їжі",
      ValueMmolL: "Цукор, ммоль/л",
      Context: "Контекст",
      Key: "Ключ",
      Value: "Значення",
      Label: "Назва",
    } as Record<string, string>,
  },
  breadcrumb: { label: "Навігація" },
  auth: {
    sessionExpiredBanner:
      "Вхід у Google завершився (так буває приблизно через годину). Увійдіть знову, щоб продовжити — введене на екрані не зникне.",
    signInAgainButton: "Увійти знову",
    sessionExpiredError: "Вхід у Google завершився. Увійдіть знову й повторіть дію.",
  },
  timeInput: {
    hour: "Година",
    minute: "Хвилини",
    period: "До/після полудня",
    date: "Дата",
  },
  reminders: {
    notificationTitle: "Трекер харчування",
    notificationBody: "Час перевірити, чи не пора поїсти",
    accessNotice: {
      notifications: "Нагадування про їжу вимкнені: застосунку не дозволено показувати сповіщення.",
      exactAlarms: "Нагадування про їжу можуть приходити із запізненням або лише коли ви відкриваєте застосунок: потрібен дозвіл «Будильники й нагадування».",
      button: "Дозволити нагадування",
      batteryHint: "Якщо нагадування все одно запізнюються, у налаштуваннях телефону вимкніть для цього застосунку економію заряду батареї.",
    },
  },
} as const;
