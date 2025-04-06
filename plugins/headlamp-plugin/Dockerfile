# syntax=docker/dockerfile:1

# Stage 1: Build stage - Install dependencies
FROM --platform=${BUILDPLATFORM} node:20-alpine AS builder

WORKDIR /app

# Copy only files needed to generate CLI package.json and install dependencies
COPY package.json generate-cli-package.js cli-dependencies.js ./

# Generate CLI-specific package.json and install dependencies
RUN node generate-cli-package.js && \
    mv package.cli.json package.json && \
    npm install --package-lock-only && \
    npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force && \
    # Prune unnecessary files from node_modules
    find node_modules -type f -name "*.d.ts" -delete && \
    find node_modules -type f -name "*.map" -delete && \
    find node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "doc" -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true

# Stage 2: Final stage - Runtime only
FROM --platform=${BUILDPLATFORM} alpine:3.20.6@sha256:de4fe7064d8f98419ea6b49190df1abbf43450c1702eeb864fe9ced453c1cc5f

# Install only Node.js and inotify-tools (no npm needed)
RUN apk add --no-cache nodejs inotify-tools

WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY ./bin ./bin/
COPY ./config ./config/
COPY ./plugin-management ./plugin-management/
COPY ./watch-and-install.sh ./watch-and-install.sh
COPY ./package.json ./package.json

RUN chmod +x watch-and-install.sh

ENTRYPOINT ["./watch-and-install.sh"]