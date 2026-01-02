# Multi-stage Dockerfile for AddressKit
# Builds a production-ready image for both the API server and loader

ARG BASE_IMAGE=node:24-alpine
FROM ${BASE_IMAGE} AS base

ARG MAINTAINER
LABEL maintainer="${MAINTAINER}"

# Install dumb-init for proper signal handling and curl for healthchecks
RUN apk add --no-cache dumb-init curl

# Create gnaf data directory with proper permissions before switching to non-root user
RUN mkdir -p /home/node/gnaf && chown -R node:node /home/node/gnaf

# Use non-root user for security
ARG USER=node
USER ${USER}
WORKDIR /home/${USER}

# ─────────────────────────────────────────────────────────────────────────────
# Build stage: Install the package from tarball
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

ARG PACKAGE
ARG VERSION
ARG PACKAGE_TGZ

LABEL package="${PACKAGE}"
LABEL version="${VERSION}"

# Configure npm prefix for non-root global installs
RUN mkdir -p "/home/node/.npm" && \
    npm config set prefix "/home/node/.npm"

# Copy and install the package tarball
COPY --chown=node:node "${PACKAGE_TGZ}" "/tmp/${PACKAGE_TGZ}"
RUN npm install --prefer-offline --no-audit -g "/tmp/${PACKAGE_TGZ}"

# ─────────────────────────────────────────────────────────────────────────────
# Runtime stage: Minimal image with installed package
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS runtime

ARG PACKAGE
ARG VERSION
LABEL package="${PACKAGE}"
LABEL version="${VERSION}"

# Copy installed npm packages from builder
COPY --from=builder --chown=node:node /home/node/.npm /home/node/.npm

# Add npm bin to PATH
ENV PATH="/home/node/.npm/bin:$PATH"

# ─────────────────────────────────────────────────────────────────────────────
# Environment Configuration
# ─────────────────────────────────────────────────────────────────────────────

# OpenSearch connection settings
ENV ELASTIC_PORT="9200"
ENV ELASTIC_HOST="opensearch"
ENV ELASTIC_USERNAME=""
ENV ELASTIC_PASSWORD=""
ENV ELASTIC_PROTOCOL="http"

# Index names
ENV ES_INDEX_NAME="addresskit"

# Indexing retry configuration (production-tuned)
ENV ADDRESSKIT_INDEX_TIMEOUT="300s"
ENV ADDRESSKIT_INDEX_BACKOFF="30000"
ENV ADDRESSKIT_INDEX_BACKOFF_INCREMENT="30000"
ENV ADDRESSKIT_INDEX_BACKOFF_MAX="600000"
ENV ADDRESSKIT_INDEX_MAX_RETRIES="10"

# Server configuration
ENV PORT="8080"
ENV NODE_ENV="production"

# Caching configuration
ENV ADDRESSKIT_CACHE_ENABLED="true"
ENV ADDRESSKIT_CACHE_MAX_ENTRIES="1000"
ENV ADDRESSKIT_CACHE_TTL_MS="300000"

# G-NAF data directory (for loader persistence)
ENV GNAF_DIR="/home/node/gnaf"

# Resource management
ENV ADDRESSKIT_DYNAMIC_RESOURCES="true"
ENV ADDRESSKIT_TARGET_MEMORY_UTILIZATION="0.7"

# Ensure we use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command is to start the API server with daemon mode
CMD ["addresskit", "start", "--daemon"]
