// The developer import (release 2.3.1, spec → "The developer import"): a
// hidden screen, opened only with `?import` in the web app's address. It
// reads a file we built (importFile.ts), shows what will happen — database
// items that become hers, new rows, rows she already has («Залишити її запис»
// / «Замінити значеннями з файлу»), recipes — then saves a copy of the sheet
// and writes. Not a feature: users never see it.
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import { uk } from "../i18n/uk";
import { verifiedEntry } from "../data/builtInFoods";
import { makeBackupCopy } from "../lib/backups";
import { BACKUP_NAME_PREFIX } from "../lib/backupTag";
import { listDishes, type Dish } from "../lib/dishes";
import { planImport, runImport, validateImportFile, type ImportFile, type ImportPlan, type ImportResult } from "../lib/importFile";
import { writeImportNotice } from "../lib/importNotice";
import { listIngredients, type Ingredient } from "../lib/ingredients";
import { fetchTabsLive, listSheetTitles } from "../lib/sheets";
import { syncNow } from "../lib/sync";
import SignInPanel from "./SignInPanel";

const t = uk.importTool;

function stamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ImportScreen() {
  const { signedIn, localMode } = useAuth();
  const { hasSpreadsheet, spreadsheetName, reloadScreens } = useSheetHealth();
  const [file, setFile] = useState<ImportFile | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ ingredients: Ingredient[]; dishes: Dish[] } | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn || localMode) {
    return (
      <section className="screen">
        <h1>{t.title}</h1>
        <p>{t.signIn}</p>
        <SignInPanel buttonLabel={uk.settings.account.signInButton} offerLocalMode={false} />
      </section>
    );
  }
  if (!hasSpreadsheet) {
    return (
      <section className="screen">
        <h1>{t.title}</h1>
        <p>{t.noSheet}</p>
      </section>
    );
  }

  const open = async (picked: File | undefined) => {
    setError(null);
    setResult(null);
    setPlan(null);
    if (!picked) return;
    try {
      const parsed = JSON.parse(await picked.text()) as unknown;
      const found = validateImportFile(parsed);
      setProblems(found);
      if (found.length > 0) return;
      const importFile = parsed as ImportFile;
      const [ingredients, dishes] = await Promise.all([listIngredients(), listDishes()]);
      setFile(importFile);
      setCurrent({ ingredients, dishes });
      setPlan(planImport(importFile, ingredients, dishes));
      setReplace(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const run = async () => {
    if (!file || !plan || !current) return;
    setBusy(true);
    setError(null);
    try {
      // A copy of the whole sheet first, the same safeguard as the 2.1 merge.
      await makeBackupCopy("import", `${BACKUP_NAME_PREFIX} ${stamp()} (перед імпортом)`, await fetchTabsLive(await listSheetTitles()));
      const done = await runImport(file, plan, replace, current.ingredients, current.dishes);
      await syncNow();
      await writeImportNotice(file.notice);
      setResult(done);
      reloadScreens();
    } catch (err) {
      setError(t.failed(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string, toReplace: boolean) =>
    setReplace((prev) => {
      const next = new Set(prev);
      if (toReplace) next.add(key);
      else next.delete(key);
      return next;
    });
  const writes = plan ? plan.databaseCopies.length + plan.newItems.length + plan.newRecipes.length + replace.size : 0;

  return (
    <section className="screen">
      <h1>{t.title}</h1>
      <p className="food-form-notice">{t.sheet(spreadsheetName ?? "…")}</p>
      <p className="food-form-hint">{t.intro}</p>
      <label>
        {t.pickFile}
        <input type="file" accept=".json,application/json" onChange={(e) => void open(e.target.files?.[0])} disabled={busy} />
      </label>
      {problems.length > 0 && (
        <div className="food-form-error">
          <p>{t.invalid}</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="food-form-error">{error}</p>}

      {plan && file && !result && (
        <div className="food-form">
          <h2>{file.title}</h2>
          <details>
            <summary>{t.copies(plan.databaseCopies.length)}</summary>
            <ul>
              {plan.databaseCopies.map((id) => (
                <li key={id}>{verifiedEntry(id)?.nameUk ?? id}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary>{t.newItems(plan.newItems.length)}</summary>
            <ul>
              {plan.newItems.map((item) => (
                <li key={item.key}>
                  <strong>{item.nameUk}</strong> — {Math.round(item.values.caloriesKcal)} ккал
                  {item.recipeNeeded && ` · ${uk.foods.needsRecipe.mark}`}
                  {item.origin && <span className="food-name-en"> ({item.origin})</span>}
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>{t.recipes(plan.newRecipes.length)}</summary>
            <ul>
              {plan.newRecipes.map((recipe) => (
                <li key={recipe.key}>
                  <strong>{recipe.nameUk}</strong> — {recipe.lines.length} {t.lines}
                </li>
              ))}
            </ul>
          </details>
          {plan.duplicates.length > 0 && (
            <>
              <h3>{t.duplicates(plan.duplicates.length)}</h3>
              <ul className="food-list">
                {plan.duplicates.map((dup) => (
                  <li key={dup.key}>
                    <p>
                      <strong>{dup.nameUk}</strong> <span className="food-name-en">({t.hers(dup.existing.nameUk)})</span>
                    </p>
                    <div className="choices">
                      <button type="button" className={replace.has(dup.key) ? "button-secondary" : ""} aria-pressed={!replace.has(dup.key)} onClick={() => toggle(dup.key, false)}>
                        {t.keepHers}
                      </button>
                      <button type="button" className={replace.has(dup.key) ? "" : "button-secondary"} aria-pressed={replace.has(dup.key)} onClick={() => toggle(dup.key, true)}>
                        {t.replace}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="food-form-hint">{t.duplicatesHint}</p>
            </>
          )}
          <p className="food-form-hint">{t.backupHint}</p>
          <div className="food-form-actions">
            <button type="button" onClick={() => void run()} disabled={busy || writes === 0}>
              {busy ? t.working : t.run(writes, spreadsheetName ?? "")}
            </button>
          </div>
        </div>
      )}

      {result && <p className="food-form-notice">{t.done(result.copies, result.added, result.recipes, result.replaced)}</p>}
    </section>
  );
}
