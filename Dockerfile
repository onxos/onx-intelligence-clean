FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx vite build && npx esbuild api/boot.ts api/scheduler-worker.ts --platform=node --bundle --format=esm --outdir=dist --tsconfig=tsconfig.server.json --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"

FROM node:20-alpine
WORKDIR /app
# Without NODE_ENV=production boot.ts never calls serve() and the container
# exits immediately; PORT=10000 matches EXPOSE/HEALTHCHECK and render.yaml.
ENV NODE_ENV=production
ENV PORT=10000
COPY package*.json ./
COPY --from=builder /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:10000/api/trpc/health.ping || exit 1
EXPOSE 10000
CMD ["node", "dist/boot.js"]
