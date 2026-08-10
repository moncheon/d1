export const MAX_PROTAGONIST_NAME_LENGTH = 12;

export type KoreanNameParticle = "subject" | "with" | "possessive";

export function normalizeProtagonistName(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, MAX_PROTAGONIST_NAME_LENGTH).join("");
}

function hasFinalConsonant(value: string): boolean {
  const last = Array.from(value).at(-1);
  if (!last) return false;
  const code = last.codePointAt(0) ?? 0;
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

export function nameWithParticle(value: unknown, particle: KoreanNameParticle): string {
  const name = normalizeProtagonistName(value);
  if (!name) return "";
  if (particle === "possessive") return `${name}의`;
  if (particle === "subject") return `${name}${hasFinalConsonant(name) ? "이" : "가"}`;
  return `${name}${hasFinalConsonant(name) ? "과" : "와"}`;
}

export function personalizedTitle(value: unknown, title: string): string {
  const owner = nameWithParticle(value, "possessive");
  return owner ? `${owner} ${title}` : title;
}
