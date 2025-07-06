# Multi-stage build for production
FROM oven/bun:1.2.18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Disable telemetry for dependency installation
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies based on the preferred package manager
COPY package.json bun.lockb* ./
RUN --mount=type=cache,target=/root/.bun \
    bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Disable telemetry for build stage
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application with telemetry disabled
RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs

# Copy the built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create data directory for persistent storage
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "./node_modules/.bin/next", "start"] 