import { describe, expect, it } from "vitest";
import { introStory } from "../src/data/introStory";
import { STORY_EFFECT_DURATIONS, createStoryAudio } from "../src/ui/storySound";

describe("opening story", () => {
  it("contains three two-panel episodes with first-person captions", () => {
    expect(introStory).toHaveLength(3);
    expect(introStory.map((episode) => episode.textureKey)).toEqual([
      "intro-story-1",
      "intro-story-2",
      "intro-story-3",
    ]);
    expect(introStory.every((episode) => episode.title.length > 0 && episode.caption.length > 0)).toBe(true);
    expect(introStory.map((episode) => episode.caption).join(" ")).not.toContain("쿼카는");
  });

  it("keeps every episode effect within three seconds", () => {
    expect(STORY_EFFECT_DURATIONS).toHaveLength(3);
    expect(STORY_EFFECT_DURATIONS.every((duration) => duration > 0 && duration <= 3)).toBe(true);
  });

  it("returns a safe no-op audio controller without a browser context", () => {
    const controller = createStoryAudio(0);
    expect(() => {
      controller.resume();
      controller.setEpisode(2);
      controller.stop();
    }).not.toThrow();
  });
});
