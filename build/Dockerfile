ARG ESPEAK_COMMIT=212928b394a96e8fd2096616bfd54e17845c48f6
ARG ESPEAK_SHA256=1f201cabc73e569a7cb434d40d3b30980f923010f8ecd4d1c4ae94691ac2888a

FROM emscripten/emsdk:5.0.7 AS espeak-native

ARG ESPEAK_COMMIT
ARG ESPEAK_SHA256
ENV DEBIAN_FRONTEND=noninteractive

ADD https://github.com/espeak-ng/espeak-ng/archive/${ESPEAK_COMMIT}.tar.gz /tmp/espeak.tar.gz
RUN echo "${ESPEAK_SHA256}  /tmp/espeak.tar.gz" | sha256sum -c - \
    && mkdir -p /src/espeak && tar -xzf /tmp/espeak.tar.gz -C /src/espeak --strip-components=1

WORKDIR /src/espeak
RUN cmake -Bbuild-native \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/espeak-install \
      -DBUILD_SHARED_LIBS=OFF \
      -DUSE_ASYNC=OFF -DUSE_MBROLA=OFF -DUSE_LIBSONIC=OFF \
      -DUSE_LIBPCAUDIO=OFF -DUSE_KLATT=OFF -DUSE_SPEECHPLAYER=OFF \
      -DEXTRA_cmn=ON -DEXTRA_ru=ON \
      -DCMAKE_C_FLAGS="-D_FILE_OFFSET_BITS=64 -I/src/espeak/src/ucd-tools/src/include" \
    && cmake --build build-native -j"$(nproc)" \
    && cmake --install build-native \
    && test -d /espeak-install/share/espeak-ng-data \
    && test -n "$(ls -A /espeak-install/share/espeak-ng-data)"

FROM emscripten/emsdk:5.0.7 AS builder

ARG ESPEAK_COMMIT
ARG ESPEAK_SHA256
ENV DEBIAN_FRONTEND=noninteractive

ADD https://github.com/espeak-ng/espeak-ng/archive/${ESPEAK_COMMIT}.tar.gz /tmp/espeak.tar.gz
RUN echo "${ESPEAK_SHA256}  /tmp/espeak.tar.gz" | sha256sum -c - \
    && mkdir -p /src/espeak && tar -xzf /tmp/espeak.tar.gz -C /src/espeak --strip-components=1

WORKDIR /src/espeak
RUN sed -i '/#include <ucd\/ucd.h>/a #include <wchar.h>' src/include/compat/wctype.h \
    && grep -q '#include <wchar.h>' src/include/compat/wctype.h

RUN emcmake cmake -Bbuild-wasm \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF \
      -DUSE_ASYNC=OFF -DUSE_MBROLA=OFF -DUSE_LIBSONIC=OFF \
      -DUSE_LIBPCAUDIO=OFF -DUSE_KLATT=OFF -DUSE_SPEECHPLAYER=OFF \
      -DEXTRA_cmn=ON -DEXTRA_ru=ON \
      -DENABLE_TESTS=OFF -DCOMPILE_INTONATIONS=OFF \
      -DCMAKE_C_FLAGS="-O2 -D_FILE_OFFSET_BITS=64 -I/src/espeak/src/ucd-tools/src/include" \
    && emmake cmake --build build-wasm --target espeak-ng ucd -j"$(nproc)"

RUN ESPEAK_A="$(find build-wasm -name 'libespeak-ng.a' | head -1)" \
    && UCD_A="$(find build-wasm -name 'libucd.a' | head -1)" \
    && test -n "$ESPEAK_A" && test -n "$UCD_A" \
    && echo "$ESPEAK_A" > /tmp/espeak_a && echo "$UCD_A" > /tmp/ucd_a

COPY --from=espeak-native /espeak-install/share/espeak-ng-data /espeak-ng-data
COPY src/espeak_wasm.c /src/wrapper/espeak_wasm.c
COPY js/post.js /src/wrapper/post.js

RUN mkdir -p /dist \
    && ESPEAK_A="$(cat /tmp/espeak_a)" && UCD_A="$(cat /tmp/ucd_a)" \
    && emcc /src/wrapper/espeak_wasm.c "$ESPEAK_A" "$UCD_A" \
      -O2 \
      -I/src/espeak/src/include \
      -o /dist/espeakng.mjs \
      --preload-file /espeak-ng-data@/espeak-ng-data \
      --post-js /src/wrapper/post.js \
      -s MODULARIZE=1 \
      -s EXPORT_ES6=1 \
      -s EXIT_RUNTIME=0 \
      -s INVOKE_RUN=0 \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s WASM_BIGINT=1 \
      -s EXPORTED_FUNCTIONS='["_piper_espeak_init","_piper_espeak_phonemize","_malloc","_free","_main"]' \
      -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","FS","UTF8ToString","stringToUTF8","lengthBytesUTF8"]' \
      -s INCOMING_MODULE_JS_API='["locateFile","print","printErr","preRun","wasmBinary","instantiateWasm"]'

RUN [ "$(head -c4 /dist/espeakng.wasm | od -An -tx1 | tr -d ' \n')" = "0061736d" ] \
    && [ "$(stat -c%s /dist/espeakng.wasm)" -gt 102400 ] \
    && [ "$(stat -c%s /dist/espeakng.data)" -gt 1048576 ]

COPY js/piper.mjs /dist/piper.mjs

FROM node:24 AS assets

ARG ORT_VERSION=1.26.0
ARG ORT_WASM_SHA256=040d52ce5066707a10d45cb9500c35e70a9c2fb33c4fb63428da9ae45b956b97
ARG ORT_JS_SHA256=aeb30d22447d16a48d2e2f94acf1b85526d9af8dd9791f921482277d78de89c6

ARG VOICE_SHA256=a5a91abb7de0f104358a25aded480ddacf1ff0762886325886ec406a2e86aab3
ARG VOICE_CONFIG_SHA256=2250a9a605b8dc35a116717fadc5056695dd809e34a15d02f72a0f52d53d3ebb

WORKDIR /build
RUN npm install onnxruntime-web@${ORT_VERSION} 2>/dev/null \
    && mkdir -p /dist \
    && cp node_modules/onnxruntime-web/dist/ort.wasm.min.mjs            /dist/ \
    && cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm /dist/ \
    && cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs  /dist/ \
    && echo "${ORT_WASM_SHA256}  /dist/ort-wasm-simd-threaded.wasm" | sha256sum -c - \
    && echo "${ORT_JS_SHA256}  /dist/ort.wasm.min.mjs" | sha256sum -c -

ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx /dist/en_US-amy-low.onnx
ADD https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx.json /dist/en_US-amy-low.onnx.json
RUN echo "${VOICE_SHA256}  /dist/en_US-amy-low.onnx" | sha256sum -c - \
    && echo "${VOICE_CONFIG_SHA256}  /dist/en_US-amy-low.onnx.json" | sha256sum -c - \
    && [ "$(stat -c%s /dist/en_US-amy-low.onnx)" -gt 1048576 ]

FROM scratch AS exportor
COPY --from=builder /dist /dist
COPY --from=assets  /dist /dist
