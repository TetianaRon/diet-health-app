// One search for every food list (release 1.9, spec → "Search and GI
// suggestions"): the Продукти/Страви lists, the add-product form, the meal
// picker and the dish composer — and the GI suggestions for her own items.
// Pure, unit-tested.
//
// Matching: lower case, apostrophes/punctuation dropped, «ё»→«е»; words match
// by word start, tolerant of Ukrainian endings («гречки» finds «Гречка»); a
// food family's everyday synonyms count like words of its names (спагетті →
// макарони). Words that only describe the state («сирий», «сухий», «варений»,
// «без солі»…) never match on their own — «сир» must not find «сирий».
import type { VerifiedFoodEntry } from "../data/verifiedFoods";

/** Everyday words per database food family (family IDs from verified-foods.json). */
export const FAMILY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  buckwheat: ["гречка", "гречана", "ядриця", "продел"],
  rice: ["рис", "рисова"],
  "wild-rice": ["рис", "дикий"],
  oats: ["вівсянка", "вівсяна", "вівсяні", "геркулес", "овес", "овсянка"],
  millet: ["пшоно", "пшонка", "пшоняна"],
  "pearl-barley": ["перловка", "перлова", "ячмінь"],
  semolina: ["манка", "манна"],
  "corn-grits": ["мамалига", "полента", "кукурудзяна"],
  pasta: ["макарони", "спагетті", "паста", "вермішель", "локшина", "ріжки", "спіральки", "пенне", "фузилі"],
  "rye-bread": ["житній", "чорний", "бородинський"],
  "white-bread": ["батон", "булка", "білий"],
  kefir: ["кефір"],
  milk: ["молоко"],
  yogurt: ["йогурт"],
  "cottage-cheese": ["творог", "кисломолочний"],
  "hard-cheese": ["гауда", "голландський", "твердий"],
  "sour-cream": ["сметана"],
  butter: ["масло"],
  "chicken-breast": ["курка", "курятина", "куряче", "філе"],
  "beef-lean": ["яловичина", "телятина"],
  "turkey-breast": ["індичка", "індиче"],
  cod: ["тріска"],
  salmon: ["лосось", "сьомга"],
  egg: ["яйце", "яйця"],
  "kidney-beans": ["квасоля"],
  lentils: ["сочевиця"],
  chickpeas: ["нут"],
  "green-peas": ["горошок", "горох"],
  cabbage: ["капуста"],
  carrot: ["морква"],
  beetroot: ["буряк", "бурячок"],
  potato: ["картопля", "картопляне", "пюре", "бульба"],
  cucumber: ["огірок", "огірки"],
  tomato: ["помідор", "томат"],
  onion: ["цибуля"],
  garlic: ["часник"],
  zucchini: ["кабачок", "цукіні"],
  broccoli: ["броколі"],
  "bell-pepper": ["перець", "болгарський"],
  pumpkin: ["гарбуз"],
  spinach: ["шпинат"],
  lettuce: ["салат"],
  radish: ["редис", "редиска"],
  "button-mushroom": ["печериці", "шампіньйони", "гриби"],
  "sweet-corn": ["кукурудза", "качан"],
  apple: ["яблуко", "яблука"],
  pear: ["груша"],
  banana: ["банан"],
  orange: ["апельсин"],
  strawberry: ["полуниця", "суниця"],
  plum: ["слива"],
  grapes: ["виноград", "кишмиш"],
  walnut: ["горіхи", "горіх", "волоські"],
  almond: ["мигдаль"],
  "sunflower-oil": ["олія", "соняшникова"],
  "olive-oil": ["олія", "оливкова"],
};

/** Words that only say how a food is — they help rank, never make a match on their own. */
const STATE_WORDS = new Set([
  "сирий", "сира", "сире", "сирі", "сухий", "суха", "сухе", "сухі", "варений", "варена", "варене", "варені",
  "без", "солі", "сіллю", "з", "на", "і", "й", "та", "або", "запечений", "запечена", "запечене", "тушкований", "тушкована", "тушковане",
]);

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/['’ʼ`]/g, "")
    .split(/[^\p{L}\p{N}%]+/u)
    .filter(Boolean);
}

/** A word without its likely Ukrainian ending: «гречки» → «греч», «макаронні» → «макарон». Short words stay whole. */
function stem(word: string): string {
  if (word.length > 5) return word.slice(0, word.length - 2);
  if (word.length > 4) return word.slice(0, word.length - 1);
  return word;
}

function wordMatches(query: string, word: string): boolean {
  if (word.startsWith(query)) return true;
  const qs = stem(query);
  const ws = stem(word);
  return qs.length >= 4 && ws.length >= 4 && (word.startsWith(qs) || query.startsWith(ws));
}

export interface Searchable {
  id: string;
  nameUk: string;
}

interface Scored<T> {
  item: T;
  matched: number;
  total: number;
  startsWithFirst: boolean;
  fromDatabase: boolean;
  order: number;
}

/**
 * Items matching the query, best first: all words matched, then more words
 * matched, then a match at the name's start, then database entries (in
 * database order, so a family's types stay together), then the rest in their
 * own order. An empty query returns the items as they are.
 */
export function searchFoods<T extends Searchable>(query: string, items: readonly T[], entryOf: (item: T) => VerifiedFoodEntry | null): T[] {
  const queryWords = normalizeWords(query);
  if (queryWords.length === 0) return [...items];
  const meaningful = queryWords.filter((w) => !STATE_WORDS.has(w));
  const words = meaningful.length > 0 ? meaningful : queryWords;

  const scored: Scored<T>[] = [];
  items.forEach((item, index) => {
    const entry = entryOf(item);
    const nameWords = normalizeWords(item.nameUk);
    const matchable = [...nameWords.filter((w) => !STATE_WORDS.has(w)), ...(entry ? (FAMILY_SYNONYMS[entry.family] ?? []) : [])];
    // State words she typed still count if the name has them («гречка варена» prefers the cooked entry).
    const stateWords = nameWords.filter((w) => STATE_WORDS.has(w));
    let matched = 0;
    for (const q of words) if (matchable.some((w) => wordMatches(q, w))) matched++;
    if (matched === 0) return;
    const stateBonus = queryWords.filter((q) => STATE_WORDS.has(q) && stateWords.some((w) => wordMatches(q, w))).length;
    scored.push({
      item,
      matched: matched + stateBonus * 0.5,
      total: words.length,
      startsWithFirst: nameWords.length > 0 && wordMatches(words[0], nameWords[0]),
      fromDatabase: entry !== null && entry.id === item.id,
      order: index,
    });
  });

  return scored
    .sort(
      (a, b) =>
        Number(b.matched >= b.total) - Number(a.matched >= a.total) ||
        b.matched - a.matched ||
        Number(b.startsWithFirst) - Number(a.startsWithFirst) ||
        Number(b.fromDatabase) - Number(a.fromDatabase) ||
        a.order - b.order,
    )
    .map((s) => s.item);
}

/**
 * Database entries whose GI can be offered for one of her own items named
 * `name`: up to `limit` best matches with a GI value to give (measured or
 * conventional — not «не застосовується», not unknown).
 */
export function suggestGi(name: string, entries: readonly VerifiedFoodEntry[], limit = 3): VerifiedFoodEntry[] {
  const offerable = entries.filter((e) => e.status === "active" && e.gi.value !== null && e.gi.status !== "notApplicable");
  const found = searchFoods(name, offerable, (e) => e);
  // One per GI value and family: «Гречка суха» and «Гречка варена» carry the same GI — offer it once.
  const seen = new Set<string>();
  return found
    .filter((e) => {
      const key = `${e.family}:${e.gi.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
