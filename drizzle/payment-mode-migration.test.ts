import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("payment mode migration", () => {
  it("migra requires_payment al modelo payment_mode sin dejar pagos activos sin MP", () => {
    const sql = readFileSync("drizzle/0015_bent_lady_vermin.sql", "utf8");

    expect(sql).toContain(`CREATE TYPE "public"."payment_mode" AS ENUM('none', 'partial', 'full')`);
    expect(sql).toContain(`WHEN "requires_payment" = false THEN 'none'::"payment_mode"`);
    expect(sql).toContain(`THEN 'full'::"payment_mode"`);
    expect(sql).toContain(`ELSE 'none'::"payment_mode"`);
    expect(sql).toContain(`"requires_payment" = CASE`);
  });
});
