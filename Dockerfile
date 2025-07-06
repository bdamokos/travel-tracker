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

# Production image - optimized Alpine
FROM oven/bun:1.2.18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create user and group
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs

# Copy only the standalone output (much smaller than node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Create data directory for persistent storage
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Remove unnecessary packages to reduce image size
RUN apk del --no-cache \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"] 