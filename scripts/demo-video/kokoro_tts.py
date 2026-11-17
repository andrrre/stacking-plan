"""Reads the demo video's lines with Kokoro, a neural voice that runs on this machine (no account, no network).

Usage: python kokoro_tts.py <model dir> <voice> <json list of {"file", "text"}>
The model dir holds kokoro-v1.0.onnx and voices-v1.0.bin. Called by media.mjs when KOKORO_DIR is set.
"""

import json
import sys
from pathlib import Path

import soundfile
from kokoro_onnx import Kokoro


def main() -> None:
    model_dir, voice, lines = Path(sys.argv[1]), sys.argv[2], json.loads(sys.argv[3])
    kokoro = Kokoro(str(model_dir / "kokoro-v1.0.onnx"), str(model_dir / "voices-v1.0.bin"))
    for line in lines:
        samples, rate = kokoro.create(line["text"], voice=voice, speed=1.0, lang="en-us")
        soundfile.write(line["file"], samples, rate)


if __name__ == "__main__":
    main()
