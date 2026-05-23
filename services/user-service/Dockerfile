FROM node:22.22.2-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/user-service/package.json services/user-service/package.json

RUN npm ci --omit=dev --workspace @helpdeskflow/shared --workspace @helpdeskflow/user-service --include-workspace-root=false

FROM node:22.22.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=deps /app/node_modules /app/node_modules
COPY packages/shared ./packages/shared
COPY services/user-service ./services/user-service

WORKDIR /app/services/user-service

EXPOSE 4002

CMD ["node", "src/index.js"]
