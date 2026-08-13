FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
WORKDIR /app

FROM base AS development
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 4000
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm db:migrate && pnpm start:dev"]

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/package.json ./package.json
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
