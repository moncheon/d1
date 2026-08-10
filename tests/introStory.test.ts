import { describe, expect, it } from "vitest";
import { introStory, STORY_MUSIC_DURATION_SECONDS } from "../src/data/introStory";

describe("opening story", () => {
  it("contains three two-panel episodes with first-person captions", () => {
    expect(introStory).toHaveLength(3);
    expect(introStory.map((episode) => episode.textureKey)).toEqual([
      "intro-story-1",
      "intro-story-2",
      "intro-story-3",
    ]);
    expect(introStory.map((episode) => episode.musicKey)).toEqual([
      "intro-music-1",
      "intro-music-2",
      "intro-music-3",
    ]);
    expect(introStory.every((episode) => episode.title.length > 0 && episode.caption.length > 0)).toBe(true);
    expect(introStory.map((episode) => episode.caption).join(" ")).not.toContain("쿼카는");
  });

  it("uses three unique pre-rendered music loops of the documented duration", () => {
    expect(new Set(introStory.map((episode) => episode.musicKey)).size).toBe(3);
    expect(STORY_MUSIC_DURATION_SECONDS).toBe(18);
  });
});
