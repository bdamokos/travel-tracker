# Multi-stage build for production
ARG BUN_IMAGE=oven/bun:1.3.14-alpine
FROM ${BUN_IMAGE} AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Disable telemetry for dependency installation
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies based on the preferred package manager
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
# Next.js 16.3 builds crash under Bun on Alpine; use Node for the build CLI.
RUN apk add --no-cache nodejs
WORKDIR /app

# Disable telemetry for build stage
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application with telemetry disabled
RUN bun run build

# Production image - optimized Alpine
FROM ${BUN_IMAGE} AS runner
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

# Clear temporary files without hitting external package indexes
RUN rm -rf /tmp/*

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"] 
