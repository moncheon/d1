export interface IntroStoryEpisode {
  textureKey: string;
  title: string;
  caption: string;
}

export const introStory: readonly IntroStoryEpisode[] = [
  {
    textureKey: "intro-story-1",
    title: "비가 집을 가져간 날",
    caption: "막힌 물길은 숲을 덮쳤고, 내가 모아 둔 보금자리까지 가져가 버렸다.",
  },
  {
    textureKey: "intro-story-2",
    title: "막힌 곳에서 나온 것",
    caption: "물길을 막던 것을 걷어 내자, 집을 다시 지을 재료가 쏟아져 나왔다.",
  },
  {
    textureKey: "intro-story-3",
    title: "이번에는 내가 만든 집",
    caption: "주변을 돌보고 모은 재료로, 비에도 지지 않는 우리 집을 만들기로 했다.",
  },
] as const;
