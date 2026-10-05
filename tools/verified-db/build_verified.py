# Release 1.8, step 2: builds the entries of src/data/verified-foods.json for
# the 69 built-in items. Nutrients: the chosen USDA SR Legacy entry, fetched
# by FDC ID (or our own calculation, stated). GI: entries picked from the
# 2021 international tables (gi-2021-entries.json, see gi_parse.py) — the
# value is the entry's GI, or the mean of the listed entries; the reason
# says how many, which table and the range. Every choice is in ITEMS below,
# so the reasoning can be read and re-run. Output: rewrites the "entries"
# array of verified-foods.json and writes build-report.txt.
import json, os, re, statistics, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
# Generated files and the GI sources stay local (gitignored): parsed tables come
# from the 2021 GI paper's supplements, so only the scripts are versioned.
WORK = os.path.join(ROOT, "contributions", "2026-10-verified-db")
REF = os.path.join(ROOT, "contributions", "references")
DB = os.path.join(ROOT, "src", "data", "verified-foods.json")
VERIFIED = "2026-10-04"

from usda_search import KEY  # noqa: E402

NUTRIENTS = {"208": "caloriesKcal", "205": "carbsG", "291": "fiberG", "269": "sugarsG", "203": "proteinG", "204": "fatG", "307": "sodiumMg"}

# --- per-item choices --------------------------------------------------------
# n: USDA FDC ID, or ("calc", ...) handled in calculated(); nr: nutrients reliability;
# nn: extra note (uk, en); gi: ("m", table, [entry numbers], reliability, note|None)
#   | ("c",) conventional 15 | ("na",) not applicable | ("u", (uk, en)) unknown
DRY = ("Значення для звареного продукту; ГН від ваги сухого продукту рахує той самий вуглевод.",
       "Value for the cooked food; GL from the dry weight counts the same carbohydrate.")

RICE_NOTE = ("Цей запис — для білого довгозернистого рису без назви сорту (не басмати, не жасмин, не пропарений). Якщо сорт відомий, оберіть його запис.",
             "This entry is for long-grain white rice without a named type (not basmati, jasmine or parboiled). If the type is known, pick its own entry.")
LIKE_LONG = ("USDA не має окремого запису для цього сорту; поживні речовини — звичайного довгозернистого білого рису, з яким він майже збігається.",
             "USDA has no separate entry for this variety; nutrients are those of regular long-grain white rice, which it closely matches.")
BASMATI = ("m", "ST1", [574, 575, 576, 577, 578, 581, 582], "high",
           ("Лише білий басмати, варений. Розкид у межах басмати — через марку, час варіння й групу людей у дослідженні; експрес-, пропарений і бурий басмати не враховано, підгрупи одного дослідження — один раз.",
            "White basmati, boiled, only. The spread within basmati comes from the brand, cooking time and the people tested; express, easy-cook and brown basmati excluded, subgroups of one study counted once."))
PARBOILED = ("m", "ST1", [689, 690, 691, 692, 693, 694, 695, 696, 697], "medium",
             ("Розкид у межах пропареного рису — переважно через час варіння: той самий рис — 68 після 10 хв і 75 після 20 хв (#692, #693); решта — марка.",
              "The spread within parboiled rice comes mostly from cooking time: the same rice is 68 after 10 min and 75 after 20 min (#692, #693); the rest is the brand."))
JASMINE = ("m", "ST1", [599, 600, 601, 602, 603, 605, 606, 608, 609, 612, 613, 614, 615, 616], "medium",
           ("Жасмин високий в усіх дослідженнях; розкид — через марку й походження (тайські Hom Mali найвищі, 90–116), спосіб варіння й групу людей; підгрупи одного дослідження — один раз.",
            "Jasmine is high in every study; the spread comes from the brand and origin (Thai Hom Mali highest, 90–116), the cooking method and the people tested; subgroups of one study counted once."))
ROUND = ("m", "ST1", [648, 649], "medium",
         ("Середньозернистий рис і арборіо; круглозернистий Calrose у Таблиці 2 — 83.", "Medium-grain rice and arborio; round-grain Calrose in Table 2 is 83."))
WILD = ("m", "ST2", [2742], "low",
        ("Одне дослідження у людей з діабетом, менш надійний метод. Дикий рис — інша рослина (цицанія), не сорт звичайного рису.",
         "A single study in people with diabetes, less robust method. Wild rice is a different plant (Zizania), not a variety of common rice."))
ROUND_NN = ("Український круглозерний рис найближчий до середньо- й короткозернистого в USDA (поживні речовини в них майже однакові).",
            "Ukrainian round-grain rice is closest to USDA's medium- and short-grain rice (their nutrients are almost the same).")

ITEMS = [
    # grains — dry, then cooked
    dict(id="B0001", cat="grains", fam="buckwheat", st="dry", uk="Гречка (ядриця), суха", en="Buckwheat groats, roasted, dry", n=170685, nr="high",
         gi=("m", "ST2", [2569, 2571], "medium", ("Обидва записи — варена гречана крупа у здорових дорослих; у Таблиці 1 (ISO) гречки немає.", "Both entries are boiled buckwheat groats in healthy adults; buckwheat isn't in Table 1 (ISO)."))),
    dict(id="B0002", cat="grains", fam="rice", variant="long-grain-white", st="dry", uk="Рис білий довгозернистий, сухий", en="Rice, white, long-grain, dry", n=168877, nr="high",
         gi=("m", "ST1", [629, 634, 651, 652, 654, 655, 656, 657, 658], "medium", RICE_NOTE)),
    dict(id="B0003", cat="grains", fam="rice", variant="brown", st="dry", uk="Рис бурий довгозернистий, сухий", en="Rice, brown, long-grain, dry", n=169703, nr="high",
         gi=("m", "ST1", [619, 623, 624], "medium", ("Три дослідження бурого рису різних сортів (Австралія, Тайвань, Індія); розкид — через сорт і спосіб варіння.", "Three studies of brown rice of different varieties (Australia, Taiwan, India); the spread comes from the variety and the cooking method."))),
    dict(id="B0004", cat="grains", fam="oats", st="dry", uk="Вівсяні пластівці, сухі", en="Oats, rolled, dry", n=173904, nr="high",
         gi=("m", "ST1", [430, 431, 432, 433, 436], "medium", ("Каша з вівсяних пластівців на воді; тонші пластівці дають вищий ГІ (запис #436 — 76).", "Rolled-oat porridge made with water; thinner flakes give a higher GI (entry #436 — 76)."))),
    dict(id="B0005", cat="grains", fam="millet", st="dry", uk="Пшоно, сухе", en="Millet, dry", n=169702, nr="high",
         gi=("m", "ST2", [2605], "low", ("Одне невелике дослідження 1981 року (5 осіб), менш надійний метод.", "A single small 1981 study (5 people), less robust method."))),
    dict(id="B0006", cat="grains", fam="pearl-barley", st="dry", uk="Перлова крупа, суха", en="Barley, pearled, dry", n=170284, nr="high",
         gi=("m", "ST1", [529, 533, 541, 542, 546, 547], "medium", ("Записи — різні сорти ячменю, від 22 до 58; середнє, бо сорт перлової крупи на упаковці не вказують.", "The entries are different barley cultivars, 22 to 58; the mean is used because packs don't state the cultivar."))),
    dict(id="B0007", cat="grains", fam="semolina", st="dry", uk="Манна крупа, суха", en="Semolina, dry", n=169715, nr="high",
         gi=("m", "ST2", [2470], "low", ("Каша з фарини (Cream of Wheat) — тієї самої крупи з м'якої пшениці, що й манна; одне дослідження у людей з діабетом, менш надійний метод.", "Farina porridge (Cream of Wheat) — the same soft-wheat крупа as semolina (манка); a single study in people with diabetes, less robust method."))),
    dict(id="B0008", cat="grains", fam="corn-grits", st="dry", uk="Кукурудзяна крупа, суха", en="Corn grits, yellow, dry", n=171670, nr="medium",
         nn=("Кукурудзяна крупа — це крупа (grits), не борошно; запис USDA — жовта кукурудзяна крупа.", "Corn крупа is grits, not meal; the USDA entry is yellow corn grits."),
         gi=("m", "ST1", [555], "medium", ("Одне дослідження (Китай) кукурудзяної каші; каші саме з кукурудзяної крупи (grits) окремо не вимірювали, це найближче вимірювання.", "A single study (China) of cornmeal porridge; porridge from corn grits wasn't measured separately, so this is the closest measurement."))),
    dict(id="B0009", cat="grains", fam="pasta", st="dry", uk="Макарони з твердої пшениці, сухі", en="Pasta, durum wheat, dry", n=169736, nr="high",
         gi=("m", "ST1", [1454, 1455, 1459, 1466, 1467, 1468, 1469, 1471], "high", ("Вісім узгоджених досліджень білих макаронів із твердої пшениці, варених.", "Eight consistent studies of boiled white durum-wheat pasta."))),
    dict(id="B0058", cat="grains", fam="buckwheat", st="boiled", uk="Гречка варена, без солі", en="Buckwheat groats, roasted, cooked, without salt", n=170686, nr="high",
         gi=("m", "ST2", [2569, 2571], "medium", ("Обидва записи — варена гречана крупа у здорових дорослих; у Таблиці 1 (ISO) гречки немає.", "Both entries are boiled buckwheat groats in healthy adults; buckwheat isn't in Table 1 (ISO)."))),
    dict(id="B0059", cat="grains", fam="rice", variant="long-grain-white", st="boiled", uk="Рис білий довгозернистий, варений, без солі", en="Rice, white, long-grain, cooked, without salt", n=168878, nr="high",
         gi=("m", "ST1", [629, 634, 651, 652, 654, 655, 656, 657, 658], "medium", RICE_NOTE)),
    dict(id="B0060", cat="grains", fam="rice", variant="brown", st="boiled", uk="Рис бурий довгозернистий, варений, без солі", en="Rice, brown, long-grain, cooked, without salt", n=169704, nr="high",
         gi=("m", "ST1", [619, 623, 624], "medium", ("Три дослідження бурого рису різних сортів (Австралія, Тайвань, Індія); розкид — через сорт і спосіб варіння.", "Three studies of brown rice of different varieties (Australia, Taiwan, India); the spread comes from the variety and the cooking method."))),
    dict(id="B0061", cat="grains", fam="oats", st="boiled", uk="Вівсяна каша на воді, без солі", en="Oatmeal, cooked with water, without salt", n=173905, nr="high",
         gi=("m", "ST1", [430, 431, 432, 433, 436], "medium", ("Каша з вівсяних пластівців на воді; тонші пластівці дають вищий ГІ (запис #436 — 76).", "Rolled-oat porridge made with water; thinner flakes give a higher GI (entry #436 — 76)."))),
    dict(id="B0062", cat="grains", fam="millet", st="boiled", uk="Пшоно варене, без солі", en="Millet, cooked, without salt", n=168871, nr="high",
         gi=("m", "ST2", [2605], "low", ("Одне невелике дослідження 1981 року (5 осіб), менш надійний метод.", "A single small 1981 study (5 people), less robust method."))),
    dict(id="B0063", cat="grains", fam="pearl-barley", st="boiled", uk="Перлова крупа варена, без солі", en="Barley, pearled, cooked, without salt", n=170285, nr="high",
         gi=("m", "ST1", [529, 533, 541, 542, 546, 547], "medium", ("Записи — різні сорти ячменю, від 22 до 58; середнє, бо сорт перлової крупи на упаковці не вказують.", "The entries are different barley cultivars, 22 to 58; the mean is used because packs don't state the cultivar."))),
    dict(id="B0064", cat="grains", fam="semolina", st="boiled", uk="Манна каша на воді, без солі", en="Farina (semolina) porridge, cooked with water, without salt", n=171659, nr="medium",
         nn=("Фарина — та сама крупа з м'якої пшениці, що й манна; запис USDA — швидка фарина (Cream of Wheat), зварена на воді без солі.", "Farina is the same soft-wheat крупа as semolina (манка); the USDA entry is quick farina (Cream of Wheat) cooked with water, without salt."),
         gi=("m", "ST2", [2470], "low", ("Каша з фарини (Cream of Wheat) — тієї самої крупи з м'якої пшениці, що й манна; одне дослідження у людей з діабетом, менш надійний метод.", "Farina porridge (Cream of Wheat) — the same soft-wheat крупа as semolina (манка); a single study in people with diabetes, less robust method."))),
    dict(id="B0065", cat="grains", fam="corn-grits", st="boiled", uk="Кукурудзяна каша на воді, без солі", en="Corn grits, yellow, cooked with water, without salt", n=171672, nr="medium",
         nn=("Кукурудзяна крупа — це крупа (grits), не борошно; запис USDA — жовта кукурудзяна крупа.", "Corn крупа is grits, not meal; the USDA entry is yellow corn grits."),
         gi=("m", "ST1", [555], "medium", ("Одне дослідження (Китай) кукурудзяної каші; каші саме з кукурудзяної крупи (grits) окремо не вимірювали, це найближче вимірювання.", "A single study (China) of cornmeal porridge; porridge from corn grits wasn't measured separately, so this is the closest measurement."))),
    dict(id="B0066", cat="grains", fam="pasta", st="boiled", uk="Макарони варені, без солі", en="Pasta, cooked, without salt", n=169737, nr="high",
         gi=("m", "ST1", [1454, 1455, 1459, 1466, 1467, 1468, 1469, 1471], "high", ("Вісім узгоджених досліджень білих макаронів із твердої пшениці, варених.", "Eight consistent studies of boiled white durum-wheat pasta."))),
    # rice types (developer, 2026-10-05: GI differs by type — one entry per type)
    dict(id="B0070", cat="grains", fam="rice", variant="basmati", st="dry", uk="Рис басмати, сухий", en="Rice, basmati, white, dry", n=168877, nr="medium", nn=LIKE_LONG, gi=BASMATI),
    dict(id="B0071", cat="grains", fam="rice", variant="basmati", st="boiled", uk="Рис басмати, варений, без солі", en="Rice, basmati, white, cooked, without salt", n=168878, nr="medium", nn=LIKE_LONG, gi=BASMATI),
    dict(id="B0072", cat="grains", fam="rice", variant="parboiled", st="dry", uk="Рис пропарений довгозернистий, сухий", en="Rice, white, long-grain, parboiled, dry", n=169707, nr="high", gi=PARBOILED),
    dict(id="B0073", cat="grains", fam="rice", variant="parboiled", st="boiled", uk="Рис пропарений довгозернистий, варений, без солі", en="Rice, white, long-grain, parboiled, cooked, without salt", n=169708, nr="high", gi=PARBOILED),
    dict(id="B0074", cat="grains", fam="rice", variant="jasmine", st="dry", uk="Рис жасмин, сухий", en="Rice, jasmine, white, dry", n=168877, nr="medium", nn=LIKE_LONG, gi=JASMINE),
    dict(id="B0075", cat="grains", fam="rice", variant="jasmine", st="boiled", uk="Рис жасмин, варений, без солі", en="Rice, jasmine, white, cooked, without salt", n=168878, nr="medium", nn=LIKE_LONG, gi=JASMINE),
    dict(id="B0076", cat="grains", fam="rice", variant="round-grain", st="dry", uk="Рис круглозерний, сухий", en="Rice, white, medium-grain, dry", n=168879, nr="medium", nn=ROUND_NN, gi=ROUND),
    dict(id="B0077", cat="grains", fam="rice", variant="round-grain", st="boiled", uk="Рис круглозерний, варений, без солі", en="Rice, white, medium-grain, cooked, without salt", n=168880, nr="medium", nn=ROUND_NN, gi=ROUND),
    dict(id="B0078", cat="grains", fam="wild-rice", st="dry", uk="Рис дикий, сухий", en="Wild rice, dry", n=169726, nr="high", gi=WILD),
    dict(id="B0079", cat="grains", fam="wild-rice", st="boiled", uk="Рис дикий, варений, без солі", en="Wild rice, cooked, without salt", n=168897, nr="high", gi=WILD),
    # bread
    dict(id="B0010", cat="bread", fam="rye-bread", st="baked", uk="Хліб житній", en="Bread, rye", n=172684, nr="medium",
         nn=("Запис USDA — житньо-пшеничний хліб; склад українського житнього хліба буває різним.", "The USDA entry is a rye-wheat bread; Ukrainian rye breads vary in recipe."),
         gi=("m", "ST1", [218, 223], "medium", ("Два дослідження житньо-пшеничного хліба; ГІ залежить від рецепту (суцільнозерновий житній — нижчий).", "Two studies of rye-wheat bread; GI depends on the recipe (wholegrain rye is lower)."))),
    dict(id="B0011", cat="bread", fam="white-bread", st="baked", uk="Хліб пшеничний білий", en="Bread, white", n=174924, nr="high",
         gi=("m", "ST1", [235, 236, 237, 238, 239, 243, 245, 246, 247, 248, 249, 253, 254, 255, 256, 258, 264, 265, 267, 268, 284, 285, 286], "high",
             ("Лише звичайний білий хліб: без добавок, хліба «з низьким ГІ» та дослідів із часом підходу; підгрупи одного дослідження враховано один раз.",
              "Plain white bread only: no additives, 'low GI' breads or proving-time experiments; subgroups of one study counted once."))),
    # dairy
    dict(id="B0012", cat="dairy", fam="kefir", st="fermented", uk="Кефір нежирний", en="Kefir, low-fat, plain", n=170904, nr="medium",
         nn=("Єдиний кефір у USDA — конкретна марка (Lifeway).", "The only kefir in USDA is one brand (Lifeway)."),
         gi=("m", "ST1", [933], "medium", ("Одне дослідження — того самого нежирного кефіру Lifeway, що й у записі USDA.", "A single study — of the same Lifeway low-fat kefir as the USDA entry."))),
    dict(id="B0013", cat="dairy", fam="milk", st="processed", uk="Молоко 2%", en="Milk, reduced fat, 2%", n=171267, nr="high",
         nn=("Для молока 2,5% жиру на 0,5 г більше на 100 г; вуглеводи ті самі.", "Milk with 2.5% fat has 0.5 g more fat per 100 g; carbohydrates are the same."),
         gi=("m", "ST1", [942, 943], "medium", ("Два дослідження молока зниженої жирності.", "Two studies of reduced-fat milk."))),
    dict(id="B0014", cat="dairy", fam="yogurt", st="fermented", uk="Йогурт натуральний знежирений", en="Yogurt, plain, skim milk", n=170887, nr="high",
         gi=("m", "ST1", [1046], "medium", ("Одне дослідження натурального йогурту без цукру; знежирений натуральний у Таблиці 2 (#2880) — 19.", "A single study of natural yogurt without added sugar; fat-free natural yogurt in Table 2 (#2880) is 19."))),
    dict(id="B0015", cat="dairy", fam="cottage-cheese", st="fermented", uk="Сир кисломолочний 1%", en="Cottage cheese, low-fat, 1%", n=173417, nr="medium",
         nn=("Американський cottage cheese — найближчий запис; український кисломолочний сир сухіший і без вершкової заправки.", "American cottage cheese is the closest entry; Ukrainian кисломолочний сир is drier and has no cream dressing."),
         gi=("c",)),
    dict(id="B0016", cat="dairy", fam="hard-cheese", st="processed", uk="Сир твердий (гауда)", en="Cheese, gouda", n=171241, nr="medium",
         nn=("«Твердий сир» — загальна назва; значення для гауди, найближчої до поширених у нас твердих сирів.", "'Hard cheese' is generic; values are for gouda, the closest to common Ukrainian hard cheeses."),
         gi=("c",)),
    dict(id="B0017", cat="dairy", fam="sour-cream", st="fermented", uk="Сметана зниженої жирності (~15%)", en="Sour cream, reduced fat", n=171256, nr="medium",
         nn=("Запис USDA — сметана зниженої жирності (близько 12–15%).", "The USDA entry is reduced-fat sour cream (about 12–15%)."),
         gi=("c",)),
    dict(id="B0018", cat="fats", fam="butter", st="processed", uk="Масло вершкове, несолоне", en="Butter, without salt", n=173430, nr="high", gi=("na",)),
    # meat, fish, eggs
    dict(id="B0019", cat="meat", fam="chicken-breast", st="boiled", uk="Куряче філе (грудка), тушковане/варене", en="Chicken breast, meat only, stewed", n=171478, nr="high", gi=("na",)),
    dict(id="B0020", cat="meat", fam="beef-lean", st="boiled", uk="Яловичина пісна (огузок), тушкована", en="Beef, round, lean only, braised", n=170235, nr="medium",
         nn=("Варена пісна яловичина в USDA подана тушкованою (braised); різні відруби відрізняються жирністю.", "USDA has lean beef braised rather than boiled; cuts differ in fat."), gi=("na",)),
    dict(id="B0021", cat="meat", fam="turkey-breast", st="baked", uk="Індичка (грудка), запечена", en="Turkey breast, meat only, roasted", n=171496, nr="high", gi=("na",)),
    dict(id="B0022", cat="fish", fam="cod", st="baked", uk="Тріска атлантична, запечена", en="Cod, Atlantic, cooked, dry heat", n=171956, nr="high", gi=("na",)),
    dict(id="B0023", cat="fish", fam="salmon", st="baked", uk="Лосось атлантичний (вирощений), запечений", en="Salmon, Atlantic, farmed, cooked, dry heat", n=175168, nr="high", gi=("na",)),
    dict(id="B0024", cat="eggs", fam="egg", st="boiled", uk="Яйце куряче, варене", en="Egg, whole, hard-boiled", n=173424, nr="high", gi=("c",)),
    # legumes
    dict(id="B0025", cat="legumes", fam="kidney-beans", st="dry", uk="Квасоля червона, суха", en="Kidney beans, red, dry", n=173744, nr="high",
         gi=("m", "ST2", [3126, 3127, 3128, 3132], "medium", ("Квасоля, зварена із сухої, у здорових дорослих; у Таблиці 1 є лише консервована (36–43).", "Kidney beans boiled from dry, in healthy adults; Table 1 has only canned (36–43)."))),
    dict(id="B0026", cat="legumes", fam="lentils", st="dry", uk="Сочевиця, суха", en="Lentils, dry", n=172420, nr="high",
         gi=("m", "ST1", [1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298], "medium", ("Вісім сортів сочевиці з одного дослідження; старіші дослідження (Таблиця 2) — 18–37.", "Eight lentil cultivars from one study; older studies (Table 2) give 18–37."))),
    dict(id="B0027", cat="legumes", fam="chickpeas", st="dry", uk="Нут, сухий", en="Chickpeas, dry", n=173756, nr="high",
         gi=("m", "ST1", [1284, 1285], "medium", ("Два дослідження консервованого нуту; варений із сухого у Таблиці 2 — 36 (#3108, #3109).", "Two studies of canned chickpeas; boiled from dry in Table 2 is 36 (#3108, #3109)."))),
    dict(id="B0067", cat="legumes", fam="kidney-beans", st="boiled", uk="Квасоля червона, варена, без солі", en="Kidney beans, red, cooked, without salt", n=175194, nr="high",
         gi=("m", "ST2", [3126, 3127, 3128, 3132], "medium", ("Квасоля, зварена із сухої, у здорових дорослих; у Таблиці 1 є лише консервована (36–43).", "Kidney beans boiled from dry, in healthy adults; Table 1 has only canned (36–43)."))),
    dict(id="B0068", cat="legumes", fam="lentils", st="boiled", uk="Сочевиця варена, без солі", en="Lentils, cooked, without salt", n=172421, nr="high",
         gi=("m", "ST1", [1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298], "medium", ("Вісім сортів сочевиці з одного дослідження; старіші дослідження (Таблиця 2) — 18–37.", "Eight lentil cultivars from one study; older studies (Table 2) give 18–37."))),
    dict(id="B0069", cat="legumes", fam="chickpeas", st="boiled", uk="Нут варений, без солі", en="Chickpeas, cooked, without salt", n=173757, nr="high",
         gi=("m", "ST1", [1284, 1285], "medium", ("Два дослідження консервованого нуту; варений із сухого у Таблиці 2 — 36 (#3108, #3109).", "Two studies of canned chickpeas; boiled from dry in Table 2 is 36 (#3108, #3109)."))),
    dict(id="B0028", cat="vegetables", fam="green-peas", st="boiled", uk="Горошок зелений (заморожений), варений, без солі", en="Peas, green, frozen, boiled, without salt", n=170017, nr="high",
         gi=("m", "ST1", [1797, 1798], "medium", ("Два дослідження замороженого зеленого горошку.", "Two studies of frozen green peas."))),
    # vegetables
    dict(id="B0029", cat="vegetables", fam="cabbage", st="raw", uk="Капуста білокачанна, сира", en="Cabbage, raw", n=169975, nr="high", gi=("c",)),
    dict(id="B0030", cat="vegetables", fam="carrot", st="raw", uk="Морква, сира", en="Carrots, raw", n=170393, nr="high",
         gi=("m", "ST2", [3595, 3596], "medium", ("Два вимірювання сирої моркви (1982), менш надійний метод.", "Two measurements of raw carrot (1982), less robust method."))),
    dict(id="B0031", cat="vegetables", fam="carrot", st="boiled", uk="Морква варена, без солі", en="Carrots, boiled, without salt", n=170394, nr="high",
         gi=("m", "ST1", [1804, 1805], "high", ("Два узгоджені дослідження вареної моркви за методом ISO.", "Two consistent ISO-method studies of boiled carrot."))),
    dict(id="B0032", cat="vegetables", fam="beetroot", st="boiled", uk="Буряк варений", en="Beets, boiled", n=169146, nr="high",
         gi=("m", "ST2", [3588], "low", ("Єдине вимірювання — невелике дослідження 1981 року (5 осіб) з великою похибкою (±16).", "The only measurement is a small 1981 study (5 people) with a wide error (±16)."))),
    dict(id="B0033", cat="vegetables", fam="potato", st="boiled", uk="Картопля варена без шкірки, без солі", en="Potatoes, boiled without skin, without salt", n=170440, nr="high",
         gi=("m", "ST1", [1842, 1844], "medium", ("Свіжозварена картопля; ГІ залежить від сорту, а охолоджена картопля має нижчий ГІ (40–56).", "Freshly boiled potato; GI depends on the variety, and cooled potatoes are lower (40–56)."))),
    dict(id="B0034", cat="vegetables", fam="cucumber", st="raw", uk="Огірок зі шкіркою, сирий", en="Cucumber, with peel, raw", n=168409, nr="high", gi=("c",)),
    dict(id="B0035", cat="vegetables", fam="tomato", st="raw", uk="Помідор червоний, сирий", en="Tomatoes, red, ripe, raw", n=170457, nr="high", gi=("c",)),
    dict(id="B0036", cat="vegetables", fam="onion", st="raw", uk="Цибуля ріпчаста, сира", en="Onions, raw", n=170000, nr="high", gi=("c",)),
    dict(id="B0037", cat="vegetables", fam="garlic", st="raw", uk="Часник, сирий", en="Garlic, raw", n=169230, nr="high",
         gi=("u", ("ГІ часнику не вимірювали, а вуглеводів у ньому забагато для умовного значення; його їдять грамами, тож ГН майже не змінюється.", "Garlic's GI hasn't been measured and it has too much carbohydrate for a conventional value; it's eaten by the gram, so GL barely changes."))),
    dict(id="B0038", cat="vegetables", fam="zucchini", st="raw", uk="Кабачок (цукіні), сирий", en="Zucchini, with skin, raw", n=169291, nr="high", gi=("c",)),
    dict(id="B0039", cat="vegetables", fam="broccoli", st="raw", uk="Броколі, сира", en="Broccoli, raw", n=170379, nr="high", gi=("c",)),
    dict(id="B0040", cat="vegetables", fam="bell-pepper", st="raw", uk="Перець солодкий червоний, сирий", en="Peppers, sweet, red, raw", n=170108, nr="high", gi=("c",)),
    dict(id="B0041", cat="vegetables", fam="pumpkin", st="boiled", uk="Гарбуз варений, без солі", en="Pumpkin, boiled, without salt", n=168449, nr="high",
         gi=("m", "ST1", [1800], "medium", ("Одне дослідження вареного гарбуза (мускатний, Ямайка).", "A single study of boiled pumpkin (butternut type, Jamaica)."))),
    dict(id="B0042", cat="vegetables", fam="spinach", st="raw", uk="Шпинат, сирий", en="Spinach, raw", n=168462, nr="high", gi=("c",)),
    dict(id="B0043", cat="vegetables", fam="lettuce", st="raw", uk="Салат листовий, сирий", en="Lettuce, green leaf, raw", n=169249, nr="high", gi=("c",)),
    dict(id="B0044", cat="vegetables", fam="radish", st="raw", uk="Редис, сирий", en="Radishes, raw", n=169276, nr="high", gi=("c",)),
    dict(id="B0045", cat="mushrooms", fam="button-mushroom", st="raw", uk="Печериці, сирі", en="Mushrooms, white, raw", n=169251, nr="high", gi=("c",)),
    dict(id="B0046", cat="vegetables", fam="sweet-corn", st="boiled", uk="Кукурудза цукрова, варена, без солі", en="Corn, sweet, yellow, boiled, without salt", n=169999, nr="high",
         gi=("m", "ST1", [558, 559], "medium", ("Два дослідження цукрової кукурудзи; сама таблиця наводить їх середнє — 53.", "Two studies of sweet corn; the table itself gives their mean, 53."))),
    # fruit
    dict(id="B0047", cat="fruit", fam="apple", st="raw", uk="Яблуко зі шкіркою, сире", en="Apples, raw, with skin", n=171688, nr="high",
         gi=("m", "ST1", [1078], "medium", ("Одне дослідження за методом ISO; старіші (Таблиця 2) — 28–45.", "A single ISO-method study; older ones (Table 2) give 28–45."))),
    dict(id="B0048", cat="fruit", fam="pear", st="raw", uk="Груша, сира", en="Pears, raw", n=169118, nr="high",
         gi=("m", "ST1", [1160, 1161], "medium", ("Те саме дослідження: недостигла груша 24, стигла 33.", "The same study: under-ripe pear 24, ripe 33."))),
    dict(id="B0049", cat="fruit", fam="banana", st="raw", uk="Банан, сирий", en="Bananas, raw", n=173944, nr="high",
         gi=("m", "ST1", [1088, 1089, 1090], "high", ("Три узгоджені дослідження; перестиглий банан вищий (#1091 — 57).", "Three consistent studies; overripe banana is higher (#1091 — 57)."))),
    dict(id="B0050", cat="fruit", fam="orange", st="raw", uk="Апельсин, сирий", en="Oranges, raw", n=169097, nr="high",
         gi=("m", "ST1", [1150], "medium", ("Одне дослідження за методом ISO (навель); старіші — 31–52.", "A single ISO-method study (navel); older ones give 31–52."))),
    dict(id="B0051", cat="fruit", fam="strawberry", st="raw", uk="Полуниця, свіжа", en="Strawberries, raw", n=167762, nr="high",
         gi=("m", "ST1", [1174], "medium", ("Одне дослідження за методом ISO.", "A single ISO-method study."))),
    dict(id="B0052", cat="fruit", fam="plum", st="raw", uk="Слива, сира", en="Plums, raw", n=169949, nr="high",
         gi=("m", "ST2", [3018, 3020], "low", ("Лише два старі дослідження, які дуже розходяться (24 і 53), менш надійний метод.", "Only two old studies that disagree widely (24 and 53), less robust method."))),
    dict(id="B0053", cat="fruit", fam="grapes", st="raw", uk="Виноград, сирий", en="Grapes, red or green, raw", n=174683, nr="high",
         gi=("m", "ST1", [1133, 1134, 1135], "high", ("Три узгоджені дослідження різних сортів.", "Three consistent studies of different varieties."))),
    # nuts, oils
    dict(id="B0054", cat="nuts", fam="walnut", st="raw", uk="Волоські горіхи", en="Walnuts, English", n=170187, nr="high",
         gi=("m", "ST1", [1433], "low", ("Окремо волоські горіхи не вимірювали; значення для суміші горіхів.", "Walnuts weren't measured on their own; the value is for mixed nuts."))),
    dict(id="B0055", cat="nuts", fam="almond", st="raw", uk="Мигдаль", en="Almonds", n=170567, nr="high",
         gi=("m", "ST1", [1433], "low", ("Окремо мигдаль не вимірювали; значення для суміші горіхів.", "Almonds weren't measured on their own; the value is for mixed nuts."))),
    dict(id="B0056", cat="fats", fam="sunflower-oil", st="processed", uk="Олія соняшникова", en="Oil, sunflower, linoleic", n=171017, nr="high",
         nn=("Звичайна соняшникова олія — лінолева (до 60%); високоолеїнова має ту саму калорійність.", "Regular sunflower oil is the linoleic type (under 60%); high-oleic has the same calories."), gi=("na",)),
    dict(id="B0057", cat="fats", fam="olive-oil", st="processed", uk="Олія оливкова", en="Oil, olive", n=171413, nr="high", gi=("na",)),
]


# --- review round 2 (developer, 2026-10-05) -----------------------------------
# GI ("s", table, summary row, value, studies/foods, reliability, note): the 2021
# table's OWN summary rows ("Boiled potato, mean of 29 studies 73") are used
# wherever one covers exactly our food — the authors' mean beats a hand pick.
# The rows were checked against the entries they summarise (e.g. "Non-fat
# yoghurts, mean of seven foods" is flavoured, artificially sweetened yoghurt,
# so plain yoghurt keeps its own entry).
SUMMARY_NOTE = ("Середнє, яке наводять самі автори таблиці.", "The mean given by the table's authors themselves.")
DURUM = ("Дослідження — білі макарони з твердої пшениці (дурум); макарони з м'якої пшениці (групи Б, В) у таблицях не вимірювали, їхній ГІ може відрізнятися.",
         "The studies are of white durum-wheat pasta; pasta from soft wheat (groups Б, В) wasn't measured in the tables, and its GI may differ.")
PASTA_NN = ("USDA не вказує вид пшениці: збагачені макарони в США зазвичай з твердої пшениці (семоліни), але не завжди.",
            "USDA doesn't state the wheat type: US enriched pasta is usually durum semolina, but not always.")
BARLEY_NOTE = ("Записи — різні сорти ячменю (22–58). Українські упаковки вказують номер крупи (№1–5, розмір зерна), а не сорт ячменю, тому взято верхню оцінку для перлової крупи. Зведене значення таблиці «Barley, mean of 20 foods» — 30 — включає й цільнозерновий ячмінь.",
               "The entries are different barley cultivars (22–58). Ukrainian packs state the grade number (№1–5, grain size), not the barley cultivar, so the upper estimate for pearled barley is used. The table's summary 'Barley, mean of 20 foods' — 30 — also includes whole-grain barley.")
POTATO_HOT = ("s", "ST1", "Boiled potato, mean of 29 studies", 73, 29, "high",
              ("Свіжозварена гаряча картопля; ГІ залежить і від сорту (у записах 58–82). Охолоджена, а потім розігріта картопля знову має високий ГІ (58–79).",
               "Freshly boiled, hot potato; GI also depends on the variety (58–82 in the entries). Cooled and then reheated potato is high again (58–79)."))
POTATO_COLD = ("s", "ST1", "Potato cooked then cooled, mean of eight foods", 49, 8, "high",
               ("Зварена, охолоджена в холодильнику (16–28 год) і з'їдена холодною. Якщо розігріти, ГІ знову зростає (58–79).",
                "Boiled, cooled in the fridge (16–28 h) and eaten cold. Reheating raises it again (58–79)."))
COOLED_NN = ("USDA вимірює свіжозварену картоплю; охолодження не змінює кількості вуглеводів — частина крохмалю стає резистентним (перетравлюється повільніше), саме це знижує ГІ.",
             "USDA measures freshly boiled potato; cooling doesn't change the amount of carbohydrate — part of the starch becomes resistant (digested more slowly), which is what lowers GI.")

OVERRIDES = {
    "B0002": dict(gi=("s", "ST1", "Rice long grain, mean of six foods", 62, 6, "medium", RICE_NOTE)),
    "B0059": dict(gi=("s", "ST1", "Rice long grain, mean of six foods", 62, 6, "medium", RICE_NOTE)),
    "B0004": dict(uk="Вівсяні пластівці (звичайні або швидкого приготування), сухі", gi=("s", "ST1", "Porridge made from rolled oats, mean of eight foods", 58, 8, "high", ("Каша з вівсяних пластівців на воді. Каша з різаного вівса (steel-cut) — 52, з пластівців миттєвого приготування — 82.", "Rolled-oat porridge made with water. Steel-cut oat porridge is 52, instant oat porridge 82."))),
    "B0061": dict(uk="Вівсяна каша з пластівців на воді, без солі", gi=("s", "ST1", "Porridge made from rolled oats, mean of eight foods", 58, 8, "high", ("Каша з вівсяних пластівців на воді. Каша з різаного вівса (steel-cut) — 52, з пластівців миттєвого приготування — 82.", "Rolled-oat porridge made with water. Steel-cut oat porridge is 52, instant oat porridge 82."))),
    "B0006": dict(gi=("m", "ST1", [529, 533, 541, 542, 546, 547], "medium", BARLEY_NOTE)),
    "B0063": dict(gi=("m", "ST1", [529, 533, 541, 542, 546, 547], "medium", BARLEY_NOTE)),
    "B0009": dict(uk="Макарони пшеничні, сухі", en="Pasta, wheat, enriched, dry", nr="medium", nn=PASTA_NN, gi=("s", "ST1", "White spaghetti, boiled, mean of 11 foods", 47, 11, "medium", DURUM)),
    "B0066": dict(uk="Макарони пшеничні, варені, без солі", en="Pasta, wheat, enriched, cooked, without salt", nr="medium", nn=PASTA_NN, gi=("s", "ST1", "White spaghetti, boiled, mean of 11 foods", 47, 11, "medium", DURUM)),
    "B0010": dict(uk="Хліб житньо-пшеничний", en="Bread, rye (rye-wheat)", gi=("s", "ST1", "Rye breads, mean of 13 foods", 60, 13, "medium", ("Різні житні хліби; цільнозерновий житній і пумперні́кель нижчі (41–58), житньо-пшеничні — близько 60.", "Various rye breads; wholegrain rye and pumpernickel are lower (41–58), rye-wheat breads about 60."))),
    "B0011": dict(gi=("s", "ST1", "White wheat flour bread, mean of 35 foods", 73, 35, "high", ("Звичайний білий пшеничний хліб.", "Plain white wheat bread."))),
    "B0012": dict(uk="Кефір 1%", en="Kefir, low-fat (1%), plain", nn=("Єдиний кефір у USDA — конкретна марка (Lifeway), 1% жиру.", "The only kefir in USDA is one brand (Lifeway), 1% fat.")),
    "B0013": dict(gi=("s", "ST1", "Reduced-fat or low-fat milk, mean of six studies", 27, 6, "high", ("Молоко зниженої жирності, без смакових добавок; для незбираного молока таблиця дає 37 (три дослідження).", "Reduced-fat milk, unflavoured; for full-fat milk the table gives 37 (three studies)."))),
    "B0017": dict(uk="Сметана 12%", en="Sour cream, reduced fat (12%)", nr="high", nn=None),
    "B0026": dict(gi=("s", "ST1", "Lentils, boiled, mean of eight foods", 16, 8, "medium", ("Вісім сортів сочевиці з одного дослідження; старіші дослідження (Таблиця 2) — 18–37.", "Eight lentil cultivars from one study; older studies (Table 2) give 18–37."))),
    "B0068": dict(gi=("s", "ST1", "Lentils, boiled, mean of eight foods", 16, 8, "medium", ("Вісім сортів сочевиці з одного дослідження; старіші дослідження (Таблиця 2) — 18–37.", "Eight lentil cultivars from one study; older studies (Table 2) give 18–37."))),
    "B0028": dict(gi=("s", "ST1", "Peas, mean of two studies", 36, 2, "medium", ("Заморожений зелений горошок.", "Frozen green peas."))),
    "B0031": dict(gi=("s", "ST1", "Carrots, mean of two foods", 32, 2, "high", ("Варена морква, два узгоджені дослідження.", "Boiled carrot, two consistent studies."))),
    "B0046": dict(gi=("s", "ST1", "Sweet corn, mean of two foods", 53, 2, "medium", ("Цукрова кукурудза, два дослідження.", "Sweet corn, two studies."))),
    "B0033": dict(fam="potato", variant="hot", uk="Картопля варена без шкірки, гаряча, без солі", en="Potatoes, boiled without skin, hot, without salt", gi=POTATO_HOT),
    "B0047": dict(uk="Яблуко зі шкіркою"),
    "B0048": dict(uk="Груша"),
    "B0049": dict(uk="Банан"),
    "B0050": dict(uk="Апельсин"),
    "B0051": dict(uk="Полуниця свіжа"),
    "B0052": dict(uk="Слива"),
    "B0053": dict(uk="Виноград червоний або зелений (європейський, напр. кишмиш)", en="Grapes, red or green (European type), raw"),
    "B0070": dict(gi=("s", "ST1", "Basmati rice, white, mean of 10 studies", 60, 10, "high", ("Білий басмати. Розкид у межах басмати — через марку, час варіння й групу людей у дослідженні; басмати швидкого приготування вищий (65).", "White basmati. The spread within basmati comes from the brand, cooking time and the people tested; quick-cooking basmati is higher (65)."))),
    "B0071": dict(gi=("s", "ST1", "Basmati rice, white, mean of 10 studies", 60, 10, "high", ("Білий басмати. Розкид у межах басмати — через марку, час варіння й групу людей у дослідженні; басмати швидкого приготування вищий (65).", "White basmati. The spread within basmati comes from the brand, cooking time and the people tested; quick-cooking basmati is higher (65)."))),
    "B0072": dict(gi=("s", "ST1", "Parboiled rice, mean of 10 studies", 64, 10, "medium", ("Розкид у межах пропареного рису — переважно через час варіння: той самий рис — 68 після 10 хв і 75 після 20 хв (#692, #693); решта — марка.", "The spread within parboiled rice comes mostly from cooking time: the same rice is 68 after 10 min and 75 after 20 min (#692, #693); the rest is the brand."))),
    "B0073": dict(gi=("s", "ST1", "Parboiled rice, mean of 10 studies", 64, 10, "medium", ("Розкид у межах пропареного рису — переважно через час варіння: той самий рис — 68 після 10 хв і 75 після 20 хв (#692, #693); решта — марка.", "The spread within parboiled rice comes mostly from cooking time: the same rice is 68 after 10 min and 75 after 20 min (#692, #693); the rest is the brand."))),
    "B0074": dict(gi=("s", "ST1", "Jasmine rice, white, mean of 18 studies", 89, 18, "medium", ("Жасмин високий в усіх дослідженнях; розкид — через марку й походження (тайські Hom Mali найвищі, 90–116), спосіб варіння й групу людей.", "Jasmine is high in every study; the spread comes from the brand and origin (Thai Hom Mali highest, 90–116), the cooking method and the people tested."))),
    "B0075": dict(gi=("s", "ST1", "Jasmine rice, white, mean of 18 studies", 89, 18, "medium", ("Жасмин високий в усіх дослідженнях; розкид — через марку й походження (тайські Hom Mali найвищі, 90–116), спосіб варіння й групу людей.", "Jasmine is high in every study; the spread comes from the brand and origin (Thai Hom Mali highest, 90–116), the cooking method and the people tested."))),
}
PARBOILED_WHITE = [689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699]
PARBOILED_NOTE = ("Рядок таблиці охоплює й бурий та цільнозерновий пропарений рис, тому взято лише білий пропарений (#689–#699). Розкид — переважно час варіння: той самий рис — 68 після 10 хв і 75 після 20 хв (#692, #693).",
                  "The table's row also covers brown and wholemeal parboiled rice, so only white parboiled rice is used (#689–#699). The spread is mostly cooking time: the same rice is 68 after 10 min and 75 after 20 min (#692, #693).")
for _id in ("B0072", "B0073"):
    OVERRIDES[_id] = dict(gi=("s", "ST1", "Parboiled rice, mean of 10 studies", 64, 10, "medium", PARBOILED_NOTE, PARBOILED_WHITE))
OVERRIDES["B0049"] = dict(OVERRIDES.get("B0049", {}), gi=("m", "ST1", [1088, 1089, 1090, 1091], "high", ("Стиглість змінює ГІ: перестиглий банан — 57 (#1091), недостиглий нижчий.", "Ripeness changes GI: overripe banana is 57 (#1091), under-ripe is lower.")))
OVERRIDES["B0048"] = dict(OVERRIDES.get("B0048", {}), gi=("m", "ST1", [1160, 1161], "medium", ("Те саме дослідження: недостигла груша 24, стигла 33.", "The same study: under-ripe pear 24, ripe 33.")))
GENERIC_PASTA = ("Макарони без зазначеного виду пшениці; дослідження — білі макарони з твердої пшениці (для них є окремий запис), макарони з м'якої пшениці (групи Б, В) не вимірювали, їхній ГІ може відрізнятися.",
                 "Pasta without a stated wheat type; the studies are of white durum-wheat pasta (which has its own entry), pasta from soft wheat (groups Б, В) wasn't measured and its GI may differ.")
for _id in ("B0009", "B0066"):
    OVERRIDES[_id] = dict(OVERRIDES[_id], gi=("s", "ST1", "White spaghetti, boiled, mean of 11 foods", 47, 11, "medium", GENERIC_PASTA))
DURUM_GI = ("s", "ST1", "White spaghetti, boiled, mean of 11 foods", 47, 11, "high", ("Білі макарони з твердої пшениці, варені.", "White durum-wheat pasta, boiled."))
DURUM_NN = ("ГІ точно відповідає макаронам з твердої пшениці, а поживні речовини — із загального запису USDA для макаронів (вид пшениці не вказано). Значення з упаковки ваших макаронів точніші.",
            "The GI matches durum-wheat pasta exactly; the nutrients come from USDA's general pasta entry (wheat type not stated). The values on your pack are more accurate.")

MASH_GI = ("s", "ST1", "Mashed potato, mean of five studies", 79, 5, "high",
           ("Пюре з вареної картоплі; у трьох із п'яти досліджень не вказано, що додавали (молоко, масло), у двох — лише сіль (для пюре на воді — окремий запис). Молоко й масло, ймовірно, мало змінюють ГІ, але розбавляють вуглеводи, що враховано в ГН. Пюре швидкого приготування (з пластівців) — окремий рядок таблиці, 84.",
            "Mashed boiled potato; three of the five studies don't state what was added (milk, butter), two had only salt (mash with water has its own entry). Milk and butter probably change GI little, but they dilute the carbohydrate, which GL takes into account. Instant mash (from flakes) is a separate row of the table, 84."))
MASH_NN = ("Рецепт USDA містить сіль (близько 300 мг натрію на 100 г).", "USDA's recipe includes salt (about 300 mg sodium per 100 g).")

NEW_ITEMS = [
    dict(id="B0083", cat="vegetables", fam="potato", variant="mashed-milk", st="boiled", uk="Картопляне пюре на молоці, з сіллю", en="Potatoes, mashed, home-prepared, whole milk added", n=170493, nr="high", nn=MASH_NN, gi=MASH_GI),
    dict(id="B0085", cat="vegetables", fam="potato", variant="mashed-water", st="boiled", uk="Картопляне пюре на воді, з сіллю", en="Potatoes, mashed with water, salted", n=170520, nr="medium",
         nn=("USDA не має пюре без добавок; пюре на воді має ті самі поживні речовини, що й варена картопля, — запис USDA для вареної картоплі з сіллю.", "USDA has no plain mash; mash made with water has the same nutrients as boiled potato — USDA's entry for boiled potato with salt."),
         gi=("m", "ST1", [1864, 1865], "medium",
             ("Лише два дослідження пюре, про які відомо, що нічого, крім солі, не додавали (Норвегія 81, Австралія 91). Інші три дослідження пюре склад не вказують (73–76).",
              "Only the two mashed-potato studies known to have nothing but salt added (Norway 81, Australia 91). The other three mashed-potato studies don't state what was added (73–76)."))),
    dict(id="B0084", cat="vegetables", fam="potato", variant="mashed-milk-butter", st="boiled", uk="Картопляне пюре на молоці з вершковим маслом, з сіллю", en="Potatoes, mashed, home-prepared, whole milk and butter added", n=168555, nr="high", nn=MASH_NN, gi=MASH_GI),
    dict(id="B0081", cat="grains", fam="pasta", variant="durum", st="dry", uk="Макарони з твердої пшениці, сухі", en="Pasta, durum wheat, dry", n=169736, nr="low", nn=DURUM_NN, gi=DURUM_GI),
    dict(id="B0082", cat="grains", fam="pasta", variant="durum", st="boiled", uk="Макарони з твердої пшениці, варені, без солі", en="Pasta, durum wheat, cooked, without salt", n=169737, nr="low", nn=DURUM_NN, gi=DURUM_GI),
    dict(id="B0080", cat="vegetables", fam="potato", variant="cooled", st="boiled", uk="Картопля варена без шкірки, охолоджена, без солі", en="Potatoes, boiled without skin, cooled, without salt",
         n=170440, nr="medium", nn=COOLED_NN, gi=POTATO_COLD),
]


# --- review round 5 (developer, 2026-10-05): kefir 2.5% and type entries ------
OAT_ROLLED_NOTE = ("Каша з вівсяних пластівців на воді. Каша з різаного вівса (steel-cut) і з пластівців миттєвого приготування — окремі записи.",
                   "Rolled-oat porridge made with water. Steel-cut and instant oat porridge have their own entries.")
for _id in ("B0004", "B0061"):
    OVERRIDES[_id] = dict(OVERRIDES[_id], fam="oats", variant="rolled",
                          gi=("s", "ST1", "Porridge made from rolled oats, mean of eight foods", 58, 8, "high", OAT_ROLLED_NOTE))
STEEL_GI = ("s", "ST1", "Porridge made from steel-cut oats, mean of five foods", 52, 5, "high", ("Каша з різаного вівса (steel-cut), зварена на воді.", "Steel-cut oat porridge cooked in water."))
STEEL_NN = ("USDA не має окремого запису для різаного вівса; це те саме зерно, що й пластівці, тож поживні речовини — з запису для вівсяних пластівців.",
            "USDA has no separate steel-cut oats entry; it's the same grain as rolled oats, so the nutrients come from the rolled-oats entry.")
INSTANT_GI = ("s", "ST1", "Instant oat porridge, mean of four foods", 82, 4, "high", ("Каша з вівсяних пластівців миттєвого приготування, на воді.", "Instant oat porridge made with water."))
INSTANT_NN = ("Запис USDA — збагачені пластівці миттєвого приготування без смакових добавок; збагачення додає мінерали й сіль (натрій).",
              "The USDA entry is fortified plain instant oats; fortification adds minerals and some sodium.")

RYE_WHEAT_NOTE = ("Житньо-пшеничний хліб (житнє борошно разом із пшеничним): 4 дослідження. Цільнозерновий житній хліб і пумпернікель — окремий запис, у них ГІ нижчий.",
                  "Rye-wheat bread (rye flour together with wheat flour): 4 studies. Wholegrain rye bread and pumpernickel have their own entry, with lower GI.")
OVERRIDES["B0010"] = dict(OVERRIDES["B0010"], fam="rye-bread", variant="rye-wheat", gi=("m", "ST1", [212, 213, 218, 223], "medium", RYE_WHEAT_NOTE))

BANANA_NN = ("Стиглість переводить крохмаль у цукри, а загальна кількість вуглеводів майже не змінюється, тож поживні речовини — ті самі (USDA, банан сирий).",
             "Ripening turns starch into sugars while the total carbohydrate barely changes, so the nutrients are the same (USDA, raw banana).")
PEAR_NN = ("Поживні речовини — ті самі (USDA, груша сира); стиглість змінює ГІ, а не кількість вуглеводів.",
           "The nutrients are the same (USDA, raw pear); ripeness changes the GI, not the amount of carbohydrate.")
OVERRIDES["B0049"] = dict(OVERRIDES["B0049"], fam="banana", gi=("m", "ST1", [1088, 1089, 1090, 1091], "high",
                          ("Для банана, стиглість якого невідома. Якщо відома — оберіть запис «недостиглий», «стиглий» або «перестиглий».", "For a banana of unknown ripeness. If it's known, pick the under-ripe, ripe or overripe entry.")))
OVERRIDES["B0048"] = dict(OVERRIDES["B0048"], fam="pear", gi=("m", "ST1", [1160, 1161], "medium",
                          ("Для груші, стиглість якої невідома: те саме дослідження дає 24 для недостиглої і 33 для стиглої (окремі записи).", "For a pear of unknown ripeness: the same study gives 24 under-ripe and 33 ripe (own entries).")))
OVERRIDES["B0012"] = dict(OVERRIDES["B0012"], fam="kefir", variant="1%")

TYPE_ITEMS = [
    dict(id="B0086", cat="grains", fam="oats", variant="steel-cut", st="dry", uk="Овес різаний (steel-cut), сухий", en="Oats, steel-cut, dry", n=173904, nr="medium", nn=STEEL_NN, gi=STEEL_GI),
    dict(id="B0087", cat="grains", fam="oats", variant="steel-cut", st="boiled", uk="Каша з різаного вівса на воді, без солі", en="Steel-cut oat porridge, cooked with water, without salt", n=173905, nr="medium", nn=STEEL_NN, gi=STEEL_GI),
    dict(id="B0088", cat="grains", fam="oats", variant="instant", st="dry", uk="Вівсяні пластівці миттєвого приготування, сухі", en="Oats, instant, fortified, plain, dry", n=171661, nr="high", nn=INSTANT_NN, gi=INSTANT_GI),
    dict(id="B0089", cat="grains", fam="oats", variant="instant", st="boiled", uk="Вівсяна каша миттєвого приготування на воді", en="Oats, instant, fortified, plain, prepared with water", n=171662, nr="high", nn=INSTANT_NN, gi=INSTANT_GI),
    dict(id="B0090", cat="bread", fam="rye-bread", variant="wholegrain-rye", st="baked", uk="Хліб житній цільнозерновий (пумпернікель)", en="Bread, pumpernickel (wholegrain rye)", n=174918, nr="medium",
         nn=("Запис USDA — хліб пумпернікель; рецепти цільнозернового житнього хліба різняться (частка житнього борошна, цілі зерна).", "The USDA entry is pumpernickel bread; wholegrain rye recipes vary (share of rye flour, whole kernels)."),
         gi=("m", "ST1", [215, 216, 219, 224], "medium", ("Хліб переважно з житнього борошна: пумпернікель, житній на заквасці, цільнозерновий житній із зернами.", "Bread made mostly from rye: pumpernickel, rye sourdough, wholegrain rye with kernels."))),
    dict(id="B0091", cat="fruit", fam="banana", variant="under-ripe", st="raw", uk="Банан недостиглий (жовтий із зеленими кінчиками)", en="Banana, slightly under-ripe", n=173944, nr="medium", nn=BANANA_NN,
         gi=("m", "ST2", [2906, 2907], "low", ("Лише одне дослідження 1992 року у людей з діабетом 2 типу (Таблиця 2); у Таблиці 1 недостиглого десертного банана немає.", "Only one 1992 study in people with type 2 diabetes (Table 2); Table 1 has no under-ripe dessert banana."))),
    dict(id="B0092", cat="fruit", fam="banana", variant="ripe", st="raw", uk="Банан стиглий (повністю жовтий)", en="Banana, ripe", n=173944, nr="medium", nn=BANANA_NN,
         gi=("m", "ST1", [1088, 1089, 1090], "high", ("Три узгоджені дослідження стиглого банана.", "Three consistent studies of ripe banana."))),
    dict(id="B0093", cat="fruit", fam="banana", variant="overripe", st="raw", uk="Банан перестиглий (з коричневими цятками)", en="Banana, overripe", n=173944, nr="medium", nn=BANANA_NN,
         gi=("m", "ST1", [1091], "medium", ("Одне дослідження перестиглого банана.", "A single study of overripe banana."))),
    dict(id="B0094", cat="fruit", fam="pear", variant="ripe", st="raw", uk="Груша стигла (м'яка)", en="Pear, ripe", n=169118, nr="medium", nn=PEAR_NN,
         gi=("m", "ST1", [1161], "medium", ("Одне дослідження: груша Williams, стигла.", "A single study: Williams pear, ripe."))),
    dict(id="B0095", cat="fruit", fam="pear", variant="under-ripe", st="raw", uk="Груша недостигла (тверда)", en="Pear, under-ripe", n=169118, nr="medium", nn=PEAR_NN,
         gi=("m", "ST1", [1160], "medium", ("Одне дослідження: груша Williams, недостигла.", "A single study: Williams pear, under-ripe."))),
    dict(id="B0096", cat="dairy", fam="kefir", variant="2.5%", st="fermented", uk="Кефір 2,5%", en="Kefir, 2.5% fat (calculated)", n=("calc", "kefir25"), nr="low",
         nn=("Розрахунок: у USDA є лише кефір 1%; жир замінено на 2,5 г і додано калорії цього жиру (9 ккал на 1 г), вуглеводи й білки ті самі.", "A calculation: USDA has only 1% kefir; fat set to 2.5 g and its calories added (9 kcal per g), carbohydrate and protein unchanged."),
         gi=("m", "ST1", [933], "low", ("Виміряно лише для кефіру 1%; для молока таблиця дає 27 для зниженої жирності й 37 для незбираного, тож жир, можливо, трохи змінює ГІ.", "Measured only for 1% kefir; for milk the table gives 27 reduced-fat and 37 full-fat, so fat may change GI a little."))),
]
NEW_ITEMS += TYPE_ITEMS


# --- 1.9 additions (developer, 2026-10-05): coffee — mom drinks 2–3 small cups of
# Turkish-style coffee every morning, brewed in a small pot (джезва). The developer
# chose to add both regular brewed coffee (the closer match for how it's made) and
# espresso (the strong end). USDA's FNDDS "Coffee, Turkish" includes sugar, so it
# doesn't fit coffee without sugar; sugar or milk are logged as their own products.
COFFEE_NOTE = ("Без цукру й молока — якщо їх додаєте, внесіть їх окремо.", "Without sugar or milk — if you add them, log them separately.")
COFFEE_ITEMS = [
    dict(id="B0097", ver="2026-10-05", cat="drinks", fam="coffee", variant="brewed", st="brewed", uk="Кава чорна зварена (джезва, турка, фільтр), без цукру", en="Coffee, brewed, black, without sugar", n=171890, nr="medium",
         nn=("Запис USDA — звичайна заварна кава. Кава, зварена в джезві, міцніша й нефільтрована, але гуща осідає і її не п'ють; окремого запису для неї в USDA немає (запис FNDDS #2710377 «Coffee, Turkish» уже містить цукор). Значення на 100 г дуже малі в будь-якому разі. " + COFFEE_NOTE[0],
             "The USDA entry is regular brewed coffee. Coffee made in a small pot (джезва) is stronger and unfiltered, but the grounds settle and aren't drunk; USDA has no entry for it (FNDDS #2710377 \"Coffee, Turkish\" already includes sugar). The values per 100 g are tiny either way. " + COFFEE_NOTE[1]),
         gi=("na",)),
    dict(id="B0098", ver="2026-10-05", cat="drinks", fam="coffee", variant="espresso", st="brewed", uk="Кава еспресо, без цукру", en="Coffee, espresso, without sugar", n=171891, nr="high", nn=COFFEE_NOTE,
         gi=("na", ("ГІ для чорної кави не вимірюють: у ній немає цукрів (0 г) і крохмалю. 1,67 г «вуглеводів» у записі USDA — це розрахунок «за різницею» (усе, що не вода, білок, жир і зола), а не цукор чи крохмаль. ГН дорівнює 0.",
                     "GI isn't measured for black coffee: it has no sugars (0 g) and no starch. USDA's 1.67 g of \"carbohydrate\" is calculated \"by difference\" (everything that isn't water, protein, fat or ash), not sugar or starch. GL is 0."))),
]
NEW_ITEMS += COFFEE_ITEMS


# --- helpers ----------------------------------------------------------------
# The cautious GI rule (developer, 2026-10-05): when an entry combines several
# measurements — the range comes from type, variety, brand, ripeness or cooking
# details the entry can't specify — its GI is the upper quartile of those
# measurements (¾ are at or below it), taken only from the most reliable tier
# (Table 1 before Table 2). A single extreme study can't drive it, unlike the
# maximum. Wording stays factual: an upper estimate, never "safer".
def zapysiv(n):
    """Ukrainian plural of «запис» after a number: 1 запис, 2–4 записи, 5+ записів (11–14 записів)."""
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} запис"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return f"{n} записи"
    return f"{n} записів"


def upper_quartile(values):
    if len(values) == 1:
        return values[0]
    return int(statistics.quantiles(sorted(values), n=4, method="inclusive")[2] + 0.5)


SUMMARIES = json.load(open(os.path.join(WORK, "gi-2021-summaries.json"), encoding="utf-8"))

def fetch_usda(ids):
    req = urllib.request.Request(f"https://api.nal.usda.gov/fdc/v1/foods?api_key={KEY}", data=json.dumps({"fdcIds": ids, "format": "full"}).encode(), headers={"Content-Type": "application/json"})
    out = {}
    for f in json.load(urllib.request.urlopen(req, timeout=60)):
        vals = {}
        for n in f.get("foodNutrients", []):
            field = NUTRIENTS.get(str(n.get("nutrient", {}).get("number")))
            if field and "amount" in n:
                vals[field] = round(float(n["amount"]), 2)
        out[f["fdcId"]] = {"description": f["description"], "dataType": f["dataType"], "per100g": vals}
    return out


def per100g(vals):
    unknown = [k for k in NUTRIENTS.values() if k not in vals]
    return {k: vals.get(k, 0) for k in NUTRIENTS.values()}, unknown


def nutrients_reason(item):
    base = {"high": ("Запис USDA точно описує цей продукт у цьому стані.", "The USDA entry describes exactly this food in this state."),
            "medium": ("Найближчий запис USDA — див. примітку.", "The closest USDA entry — see the note."),
            "low": ("Наближена відповідність — див. примітку.", "An approximate match — see the note.")}[item["nr"]]
    note = item.get("nn")
    return {"uk": base[0] + (" " + note[0] if note else ""), "en": base[1] + (" " + note[1] if note else "")}


def gi_part(item, entries, warnings):
    kind = item["gi"][0]
    if kind == "c":
        return {"status": "conventional", "value": 15, "source": None, "reliability": "low", "verified": VERIFIED,
                "reason": {"uk": "Вуглеводів дуже мало, тому ГІ не вимірюють; умовне значення 15, щоб ці вуглеводи все одно враховувалися в ГН.",
                           "en": "Too little carbohydrate for GI to be measured; a conventional value of 15 so these carbohydrates still count in GL."}}
    if kind == "na":
        note = item["gi"][1] if len(item["gi"]) > 1 else ("Вуглеводів практично немає: ГІ не визначається, ГН дорівнює 0.", "Practically no carbohydrate: GI isn't defined and GL is 0.")
        return {"status": "notApplicable", "value": None, "source": None, "reliability": "high", "verified": VERIFIED,
                "reason": {"uk": note[0], "en": note[1]}}
    if kind == "u":
        return {"status": "unknown", "value": None, "source": None, "reliability": "low", "verified": VERIFIED,
                "reason": {"uk": item["gi"][1][0], "en": item["gi"][1][1]}}
    if kind == "s":
        # The table's own summary row: the upper quartile of exactly the entries it covers
        # (or of an explicit list where the row's coverage can't be reproduced), with the authors' mean in the note.
        _, table, label, published, n, rel, note, *explicit = item["gi"]
        row = SUMMARIES.get(label)
        numbers = explicit[0] if explicit else (row["entries"] if row else [])
        picked = [e for e in entries if e["table"] == table and e["number"] in numbers and e["gi"] is not None]
        if not picked:
            warnings.append(f"{item['id']}: summary row '{label}' has no entries")
            picked = []
        values = [e["gi"] for e in picked]
        if row and not explicit and abs(statistics.mean(values) - row["value"]) > 1:
            warnings.append(f"{item['id']}: entries under '{label}' average {statistics.mean(values):.1f}, the table says {row['value']}")
        value = upper_quartile(values)
        lo, hi = min(values), max(values)
        reason = {"uk": f"Верхня оцінка: ¾ вимірювань не вищі за це значення ({zapysiv(len(values))}, які підсумовує рядок таблиці «{label}»; середнє авторів — {published}, діапазон {lo}–{hi}). " + note[0],
                  "en": f"Upper estimate: ¾ of the measurements are at or below this value ({len(values)} entries covered by the table's row '{label}'; the authors' mean is {published}, range {lo}–{hi}). " + note[1]}
        if item["st"] == "dry":
            reason = {"uk": reason["uk"] + " " + DRY[0], "en": reason["en"] + " " + DRY[1]}
        return {"status": "measured", "value": value, "reliability": rel, "verified": VERIFIED, "reason": reason,
                "source": {"dataset": "gi-2021-st1" if table == "ST1" else "gi-2021-st2",
                           "entryId": f"summary row; #{picked[0]['number']}–#{picked[-1]['number']}" if len(picked) > 1 else f"#{picked[0]['number']}",
                           "description": f"{label} — GI {published} (summary row). Entries used: " + ", ".join(f"#{e['number']} {e['gi']}" for e in picked)}}
    _, table, numbers, rel, note = item["gi"]
    if numbers == "white-bread":  # every plain "White bread" entry of Table 1
        picked = [e for e in entries if e["table"] == "ST1" and e["text"].lower().startswith("white bread") and "gluten" not in e["text"].lower() and "sourdough" not in e["text"].lower() and e["gi"]]
    else:
        picked = [e for e in entries if e["table"] == table and e["number"] in numbers]
    if len(picked) != (len(numbers) if numbers != "white-bread" else len(picked)) or not picked or any(e["gi"] is None for e in picked):
        warnings.append(f"{item['id']}: GI entries not all found/parsed: {numbers}")
    values = [e["gi"] for e in picked if e["gi"] is not None]
    value = upper_quartile(values)
    t_uk, t_en = ("Таблиця 1, метод ISO", "Table 1, ISO method") if table == "ST1" else ("Таблиця 2, менш надійні методи", "Table 2, less robust methods")
    if len(values) == 1:
        how_uk, how_en = f"Значення запису ({t_uk}).", f"The entry's value ({t_en})."
    else:
        mean = statistics.mean(values)
        how_uk = f"Верхня оцінка: ¾ вимірювань не вищі за це значення ({zapysiv(len(values))}, {t_uk}; діапазон {min(values)}–{max(values)}, середнє {mean:.0f})."
        how_en = f"Upper estimate: ¾ of the measurements are at or below this value ({len(values)} entries, {t_en}; range {min(values)}–{max(values)}, mean {mean:.0f})."
    reason = {"uk": how_uk + " " + note[0], "en": how_en + " " + note[1]}
    if item["st"] == "dry":
        reason = {"uk": reason["uk"] + " " + DRY[0], "en": reason["en"] + " " + DRY[1]}
    def short(e):
        # The table's own food description, then (country, year): cut where "<Country> <year>" begins.
        text = re.sub(r"�(?=C\b)", "°", e["text"]).replace("�", "±")  # the PDF's ° and ± both came out as U+FFFD
        m = re.search(r"\s((?:[A-Z][a-z]+(?: [A-Z][a-z]+)?|UK|USA|UAE|Multiple countries))\s((?:19|20)\d\d)\*?\s", text)
        food = re.sub(r"\d+$", "", text[: m.start()].strip()) if m else text[:90]
        where = f" ({m.group(1)}, {m.group(2)})" if m else ""
        sem = f"±{e['sem']:g}" if e.get("sem") is not None else ""
        return f"{food}{where} — GI {e['gi']}{sem}"
    return {"status": "measured", "value": value, "reliability": rel, "verified": VERIFIED, "reason": reason,
            "source": {"dataset": "gi-2021-st1" if table == "ST1" else "gi-2021-st2",
                       "entryId": ", ".join(f"#{e['number']}" for e in picked),
                       "description": "; ".join(f"#{e['number']} {short(e)}" for e in picked)}}


def calculated(kind, usda):
    if kind == "kefir25":
        base = usda[170904]["per100g"]
        extra_fat = 2.5 - base["fatG"]
        vals = dict(base, fatG=2.5, caloriesKcal=round(base["caloriesKcal"] + extra_fat * 9, 1))
        desc = (f"Kefir, lowfat, plain, LIFEWAY (USDA SR Legacy #170904, {base['fatG']} g fat) with fat set to 2.5 g and "
                f"{extra_fat * 9:.1f} kcal added (9 kcal per g of fat); carbohydrate, protein and the rest unchanged.")
        return vals, desc
    # Semolina porridge: dry semolina (#169715) scaled by USDA's own farina dry→cooked ratio
    # (#171658 dry 73.2 g carbs → #171659 cooked 10.9 g), i.e. the water the porridge takes up.
    dry, f_dry, f_cooked = usda[169715]["per100g"], usda[171658]["per100g"], usda[171659]["per100g"]
    factor = f_cooked["carbsG"] / f_dry["carbsG"]
    vals = {k: round(v * factor, 1) for k, v in dry.items()}
    desc = (f"Semolina, enriched, dry (USDA SR Legacy #169715) × {factor:.3f} — the water uptake of USDA's farina porridge "
            f"(#171658 dry {f_dry['carbsG']} g carbohydrate → #171659 cooked with water {f_cooked['carbsG']} g per 100 g); no salt added.")
    return vals, desc


def main():
    entries = json.load(open(os.path.join(WORK, "gi-2021-entries.json"), encoding="utf-8"))
    ids = sorted({i["n"] for i in ITEMS + NEW_ITEMS if isinstance(i["n"], int)} | {169715, 171658, 171659})
    usda = {}
    for k in range(0, len(ids), 20):
        usda.update(fetch_usda(ids[k:k + 20]))
    warnings, out = [], []
    items = [{**i, **OVERRIDES.get(i["id"], {})} for i in ITEMS] + NEW_ITEMS
    for item in sorted(items, key=lambda i: i["id"]):
        if isinstance(item["n"], int):
            u = usda.get(item["n"])
            if not u:
                warnings.append(f"{item['id']}: USDA {item['n']} not returned")
                continue
            vals, unknown = per100g(u["per100g"])
            source = {"dataset": "usda-sr-legacy", "entryId": str(item["n"]), "description": u["description"]}
            if u["dataType"] != "SR Legacy":
                warnings.append(f"{item['id']}: {item['n']} is {u['dataType']}")
        else:
            raw, desc = calculated(item["n"][1], usda)
            vals, unknown = per100g(raw)
            source = {"dataset": "calculation", "entryId": "", "description": desc}
        nutrients = {"per100g": vals, "source": source, "reliability": item["nr"], "reason": nutrients_reason(item), "verified": VERIFIED}
        if unknown:
            nutrients["unknown"] = unknown
        gi = gi_part(item, entries, warnings)
        if item.get("ver"):  # checked later than the 1.8 set
            nutrients["verified"] = gi["verified"] = item["ver"]
        out.append({"id": item["id"], "status": "active", "category": item["cat"], "family": item["fam"], **({"variant": item["variant"]} if item.get("variant") else {}), "state": item["st"],
                    "nameUk": item["uk"], "nameEn": item["en"], "nutrients": nutrients, "gi": gi})
    db = json.load(open(DB, encoding="utf-8"))
    db["entries"] = out
    json.dump(db, open(DB, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(DB, "a", encoding="utf-8").write("\n")
    report = [f"{e['id']} {e['nameUk']}: {e['nutrients']['per100g']['carbsG']} g carbs, {e['nutrients']['per100g']['caloriesKcal']} kcal"
              f"{' (unknown: ' + ','.join(e['nutrients'].get('unknown', [])) + ')' if e['nutrients'].get('unknown') else ''}"
              f" | GI {e['gi']['status']} {e['gi']['value']} ({e['gi']['reliability']})" for e in out]
    open(os.path.join(WORK, "build-report.txt"), "w", encoding="utf-8").write("\n".join(report + ["", "WARNINGS:"] + warnings))
    print(len(out), "entries;", len(warnings), "warnings")
    for w in warnings:
        print(" ", w)


if __name__ == "__main__":
    main()
