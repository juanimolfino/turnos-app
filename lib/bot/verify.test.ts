import { describe, expect, it } from "vitest";
import { secretMatches } from "@/lib/bot/verify";

describe("secretMatches", () => {
  it("acepta el secret correcto", () => {
    expect(secretMatches("telesecret", "telesecret")).toBe(true);
  });

  it("rechaza un secret distinto de igual longitud", () => {
    expect(secretMatches("telesecret", "telesecreX")).toBe(false);
  });

  it("rechaza un secret de longitud distinta", () => {
    expect(secretMatches("telesecret", "tele")).toBe(false);
    expect(secretMatches("telesecret", "telesecret-extra")).toBe(false);
  });

  it("rechaza header ausente o vacío", () => {
    expect(secretMatches("telesecret", null)).toBe(false);
    expect(secretMatches("telesecret", "")).toBe(false);
  });
});
