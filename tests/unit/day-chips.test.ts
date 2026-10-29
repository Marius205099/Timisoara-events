import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The page script is plain browser JS; evaluate its calendar helpers and dayChips() on their own.
const src = fs.readFileSync(path.join(__dirname, "..", "..", "artifact", "src", "app.js"), "utf8");
const pick = (re: RegExp) => { const m = src.match(re); if (!m) throw new Error(`not found: ${re}`); return m[0]; };
const code = [
  pick(/const DAYS = \[.*?\];/),
  pick(/const toUTC = .*?;\n/),
  pick(/const fromUTC = .*?;\n/),
  pick(/const addDays = .*?;\n/),
  pick(/const weekday = .*?;/),
  pick(/const nextWeekday = .*?;\n/),
  pick(/const cap = .*?;\n/),
  pick(/\/\/ @day-chips-start[\s\S]*?\/\/ @day-chips-end/),
  "return dayChips;",
].join("\n");
const dayChips = new Function(code)() as (t: string) => [string, string, string][];
const labels = (t: string) => dayChips(t).map(([, l, d]) => `${l} ${d.slice(8)}`);

describe("quick-date chips", () => {
  it("Thursday 29 Oct 2026: Azi, Mâine (Friday), Sâmbătă, Duminică — no Friday repeat, no Weekend", () => {
    expect(labels("2026-10-29")).toEqual(["Azi 29", "Mâine 30", "Sâmbătă 31", "Duminică 01"]);
  });

  it("every weekday runs in calendar order to the first Sunday after tomorrow", () => {
    expect(labels("2026-10-26")).toEqual(["Azi 26", "Mâine 27", "Miercuri 28", "Joi 29", "Vineri 30", "Sâmbătă 31", "Duminică 01"]); // Monday
    expect(labels("2026-10-30")).toEqual(["Azi 30", "Mâine 31", "Duminică 01"]); // Friday
    expect(labels("2026-10-31")).toEqual(["Azi 31", "Mâine 01"]); // Saturday: tomorrow is Sunday
    expect(labels("2026-11-01")).toEqual(["Azi 01", "Mâine 02", "Marți 03", "Miercuri 04", "Joi 05", "Vineri 06", "Sâmbătă 07", "Duminică 08"]); // Sunday
  });

  it("never repeats a day and never contains Weekend", () => {
    for (let i = 0; i < 14; i++) {
      const t = new Date(Date.UTC(2026, 11, 20 + i)).toISOString().slice(0, 10); // across New Year
      const days = dayChips(t).map((c) => c[2]);
      expect(new Set(days).size).toBe(days.length);
      expect(days).toEqual([...days].sort());
      expect(dayChips(t).some(([, l]) => /weekend/i.test(l))).toBe(false);
    }
  });
});
