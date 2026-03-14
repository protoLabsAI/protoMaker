# Automaker Dev Server - Production Build
# Runs the server in production mode for local dev-branch testing.
#
# Build from repo root:
#   docker build -f docker/dev-server/Dockerfile --target server -t automaker-dev-server .
#
# Or use docker-compose (recommended):
#   docker compose -f docker/dev-server/docker-compose.yml up -d

# =============================================================================
# BASE STAGE - Common setup
# =============================================================================
FROM node:22-slim AS base

# Install build dependencies for native modules (node-pty)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files
COPY package*.json .npmrc turbo.json ./

# Copy all libs package.json files
COPY libs/types/package*.json ./libs/types/
COPY libs/utils/package*.json ./libs/utils/
COPY libs/prompts/package*.json ./libs/prompts/
COPY libs/platform/package*.json ./libs/platform/
COPY libs/model-resolver/package*.json ./libs/model-resolver/
COPY libs/dependency-resolver/package*.json ./libs/dependency-resolver/
COPY libs/error-tracking/package*.json ./libs/error-tracking/
COPY libs/git-utils/package*.json ./libs/git-utils/
COPY libs/spec-parser/package*.json ./libs/spec-parser/
COPY libs/flows/package*.json ./libs/flows/
COPY libs/observability/package*.json ./libs/observability/
COPY libs/tools/package*.json ./libs/tools/
COPY libs/pen-parser/package*.json ./libs/pen-parser/
COPY libs/ui/package*.json ./libs/ui/

# Copy scripts (needed by npm workspace)
COPY scripts ./scripts

# =============================================================================
# BUILD STAGE - Compile TypeScript
# =============================================================================
FROM base AS builder

# Copy all workspace package.json files so npm ci can validate the full lockfile
COPY apps/server/package*.json ./apps/server/
COPY apps/ui/package.json ./apps/ui/

# Install all dependencies (--ignore-scripts skips husky/prepare hooks)
RUN npm ci --ignore-scripts && npm rebuild node-pty

# Copy all source files
COPY libs ./libs
COPY apps/server ./apps/server

# Build shared libs then the server
RUN npm run build:libs && npm run build --workspace=apps/server

# =============================================================================
# PRODUCTION STAGE - Lean runtime image
# =============================================================================
FROM node:22-slim AS server

ARG GIT_COMMIT_SHA=unknown
LABEL automaker.git.commit.sha="${GIT_COMMIT_SHA}"
LABEL org.opencontainers.image.source="https://github.com/protoLabsAI/protoMaker"
LABEL org.opencontainers.image.description="Automaker dev-branch server"

# Install runtime dependencies only (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl bash gosu ca-certificates openssh-client dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally (needed for agent execution)
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user with stable UID/GID
RUN groupadd -g 1001 automaker && \
    useradd -u 1001 -g automaker -m -d /home/automaker -s /bin/bash automaker && \
    mkdir -p /home/automaker/.claude && \
    chown -R automaker:automaker /home/automaker

WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/libs ./libs
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package*.json ./apps/server/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Create persistent data directories
RUN mkdir -p /data /projects && chown automaker:automaker /data /projects

# Configure git for mounted volumes and token auth
RUN git config --system --add safe.directory '*' && \
    git config --system url."https://github.com/".insteadOf "git@github.com:" && \
    git config --system credential.helper '!gh auth git-credential'

# Copy entrypoint (handles credential injection and user switching)
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV PORT=3008
ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV HOME=/home/automaker

EXPOSE 3008

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:3008/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
