FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY workspace-ui/package*.json ./workspace-ui/
RUN npm --prefix workspace-ui ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma /app/node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/workspace-ui/out ./workspace-ui/out
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "-c", "npx prisma generate && (npx prisma migrate deploy || true) && node dist/src/main.js"]
