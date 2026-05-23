FROM node:22.22.2-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/auth-service/package.json services/auth-service/package.json

RUN npm ci --omit=dev --workspace @helpdeskflow/shared --workspace @helpdeskflow/auth-service --include-workspace-root=false

FROM node:22.22.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=deps /app/node_modules /app/node_modules
COPY packages/shared ./packages/shared
COPY services/auth-service ./services/auth-service

WORKDIR /app/services/auth-service

EXPOSE 4001

CMD ["node", "src/index.js"]
