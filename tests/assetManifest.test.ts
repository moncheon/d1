import { describe, expect, it } from "vitest";
import { assetGroups, storyAudioKeys, storyTextureKeys } from "../src/data/assetManifest";

describe("asset manifest", () => {
  it("keeps every group internally unique", () => {
    for (const assets of Object.values(assetGroups)) {
      const keys = assets.map((asset) => asset.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("keeps the first title load limited to its backdrop and actor", () => {
    expect(assetGroups.title.map((asset) => asset.key)).toEqual(["home-diorama", "quokka-poses"]);
  });

  it("uses WebP for the large visual groups", () => {
    for (const group of [assetGroups.title, assetGroups.home, assetGroups.workshop, assetGroups.pipes]) {
      for (const asset of group) {
        if (asset.kind === "audio") continue;
        expect(asset.url).toMatch(/\.webp$/);
      }
    }
  });

  it("tracks all disposable story textures and audio", () => {
    expect(storyTextureKeys).toEqual(["intro-story-1", "intro-story-2", "intro-story-3"]);
    expect(storyAudioKeys).toEqual(["intro-music-1", "intro-music-2", "intro-music-3"]);
  });

  it("contains only local relative asset URLs", () => {
    for (const assets of Object.values(assetGroups)) {
      for (const asset of assets) {
        const urls = asset.kind === "audio" ? asset.urls : [asset.url];
        for (const url of urls) {
          expect(url).toMatch(/^assets\//);
          expect(url).not.toMatch(/^https?:/);
        }
      }
    }
  });
});
