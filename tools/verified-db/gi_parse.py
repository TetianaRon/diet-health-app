# Release 1.8, step 2: parses the 2021 international GI tables into numbered
# entries. Input: `pdftotext -raw` of Supplemental Tables 1 and 2
# (contributions/references/gi-2021-st1.raw.txt, -st2.raw.txt). Raw mode
# keeps an entry's text together; an entry starts at its food number, which
# runs sequentially through both tables (ST1 1..~2100, ST2 continues).
# Output: gi-2021-entries.json — [{table, number, text, gi, sem, subjects}].
# `python gi_parse.py buckwheat "boiled"` prints entries matching all words.
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
# Generated files and the GI sources stay local (gitignored): parsed tables come
# from the 2021 GI paper's supplements, so only the scripts are versioned.
WORK = os.path.join(ROOT, "contributions", "2026-10-verified-db")
REF = os.path.join(ROOT, "contributions", "references")
START = re.compile(r"^(\d{1,4})(?:\s+(.*))?$")
GI = re.compile(r"\b(?:19|20)\d\d(?:-\s?(?:19|20)?\d\d)?\*?\s+(\d{1,3})(?:\s*�\s*(\d{1,2}(?:\.\d+)?))?\s")
SUBJECTS = re.compile(r"\b(Normal|Type 1|Type 2|Type 1 &|IGT|Mixed|Healthy|Diabetic)[^,]*,\s*(\d{1,3})")


def parse(table, path, first_number):
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    entries, current, expected = [], None, first_number
    for line in lines:
        m = START.match(line.strip())
        # Allow a small gap: a number occasionally gets lost in extraction.
        if m and expected <= int(m.group(1)) <= expected + 3:
            if current:
                entries.append(current)
            number = int(m.group(1))
            current = {"table": table, "number": number, "lines": [m.group(2) or ""]}
            expected = number + 1
        elif current:
            current["lines"].append(line.strip())
    if current:
        entries.append(current)
    for e in entries:
        text = " ".join(l for l in e.pop("lines") if l)
        e["text"] = text
        g = GI.search(text)
        e["gi"] = int(g.group(1)) if g else None
        e["sem"] = float(g.group(2)) if g and g.group(2) else None
        s = SUBJECTS.search(text)
        e["subjects"] = f"{s.group(1)}, {s.group(2)}" if s else None
    return entries, expected


def main():
    st1, nxt = parse("ST1", os.path.join(REF, "gi-2021-st1.raw.txt"), 1)
    st2, _ = parse("ST2", os.path.join(REF, "gi-2021-st2.raw.txt"), nxt)
    entries = st1 + st2
    json.dump(entries, open(os.path.join(WORK, "gi-2021-entries.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    words = [w.lower() for w in sys.argv[1:]]
    if words:
        for e in entries:
            if all(w in e["text"].lower() for w in words):
                print(f"{e['table']} #{e['number']}: GI {e['gi']}+-{e['sem']} [{e['subjects']}] {e['text'][:230]}".replace("�", "+-"))
    else:
        print(f"ST1 {len(st1)} entries (1..{st1[-1]['number']}), ST2 {len(st2)} entries; no GI parsed for", sum(1 for e in entries if e["gi"] is None))


if __name__ == "__main__":
    main()
