export function homeFeelingText(happiness: number): string {
  if (happiness >= 48) return "따뜻한 추억이 가득해 마음도 풍족해요";
  if (happiness >= 21) return "좋아하는 것들이 늘어 마음이 든든해요";
  if (happiness >= 5) return "포근해진 덤불집에 마음이 놓여요";
  return "아직 소박하지만, 이 보금자리가 기대돼요";
}
