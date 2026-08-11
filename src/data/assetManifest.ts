export type AssetGroup = "title" | "story" | "home" | "pipes";

export type AssetDefinition =
  | { kind: "image"; key: string; url: string }
  | { kind: "spritesheet"; key: string; url: string; frameWidth: number; frameHeight: number }
  | { kind: "audio"; key: string; urls: readonly string[] };

const homeDiorama: AssetDefinition = {
  kind: "image",
  key: "home-diorama",
  url: "assets/visuals/home-diorama.webp",
};

const quokkaPoses: AssetDefinition = {
  kind: "spritesheet",
  key: "quokka-poses",
  url: "assets/visuals/quokka-poses.webp",
  frameWidth: 362,
  frameHeight: 362,
};

export const assetGroups: Readonly<Record<AssetGroup, readonly AssetDefinition[]>> = {
  title: [homeDiorama, quokkaPoses],
  story: [
    { kind: "image", key: "intro-story-1", url: "assets/story/intro-01.webp" },
    { kind: "image", key: "intro-story-2", url: "assets/story/intro-02.webp" },
    { kind: "image", key: "intro-story-3", url: "assets/story/intro-03.webp" },
    { kind: "audio", key: "intro-music-1", urls: ["assets/audio/story/story-01.ogg", "assets/audio/story/story-01.mp3"] },
    { kind: "audio", key: "intro-music-2", urls: ["assets/audio/story/story-02.ogg", "assets/audio/story/story-02.mp3"] },
    { kind: "audio", key: "intro-music-3", urls: ["assets/audio/story/story-03.ogg", "assets/audio/story/story-03.mp3"] },
  ],
  home: [
    homeDiorama,
    quokkaPoses,
    { kind: "image", key: "house-objects", url: "assets/visuals/house-objects.webp" },
    { kind: "image", key: "home-shell-base", url: "assets/visuals/home-shell-base.webp" },
    { kind: "image", key: "home-dome-back", url: "assets/visuals/home-dome-back.webp" },
    { kind: "image", key: "home-items-new", url: "assets/visuals/home-items-new.webp" },
  ],
  pipes: [
    quokkaPoses,
    { kind: "image", key: "pipe-organic", url: "assets/visuals/pipe-organic.webp" },
    { kind: "image", key: "pipe-mineral", url: "assets/visuals/pipe-mineral.webp" },
  ],
};

export const storyTextureKeys = assetGroups.story
  .filter((asset): asset is Extract<AssetDefinition, { kind: "image" }> => asset.kind === "image")
  .map((asset) => asset.key);

export const storyAudioKeys = assetGroups.story
  .filter((asset): asset is Extract<AssetDefinition, { kind: "audio" }> => asset.kind === "audio")
  .map((asset) => asset.key);
