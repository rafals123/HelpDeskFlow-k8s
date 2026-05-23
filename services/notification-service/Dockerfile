FROM node:22.22.2-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/notification-service/package.json services/notification-service/package.json

RUN npm ci --omit=dev --workspace @helpdeskflow/shared --workspace @helpdeskflow/notification-service --include-workspace-root=false

FROM node:22.22.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=deps /app/node_modules /app/node_modules
COPY packages/shared ./packages/shared
COPY services/notification-service ./services/notification-service

WORKDIR /app/services/notification-service

EXPOSE 4004

CMD ["node", "src/index.js"]
