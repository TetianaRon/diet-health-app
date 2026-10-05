# Release 1.8, step 2: USDA FoodData Central candidates for the 69 built-in
# items (57 foods + 12 cooked dishes). Searches SR Legacy + Foundation with a
# deliberately worded query per item (state matched: raw/dry vs cooked,
# cooked "without salt" — spec → "Verified food database"), keeps the top 6
# with their key nutrients, so the entry ID for each item is chosen from the
# database itself, not from memory. Output: usda-candidates.json.
# `python usda_search.py B0001 B0058` refreshes only those IDs.
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
# Generated files and the GI sources stay local (gitignored): parsed tables come
# from the 2021 GI paper's supplements, so only the scripts are versioned.
WORK = os.path.join(ROOT, "contributions", "2026-10-verified-db")
REF = os.path.join(ROOT, "contributions", "references")
ENV = os.path.join(ROOT, ".env")


def read_key():
    for line in open(ENV, encoding="utf-8"):
        for name in ("USDA_API_KEY=", "VITE_USDA_API_KEY="):
            if line.startswith(name) and line.split("=", 1)[1].strip():
                return line.split("=", 1)[1].strip()
    sys.exit("No USDA key in .env")


KEY = read_key()

# B ID -> USDA search query
QUERIES = {
    "B0001": "Buckwheat groats, roasted, dry",
    "B0002": "Rice, white, long-grain, regular, raw, enriched",
    "B0003": "Rice, brown, long-grain, raw (Includes foods for USDA's Food Distribution Program)",
    "B0004": "Oats, regular and quick, not fortified, dry",
    "B0005": "Millet, raw",
    "B0006": "Barley, pearled, raw",
    "B0007": "Semolina, enriched",
    "B0008": "Cornmeal, degermed, enriched, yellow",
    "B0009": "Pasta, dry, enriched",
    "B0010": "Bread, rye",
    "B0011": "Bread, white, commercially prepared (includes soft bread crumbs)",
    "B0012": "Kefir, lowfat, plain",
    "B0013": "Milk, reduced fat, fluid, 2% milkfat",
    "B0014": "Yogurt, plain, skim milk",
    "B0015": "Cheese, cottage, lowfat, 1% milkfat",
    "B0016": "Cheese, gouda",
    "B0017": "Cream, sour, reduced fat, cultured",
    "B0018": "Butter, without salt",
    "B0019": "Chicken, broilers or fryers, breast, meat only, cooked, stewed",
    "B0020": "Beef, round, lean only, cooked, simmered",
    "B0021": "Turkey, breast, meat only, cooked, roasted",
    "B0022": "Fish, cod, Atlantic, cooked, dry heat",
    "B0023": "Fish, salmon, Atlantic, farmed, cooked, dry heat",
    "B0024": "Egg, whole, cooked, hard-boiled",
    "B0025": "Beans, kidney, red, mature seeds, raw",
    "B0026": "Lentils, raw",
    "B0027": "Chickpeas (garbanzo beans, bengal gram), mature seeds, raw",
    "B0028": "Peas, green, frozen, cooked, boiled, drained, without salt",
    "B0029": "Cabbage, raw",
    "B0030": "Carrots, raw",
    "B0031": "Carrots, cooked, boiled, drained, without salt",
    "B0032": "Beets, cooked, boiled, drained",
    "B0033": "Potatoes, boiled, cooked without skin, flesh, without salt",
    "B0034": "Cucumber, with peel, raw",
    "B0035": "Tomatoes, red, ripe, raw, year round average",
    "B0036": "Onions, raw",
    "B0037": "Garlic, raw",
    "B0038": "Squash, summer, zucchini, includes skin, raw",
    "B0039": "Broccoli, raw",
    "B0040": "Peppers, sweet, red, raw",
    "B0041": "Pumpkin, cooked, boiled, drained, without salt",
    "B0042": "Spinach, raw",
    "B0043": "Lettuce, green leaf, raw",
    "B0044": "Radishes, raw",
    "B0045": "Mushrooms, white, raw",
    "B0046": "Corn, sweet, yellow, cooked, boiled, drained, without salt",
    "B0047": "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
    "B0048": "Pears, raw",
    "B0049": "Bananas, raw",
    "B0050": "Oranges, raw, all commercial varieties",
    "B0051": "Strawberries, raw",
    "B0052": "Plums, raw",
    "B0053": "Grapes, red or green (European type, such as Thompson seedless), raw",
    "B0054": "Nuts, walnuts, english",
    "B0055": "Nuts, almonds",
    "B0056": "Oil, sunflower, linoleic (less than 60%)",
    "B0057": "Oil, olive, salad or cooking",
    "B0058": "Buckwheat groats, roasted, cooked",
    "B0059": "Rice, white, long-grain, regular, enriched, cooked",
    "B0060": "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)",
    "B0061": "Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt",
    "B0062": "Millet, cooked",
    "B0063": "Barley, pearled, cooked",
    "B0064": "Cereals, farina, enriched, cooked with water, without salt",
    "B0065": "Cereals, corn grits, white, regular and quick, enriched, cooked with water, without salt",
    "B0066": "Pasta, cooked, enriched, without added salt",
    "B0067": "Beans, kidney, red, mature seeds, cooked, boiled, without salt",
    "B0068": "Lentils, mature seeds, cooked, boiled, without salt",
    "B0069": "Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt",
}

# FDC nutrient numbers -> our fields (per 100 g)
NUTRIENTS = {"208": "caloriesKcal", "205": "carbsG", "291": "fiberG", "269": "sugarsG", "203": "proteinG", "204": "fatG", "307": "sodiumMg"}


def search(q):
    url = "https://api.nal.usda.gov/fdc/v1/foods/search?" + urllib.parse.urlencode(
        {"api_key": KEY, "query": q, "dataType": "SR Legacy", "pageSize": 6})
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.load(r)
    out = []
    for f in data.get("foods", []):
        vals = {}
        for n in f.get("foodNutrients", []):
            field = NUTRIENTS.get(str(n.get("nutrientNumber")))
            if field and field not in vals:
                vals[field] = n.get("value")
        out.append({"fdcId": f["fdcId"], "dataType": f["dataType"], "description": f["description"], **vals})
    return out


def main():
    only = sys.argv[1:]
    out_path = os.path.join(WORK, "usda-candidates.json")
    results = json.load(open(out_path, encoding="utf-8")) if only and os.path.exists(out_path) else {}
    for bid, q in QUERIES.items():
        if only and bid not in only:
            continue
        try:
            results[bid] = {"query": q, "candidates": search(q)}
        except Exception as e:  # noqa: BLE001 — record and move on
            results[bid] = {"query": q, "error": str(e)}
        time.sleep(0.3)
    json.dump(results, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(results), "queries done;", sum(1 for r in results.values() if "error" in r), "errors")


if __name__ == "__main__":
    main()
