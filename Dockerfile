FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install the monorepo workspaces so @fig/shared resolves exactly as in CI.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY mobile/package.json ./mobile/package.json
RUN npm ci

# Build the Fastify API (the shared workspace is bundled by tsup).
COPY shared ./shared
COPY server ./server
RUN npm run build -w server

# Cloud Run injects PORT. Bind to 0.0.0.0 inside the container.
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start", "-w", "server"]
