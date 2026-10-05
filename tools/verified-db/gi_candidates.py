# Release 1.8, step 2: candidate GI entries from the 2021 international
# tables (Supplemental Table 1 = ISO method, Table 2 = less robust methods)
# for each built-in food, so every GI value is picked from the source text
# itself. The PDFs (contributions/references/1-s2.0-...supplemental_files)
# were converted with `pdftotext -layout` to gi-2021-st1.txt / -st2.txt.
# Output: gi-candidates.txt — every line matching a food's patterns, with
# the lines around it (an entry's description often wraps; its number can
# sit on its own line).
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
# Generated files and the GI sources stay local (gitignored): parsed tables come
# from the 2021 GI paper's supplements, so only the scripts are versioned.
WORK = os.path.join(ROOT, "contributions", "2026-10-verified-db")
REF = os.path.join(ROOT, "contributions", "references")
TABLES = {"ST1": "gi-2021-st1.txt", "ST2": "gi-2021-st2.txt"}

# B ID -> regexes (case-insensitive) that a candidate line must match
FOODS = {
    "B0001/B0058 buckwheat": [r"\bbuckwheat\b(?!.*(bread|noodle|pancake|honey|flour|cake|biscuit))"],
    "B0002/B0059 white rice": [r"\brice\b.*\b(white|boiled|cooked)\b", r"^\s*\d*\s*rice,? (white|boiled|long|medium|short|jasmine|basmati)"],
    "B0003/B0060 brown rice": [r"\bbrown rice\b|\brice, brown\b"],
    "B0004/B0061 oats porridge": [r"porridge.*(oat|rolled)|(oat|rolled oats).*porridge|\boatmeal\b"],
    "B0005/B0062 millet": [r"\bmillet\b"],
    "B0006/B0063 pearl barley": [r"\bbarley\b.*\bpearl|\bpearl(ed)? barley\b"],
    "B0007/B0064 semolina": [r"\bsemolina\b(?!.*pasta|.*spaghetti)", r"\bfarina\b"],
    "B0008/B0065 cornmeal": [r"\bpolenta\b|\bcornmeal\b|\bcorn grits\b|\bmaize porridge\b|\bmamaliga\b"],
    "B0009/B0066 pasta": [r"^\s*\d*\s*(spaghetti|pasta|macaroni)\b.*(white|durum|boiled|cooked)"],
    "B0010 rye bread": [r"\brye\b.*bread|bread.*\brye\b"],
    "B0011 white bread": [r"white (wheat )?bread|bread, white"],
    "B0012 kefir": [r"\bkefir\b"],
    "B0013 milk": [r"^\s*\d*\s*milk,? (full|whole|semi|reduced|skim|low|2%|1\.5|cow)"],
    "B0014 yogurt": [r"\byog(h)?urt\b.*\b(plain|natural|unsweetened)\b"],
    "B0015 cottage cheese / curd": [r"cottage cheese|\bcurd\b|quark|tvorog"],
    "B0025/B0067 kidney beans": [r"kidney bean"],
    "B0026/B0068 lentils": [r"\blentils?\b"],
    "B0027/B0069 chickpeas": [r"chick ?peas?|garbanzo"],
    "B0028 green peas": [r"green peas|\bpeas, green|\bpeas,? (frozen|boiled)"],
    "B0030/B0031 carrot": [r"\bcarrots?\b"],
    "B0032 beetroot": [r"\bbeet(root)?s?\b"],
    "B0033 potato boiled": [r"potato.*boiled|boiled.*potato"],
    "B0041 pumpkin": [r"\bpumpkin\b"],
    "B0046 sweet corn": [r"sweet ?corn|corn, sweet|\bcorn on the cob\b"],
    "B0047 apple": [r"^\s*\d*\s*apples?,? (raw|fresh|golden|red|green|granny|fuji|NS)"],
    "B0048 pear": [r"^\s*\d*\s*pears?,? (raw|fresh|NS|packham|william|conference)"],
    "B0049 banana": [r"^\s*\d*\s*banana"],
    "B0050 orange": [r"^\s*\d*\s*oranges?,? (raw|fresh|navel|NS|valencia)"],
    "B0051 strawberries": [r"strawberr(y|ies),? (raw|fresh)"],
    "B0052 plum": [r"^\s*\d*\s*plums?\b"],
    "B0053 grapes": [r"^\s*\d*\s*grapes?\b"],
    "B0054/B0055 nuts": [r"\bwalnuts?\b|\balmonds?\b"],
}


def main():
    out = []
    for food, patterns in FOODS.items():
        out.append("#" * 100 + f"\n### {food}")
        for table, name in TABLES.items():
            lines = open(os.path.join(REF, name), encoding="utf-8", errors="replace").read().splitlines()
            hits = [i for i, l in enumerate(lines) if any(re.search(p, l, re.I) for p in patterns)]
            out.append(f"--- {table}: {len(hits)} lines")
            shown = set()
            for i in hits:
                if i in shown:
                    continue
                block = range(max(0, i - 1), min(len(lines), i + 3))
                shown.update(block)
                out.append("\n".join(f"{table}:{j + 1}: {lines[j].rstrip()[:200]}" for j in block if lines[j].strip()))
    open(os.path.join(WORK, "gi-candidates.txt"), "w", encoding="utf-8").write("\n".join(out))
    print("written", sum(1 for l in out if l.startswith("---")), "sections")


if __name__ == "__main__":
    main()
