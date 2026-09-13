FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/
COPY scripts/ ./scripts/

ENV NODE_ENV=production
ENV HELIX_CONTAINER_MODE=true
ENV HELIX_HOST=0.0.0.0
ENV HELIX_PORT=8877
ENV HELIX_TASK_DATABASE_PATH=/data/helix.sqlite
ENV HELIX_WINDOWS_BRIDGE_URL=http://127.0.0.1:8878
ENV HELIX_WINDOWS_BRIDGE_COMMAND="node scripts/container-bridge.mjs 8878"

RUN mkdir -p /data

EXPOSE 8877

VOLUME ["/data"]

CMD ["npx", "tsx", "src/index.ts"]
