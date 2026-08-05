# Prisma 는 alpine 의 musl + openssl 궁합 문제가 잦아 Debian slim 이미지 사용.
# https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-docker

FROM node:20-bookworm-slim AS builder
WORKDIR /app
# openssl 은 Debian slim 에 기본 포함이지만 apt-get 최소 설치로 명시.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# runtime 에도 openssl + healthcheck 용 wget 필요.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates wget && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main"]
