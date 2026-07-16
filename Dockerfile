FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && test -f dist/main.js \
  && test -f dist/config/database.js \
  && test -f dist/app.module.js \
  && ls -la dist/config
RUN npm prune --omit=dev

FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs \
  && mkdir -p /app/uploads \
  && chown -R nestjs:nodejs /app

COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

USER nestjs

EXPOSE 5000

CMD ["node", "dist/main.js"]
