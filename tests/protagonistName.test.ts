import { describe, expect, it } from "vitest";
import {
  nameWithParticle,
  normalizeProtagonistName,
  personalizedTitle,
} from "../src/core/protagonistName";

describe("protagonist name", () => {
  it("normalizes whitespace, controls, and length", () => {
    expect(normalizeProtagonistName("  몽이  ")).toBe("몽이");
    expect(normalizeProtagonistName("\t  \n")).toBe("");
    expect(normalizeProtagonistName("한두세네다여일여아열한두세")).toBe("한두세네다여일여아열한두");
  });

  it("selects Korean particles by final consonant", () => {
    expect(nameWithParticle("몽이", "subject")).toBe("몽이가");
    expect(nameWithParticle("복순", "subject")).toBe("복순이");
    expect(nameWithParticle("몽이", "with")).toBe("몽이와");
    expect(nameWithParticle("복순", "with")).toBe("복순과");
    expect(nameWithParticle("복순", "possessive")).toBe("복순의");
  });

  it("removes both a blank name and its particle", () => {
    expect(nameWithParticle("   ", "subject")).toBe("");
    expect(nameWithParticle("", "with")).toBe("");
    expect(personalizedTitle("", "덤불집")).toBe("덤불집");
    expect(personalizedTitle("몽이", "덤불집")).toBe("몽이의 덤불집");
  });
});
