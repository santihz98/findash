# syntax=docker/dockerfile:1

##### Stage 1: build — installs all deps, generates Prisma client, compiles TS #####
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

##### Stage 2: prod-deps — installs only production dependencies #####
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

##### Stage 3: runtime — minimal final image #####
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl && addgroup -S findash && adduser -S findash -G findash
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
# Overlay the generated Prisma client (query engine + generated JS) on top of
# the production-only node_modules installed above.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY prisma ./prisma

USER findash
EXPOSE 3000
CMD ["node", "dist/main.js"]
