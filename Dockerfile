FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Whisper (trascrizione gratuita, gira sul server)
FROM debian:bookworm-slim AS whisper
ARG WHISPER_VERSION=v1.9.5
ARG WHISPER_MODEL=small
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git curl ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 -b ${WHISPER_VERSION} https://github.com/ggml-org/whisper.cpp /whisper \
  && cmake -S /whisper -B /whisper/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF \
  && cmake --build /whisper/build -j --target whisper-cli
RUN mkdir /models && curl -fL -o /models/ggml-${WHISPER_MODEL}.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin

FROM node:22-slim
ARG WHISPER_MODEL=small
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 \
  WHISPER_BIN=/usr/local/bin/whisper-cli WHISPER_MODEL=/models/ggml-${WHISPER_MODEL}.bin
COPY --from=whisper /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper /models /models
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
VOLUME /data
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
