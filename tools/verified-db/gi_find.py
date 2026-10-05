# Prints parsed 2021 GI entries whose text matches a regex (case-insensitive): python gi_find.py "regex" [max]
import json, os, re, sys

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "contributions", "2026-10-verified-db")
E = json.load(open(os.path.join(WORK, "gi-2021-entries.json"), encoding="utf-8"))
rx = re.compile(sys.argv[1], re.I)
n = int(sys.argv[2]) if len(sys.argv) > 2 else 40
hits = [e for e in E if rx.search(e["text"][:160])]
for e in hits[:n]:
    print(f"{e['table']}#{e['number']} GI {e['gi']}±{e['sem']} [{e['subjects']}] {e["text"][:120]}".replace("�", "±"))
print(f"({len(hits)} hits)")
