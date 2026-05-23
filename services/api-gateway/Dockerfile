FROM node:22.22.2-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY services/api-gateway/package.json services/api-gateway/package.json

RUN npm ci --omit=dev --workspace @helpdeskflow/api-gateway --include-workspace-root=false

FROM node:22.22.2-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=deps /app/node_modules /app/node_modules
COPY services/api-gateway ./services/api-gateway

WORKDIR /app/services/api-gateway

EXPOSE 8080

CMD ["node", "src/index.js"]
