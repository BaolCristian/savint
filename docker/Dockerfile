# syntax=docker/dockerfile:1
# Build context: la RADICE del repo  →  docker build -f docker/Dockerfile .

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Variabili fittizie: prisma generate e next build non devono raggiungere un DB reale
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    NEXTAUTH_SECRET=build-only-secret \
    AUTH_TRUST_HOST=true \
    NEXT_PUBLIC_DEMO_MODE=true
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Client Prisma generato nello stage di build (stessa base Debian → binari compatibili)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/.next ./.next
COPY public ./public
COPY src ./src
COPY prisma ./prisma
COPY next.config.ts tsconfig.json prisma.config.ts components.json postcss.config.mjs ./
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
