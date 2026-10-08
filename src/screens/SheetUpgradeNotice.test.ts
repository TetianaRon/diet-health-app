import { describe, expect, it } from "vitest";
import { upgradeNoticeLines } from "./SheetUpgradeNotice";

const base = { addedTabs: [], addedColumns: [], labelsFilled: 0, idsFilled: 0, idsRenumbered: 0, migrated: [], productsMerged: false, productsAbsorbed: 0 };

describe("upgradeNoticeLines", () => {
  it("lists added columns once each, says only empty cells were filled, and gives the way back", () => {
    const lines = upgradeNoticeLines({
      ...base,
      addedColumns: ["Ідентифікатор", "Копія вбудованого", "Ідентифікатор"],
      idsFilled: 3,
    });
    expect(lines).toEqual([
      "Додано стовпці: «Ідентифікатор», «Копія вбудованого».",
      "Продуктам і стравам присвоєно ідентифікатори.",
      "Заповнено лише порожні клітинки — ваші дані не змінено.",
      "Попередню версію таблиці можна відновити в Google Таблицях: Файл → Історія версій.",
    ]);
  });

  it("is honest when a repeated ID had to be replaced", () => {
    const lines = upgradeNoticeLines({ ...base, idsRenumbered: 1 });
    expect(lines).toContain("Повторювані ідентифікатори замінено новими (1).");
    expect(lines).not.toContain("Заповнено лише порожні клітинки — ваші дані не змінено.");
  });

  it("says which column was filled from which", () => {
    const lines = upgradeNoticeLines({ ...base, migrated: [{ to: "Дата", from: "Час", cells: 1 }] });
    expect(lines[0]).toBe("Стовпець «Дата» заповнено зі стовпця «Час» (старий стовпець залишився без змін).");
  });

  it("mentions new tabs", () => {
    expect(upgradeNoticeLines({ ...base, addedTabs: ["Medications"] })[0]).toBe("Додано вкладки: Medications.");
  });

  it("tells about the products merge and the saved copy, and doesn't claim only empty cells changed (2.1)", () => {
    const lines = upgradeNoticeLines({ ...base, productsMerged: true });
    expect(lines[0]).toContain("в одній вкладці «Products»");
    expect(lines).toContain("Перед зміною копію таблиці збережено в Google Drive.");
    expect(lines).not.toContain("Заповнено лише порожні клітинки — ваші дані не змінено.");
  });
});
