import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { resolveDateRange, timeOfDayOf } from "@/lib/dates";
import { slotFor } from "@/ingestion/schedule";

const iso = (d: DateTime) => d.toISO();

describe("quick date ranges (Europe/Bucharest)", () => {
  it("Sâmbătă from a Tuesday is the coming Saturday, full local day", () => {
    const r = resolveDateRange("sambata", { now: "2026-10-27T10:00:00+02:00" }); // Tuesday
    expect(iso(r.from)).toBe("2026-10-31T00:00:00.000+02:00");
    expect(iso(r.to)).toBe("2026-10-31T23:59:59.999+02:00");
  });

  it("Sâmbătă on a Saturday is today", () => {
    const r = resolveDateRange("sambata", { now: "2026-10-31T09:00:00+02:00" });
    expect(r.from.toISODate()).toBe("2026-10-31");
  });

  it("late Friday night UTC is already Saturday in Bucharest", () => {
    // 22:30 UTC Friday = 00:30 Saturday in Bucharest (EET, +02:00)
    const r = resolveDateRange("azi", { now: "2026-10-30T22:30:00Z" });
    expect(r.from.toISODate()).toBe("2026-10-31");
  });

  it("weekend across the autumn DST change (25 Oct 2026, 25-hour Sunday)", () => {
    const r = resolveDateRange("weekend", { now: "2026-10-22T12:00:00+03:00" }); // Thursday, still EEST
    expect(iso(r.from)).toBe("2026-10-24T00:00:00.000+03:00");
    expect(iso(r.to)).toBe("2026-10-25T23:59:59.999+02:00"); // ends in EET
    expect(r.to.diff(r.from, "hours").hours).toBeCloseTo(49, 0);
  });

  it("weekend across the spring DST change (29 Mar 2026, 23-hour Sunday)", () => {
    const r = resolveDateRange("weekend", { now: "2026-03-26T12:00:00+02:00" });
    expect(iso(r.from)).toBe("2026-03-28T00:00:00.000+02:00");
    expect(iso(r.to)).toBe("2026-03-29T23:59:59.999+03:00");
    expect(r.to.diff(r.from, "hours").hours).toBeCloseTo(47, 0);
  });

  it("weekend on Sunday is just today", () => {
    const r = resolveDateRange("weekend", { now: "2026-11-01T10:00:00+02:00" });
    expect(r.from.toISODate()).toBe("2026-11-01");
    expect(r.to.toISODate()).toBe("2026-11-01");
  });

  it("Duminică and Mâine", () => {
    expect(resolveDateRange("duminica", { now: "2026-10-27T10:00:00+02:00" }).from.toISODate()).toBe("2026-11-01");
    expect(resolveDateRange("maine", { now: "2026-10-31T23:30:00+02:00" }).from.toISODate()).toBe("2026-11-01");
  });

  it("custom date", () => {
    expect(resolveDateRange("data", { date: "2026-12-24" }).from.toISODate()).toBe("2026-12-24");
  });

  it("time of day is computed in local time", () => {
    expect(timeOfDayOf("2026-10-31T07:30:00Z")).toBe("morning"); // 09:30 local
    expect(timeOfDayOf("2026-10-31T15:30:00Z")).toBe("afternoon"); // 17:30 local
    expect(timeOfDayOf("2026-10-31T16:30:00Z")).toBe("evening"); // 18:30 local
  });
});

describe("ingestion slots 06:00 / 18:00 Bucharest", () => {
  it("maps both DST regimes to the same local slot", () => {
    expect(slotFor(new Date("2026-07-15T03:00:00Z"))).toBe("2026-07-15T06"); // EEST: 06:00 local
    expect(slotFor(new Date("2026-07-15T04:00:00Z"))).toBe("2026-07-15T06"); // 07:00 local → same slot (idempotent)
    expect(slotFor(new Date("2026-12-15T04:00:00Z"))).toBe("2026-12-15T06"); // EET: 06:00 local
    expect(slotFor(new Date("2026-12-15T03:00:00Z"))).toBeNull(); // 05:00 local
    expect(slotFor(new Date("2026-12-15T16:00:00Z"))).toBe("2026-12-15T18");
    expect(slotFor(new Date("2026-07-15T15:00:00Z"))).toBe("2026-07-15T18");
    expect(slotFor(new Date("2026-07-15T10:00:00Z"))).toBeNull();
  });
});
