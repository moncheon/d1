let context: AudioContext | undefined;

export function getAudioContext(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return undefined;
  context ??= new AudioContextClass();
  if (context.state === "suspended") void context.resume();
  return context;
}
