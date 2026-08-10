import { describe, expect, it } from "vitest";
import { homeFeelingText } from "../src/ui/homeCopy";

describe("home feeling copy", () => {
  it.each([
    [0, "아직 소박하지만, 이 보금자리가 기대돼요"],
    [4, "아직 소박하지만, 이 보금자리가 기대돼요"],
    [5, "포근해진 덤불집에 마음이 놓여요"],
    [20, "포근해진 덤불집에 마음이 놓여요"],
    [21, "좋아하는 것들이 늘어 마음이 든든해요"],
    [47, "좋아하는 것들이 늘어 마음이 든든해요"],
    [48, "따뜻한 추억이 가득해 마음도 풍족해요"],
  ])("uses the expected copy at happiness %i", (happiness, expected) => {
    expect(homeFeelingText(happiness)).toBe(expected);
  });
});
