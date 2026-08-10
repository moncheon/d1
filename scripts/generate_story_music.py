"""Render the three deterministic opening-story music loops.

Only Python's standard library and the system ffmpeg are required. The script
creates temporary PCM WAV files, encodes browser-ready Ogg/MP3 assets, and then
removes the temporary sources.
"""

from __future__ import annotations

import argparse
from array import array
import math
from pathlib import Path
import random
import shutil
import struct
import subprocess
import tempfile
import wave


SAMPLE_RATE = 48_000
DURATION = 18.0
FRAMES = int(SAMPLE_RATE * DURATION)
TAU = math.tau


def midi(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


class Track:
    def __init__(self, seed: int) -> None:
        self.left = array("f", [0.0]) * FRAMES
        self.right = array("f", [0.0]) * FRAMES
        self.random = random.Random(seed)

    def add_tone(
        self,
        start: float,
        duration: float,
        note: int,
        amplitude: float,
        voice: str,
        pan: float = 0.0,
    ) -> None:
        first = max(0, int(start * SAMPLE_RATE))
        count = min(int(duration * SAMPLE_RATE), FRAMES - first)
        if count <= 0:
            return
        frequency = midi(note)
        left_gain = math.sqrt((1.0 - pan) * 0.5)
        right_gain = math.sqrt((1.0 + pan) * 0.5)
        attack = 0.012 if voice in {"pluck", "kalimba", "wood"} else 0.32
        release = min(0.7, duration * 0.35)

        for offset in range(count):
            time = offset / SAMPLE_RATE
            phase = TAU * frequency * time
            if voice == "pad":
                sample = math.sin(phase) + 0.24 * math.sin(phase * 2.002) + 0.08 * math.sin(phase * 3.0)
                sample *= 0.72 + 0.06 * math.sin(TAU * 0.22 * time)
            elif voice == "kalimba":
                sample = math.sin(phase) + 0.38 * math.sin(phase * 2.01) + 0.16 * math.sin(phase * 3.98)
                sample *= math.exp(-4.4 * time / max(0.12, duration))
            elif voice == "wood":
                sample = math.sin(phase) + 0.32 * math.sin(phase * 1.51) + 0.12 * math.sin(phase * 2.77)
                sample *= math.exp(-6.2 * time / max(0.1, duration))
            else:
                sample = math.sin(phase) + 0.28 * math.sin(phase * 2.0) + 0.1 * math.sin(phase * 3.0)
                sample *= math.exp(-3.2 * time / max(0.12, duration))

            envelope = min(1.0, time / attack)
            remaining = duration - time
            if remaining < release:
                envelope *= max(0.0, remaining / release)
            value = sample * amplitude * envelope
            index = first + offset
            self.left[index] += value * left_gain
            self.right[index] += value * right_gain

    def add_chord(self, start: float, duration: float, notes: tuple[int, ...], amplitude: float) -> None:
        spread = (-0.34, -0.12, 0.12, 0.34)
        for index, note in enumerate(notes):
            self.add_tone(start, duration, note, amplitude, "pad", spread[index % len(spread)])

    def add_periodic_air(self, amplitude: float, color: float) -> None:
        phases = [self.random.uniform(0, TAU) for _ in range(7)]
        cycles = [23, 37, 61, 89, 131, 173, 223]
        for index in range(FRAMES):
            position = index / FRAMES
            airy = 0.0
            for phase, cycle in zip(phases, cycles, strict=True):
                airy += math.sin(TAU * cycle * position + phase)
            airy /= len(cycles)
            slow = 0.74 + 0.22 * math.sin(TAU * 2 * position + color)
            value = airy * amplitude * slow
            self.left[index] += value * (0.9 + 0.08 * math.sin(TAU * 3 * position))
            self.right[index] += value * (0.9 + 0.08 * math.cos(TAU * 3 * position))

    def add_wrapped_drops(self, count: int, amplitude: float, watery: bool = False) -> None:
        tail = int((0.15 if watery else 0.075) * SAMPLE_RATE)
        for _ in range(count):
            start = self.random.randrange(FRAMES)
            pan = self.random.uniform(-0.85, 0.85)
            left_gain = math.sqrt((1.0 - pan) * 0.5)
            right_gain = math.sqrt((1.0 + pan) * 0.5)
            base = self.random.uniform(520.0, 1_350.0) if watery else self.random.uniform(1_500.0, 4_800.0)
            strength = amplitude * self.random.uniform(0.45, 1.0)
            phase = self.random.uniform(0, TAU)
            for offset in range(tail):
                time = offset / SAMPLE_RATE
                envelope = math.exp((-22.0 if watery else -48.0) * time)
                noise = self.random.uniform(-1.0, 1.0)
                ring = math.sin(TAU * base * time + phase)
                sample = strength * envelope * (0.7 * ring + 0.3 * noise)
                index = (start + offset) % FRAMES
                self.left[index] += sample * left_gain
                self.right[index] += sample * right_gain

    def add_leaf_rustle(self, count: int, amplitude: float) -> None:
        for _ in range(count):
            start = self.random.randrange(FRAMES)
            length = int(self.random.uniform(0.18, 0.42) * SAMPLE_RATE)
            pan = self.random.uniform(-0.75, 0.75)
            left_gain = math.sqrt((1.0 - pan) * 0.5)
            right_gain = math.sqrt((1.0 + pan) * 0.5)
            previous = 0.0
            for offset in range(length):
                position = offset / length
                white = self.random.uniform(-1.0, 1.0)
                previous = previous * 0.72 + white * 0.28
                envelope = math.sin(math.pi * position) ** 2
                sample = previous * envelope * amplitude
                index = (start + offset) % FRAMES
                self.left[index] += sample * left_gain
                self.right[index] += sample * right_gain

    def normalize(self, target_rms_db: float = -20.0, peak_limit: float = 0.84) -> tuple[float, float]:
        energy = 0.0
        peak = 0.0
        for left, right in zip(self.left, self.right, strict=True):
            energy += left * left + right * right
            peak = max(peak, abs(left), abs(right))
        rms = math.sqrt(energy / (FRAMES * 2))
        target = 10.0 ** (target_rms_db / 20.0)
        scale = min(target / max(rms, 1e-9), peak_limit / max(peak, 1e-9))
        for index in range(FRAMES):
            self.left[index] *= scale
            self.right[index] *= scale
        return rms * scale, peak * scale

    def write_wav(self, path: Path) -> tuple[float, float]:
        rms, peak = self.normalize()
        with wave.open(str(path), "wb") as output:
            output.setnchannels(2)
            output.setsampwidth(2)
            output.setframerate(SAMPLE_RATE)
            chunk = bytearray()
            for left, right in zip(self.left, self.right, strict=True):
                chunk.extend(struct.pack("<hh", int(max(-1.0, min(1.0, left)) * 32767), int(max(-1.0, min(1.0, right)) * 32767)))
                if len(chunk) >= 65_536:
                    output.writeframesraw(chunk)
                    chunk.clear()
            if chunk:
                output.writeframesraw(chunk)
        return rms, peak


def render_storm() -> Track:
    track = Track(1107)
    track.add_periodic_air(0.038, 1.2)
    track.add_wrapped_drops(215, 0.034)
    chords = [(50, 57, 62, 65), (46, 53, 58, 62), (41, 48, 53, 57), (48, 55, 60, 64), (50, 57, 62, 65), (45, 52, 57, 61)]
    for bar, chord in enumerate(chords):
        track.add_chord(bar * 3.0, 2.92, chord, 0.026)
    melody = [(0.0, 69), (1.5, 65), (3.0, 62), (6.0, 65), (7.5, 64), (10.5, 62), (12.0, 57), (15.0, 61)]
    for index, (start, note) in enumerate(melody):
        track.add_tone(start, 1.18, note, 0.07, "wood", -0.28 if index % 2 == 0 else 0.24)
    track.add_tone(0, DURATION, 38, 0.018, "pad")
    return track


def render_discovery() -> Track:
    track = Track(2219)
    track.add_periodic_air(0.018, 2.4)
    track.add_wrapped_drops(72, 0.043, watery=True)
    chords = [(43, 50, 55, 59), (48, 55, 60, 64), (45, 52, 57, 60), (50, 57, 62, 66), (43, 50, 55, 59), (50, 57, 62, 66)]
    for bar, chord in enumerate(chords):
        track.add_chord(bar * 3.0, 2.9, chord, 0.021)
    pattern = [67, 71, 74, 71, 69, 72, 76, 72]
    for beat in range(24):
        note = pattern[beat % len(pattern)]
        track.add_tone(beat * 0.75, 0.58, note, 0.065, "kalimba", -0.38 + (beat % 4) * 0.25)
        if beat % 4 in {1, 3}:
            track.add_tone(beat * 0.75 + 0.34, 0.32, note + 7, 0.027, "pluck", 0.42)
    for bar, bass in enumerate([43, 48, 45, 50, 43, 50]):
        track.add_tone(bar * 3.0, 1.25, bass, 0.048, "wood", -0.12)
    return track


def render_home() -> Track:
    track = Track(3323)
    track.add_periodic_air(0.024, 0.35)
    track.add_wrapped_drops(82, 0.018)
    track.add_leaf_rustle(26, 0.032)
    chords = [(41, 48, 53, 57), (48, 55, 60, 64), (50, 57, 62, 65), (46, 53, 58, 62), (41, 48, 53, 57), (48, 53, 57, 60)]
    for bar, chord in enumerate(chords):
        track.add_chord(bar * 3.0, 2.96, chord, 0.032)
    melody = [69, 65, 67, 72, 69, 67, 65, 60, 65, 69, 72, 74, 72, 69, 67, 65]
    for index, note in enumerate(melody):
        start = 0.75 + index * 1.05
        track.add_tone(start, 0.92, note, 0.062, "kalimba", -0.3 if index % 2 == 0 else 0.28)
    for bar, bass in enumerate([41, 48, 50, 46, 41, 41]):
        track.add_tone(bar * 3.0, 2.1, bass, 0.032, "pluck", -0.18)
    return track


def encode(ffmpeg: str, wav_path: Path, destination: Path, title: str) -> None:
    codec_args = ["-c:a", "libvorbis", "-q:a", "5"] if destination.suffix == ".ogg" else ["-c:a", "libmp3lame", "-b:a", "128k"]
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(wav_path),
            "-map_metadata",
            "-1",
            "-fflags",
            "+bitexact",
            "-flags:a",
            "+bitexact",
            *codec_args,
            "-metadata",
            f"title={title}",
            "-metadata",
            "artist=Quokka Bush Home",
            "-metadata",
            "comment=Deterministic original soundtrack generated offline for d1",
            str(destination),
        ],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("public/assets/audio/story"))
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required to encode Ogg and MP3 assets")
    args.output.mkdir(parents=True, exist_ok=True)
    cues = [
        ("story-01", "비가 집을 가져간 날", render_storm),
        ("story-02", "막힌 곳에서 나온 것", render_discovery),
        ("story-03", "이번에는 내가 만든 집", render_home),
    ]
    with tempfile.TemporaryDirectory(prefix="d1-story-music-") as temporary:
        temporary_path = Path(temporary)
        for stem, title, renderer in cues:
            wav_path = temporary_path / f"{stem}.wav"
            rms, peak = renderer().write_wav(wav_path)
            for suffix in (".ogg", ".mp3"):
                encode(ffmpeg, wav_path, args.output / f"{stem}{suffix}", title)
            print(f"{stem}: {DURATION:.1f}s, rms={20 * math.log10(rms):.1f} dBFS, peak={20 * math.log10(peak):.1f} dBFS")


if __name__ == "__main__":
    main()
