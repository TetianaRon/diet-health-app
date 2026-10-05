# Release 1.8: the 2021 table's own summary rows ("Boiled potato, mean of 29
# studies 73"). In the raw text a summary row follows the N entries it
# summarises, so each row is linked to the last N entries parsed before it.
# Output: gi-2021-summaries.json — {label: {value, n, entries[], table}}.
# The builder uses it for the authors' mean and for the upper quartile of
# exactly the entries the row covers.
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
# Generated files and the GI sources stay local (gitignored): parsed tables come
# from the 2021 GI paper's supplements, so only the scripts are versioned.
WORK = os.path.join(ROOT, "contributions", "2026-10-verified-db")
REF = os.path.join(ROOT, "contributions", "references")
WORDS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
ROW = re.compile(r"^(?P<label>.+?, mean of (?P<n>\w+) (?:studies|foods|types of \w+|items))\s+(?P<value>\d{1,3})\s*$")
START = re.compile(r"^(\d{1,4})(?:\s|$)")


def main():
    out = {}
    first = 1
    for table, name in (("ST1", "gi-2021-st1.raw.txt"), ("ST2", "gi-2021-st2.raw.txt")):
        seen, expected = [], first
        for line in open(os.path.join(REF, name), encoding="utf-8", errors="replace").read().splitlines():
            line = line.strip()
            m = START.match(line)
            if m and expected <= int(m.group(1)) <= expected + 3:
                seen.append(int(m.group(1)))
                expected = int(m.group(1)) + 1
            r = ROW.match(line)
            if r:
                n = int(r.group("n")) if r.group("n").isdigit() else WORDS.get(r.group("n").lower())
                if n:
                    out[r.group("label")] = {"table": table, "value": int(r.group("value")), "n": n, "entries": seen[-n:]}
        first = expected
    json.dump(out, open(os.path.join(WORK, "gi-2021-summaries.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(out), "summary rows")


if __name__ == "__main__":
    main()
