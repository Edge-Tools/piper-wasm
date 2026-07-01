piper-wasm — Corresponding Source mirror
==================================================

This repository publishes the Corresponding Source for the WebAssembly
build of piper (license: MPL-2.0) used in edgetools.io.

Contents
  build/      our build recipe: Dockerfile + helper scripts/config/patches.
              Rebuild with:  docker build build/
  upstream/   the exact upstream source archive(s) the build fetched,
              byte-identical and sha256-verified (see below).

Upstream sources:
  espeak.tar.gz
    https://github.com/espeak-ng/espeak-ng/archive/212928b394a96e8fd2096616bfd54e17845c48f6.tar.gz
    sha256 1f201cabc73e569a7cb434d40d3b30980f923010f8ecd4d1c4ae94691ac2888a
  en_US-amy-low.onnx
    https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx
    sha256 a5a91abb7de0f104358a25aded480ddacf1ff0762886325886ec406a2e86aab3
  en_US-amy-low.onnx.json
    https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx.json
    sha256 2250a9a605b8dc35a116717fadc5056695dd809e34a15d02f72a0f52d53d3ebb
