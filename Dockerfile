# ============================================================================
# (r) EMI / Place - Production Dockerfile
# Multi-stage build for optimal image size
# ============================================================================

# Stage 1: Build client-side bundle
FROM node:20-alpine AS client-builder

WORKDIR /app

# Copy client build files
COPY package*.json ./
COPY scripts/ ./scripts/
COPY client/ ./client/
COPY script.js index.html ./

# Install build dependencies (skip postinstall since server/ not copied)
# Then build client bundle
RUN npm ci --include=dev --ignore-scripts && \
    npm run build && \
    rm -rf node_modules

# Stage 2: Build server dependencies
FROM node:20-alpine AS server-builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY server/package*.json ./server/

# Install production dependencies only
WORKDIR /app/server
RUN npm ci --only=production

# Stage 3: Production image
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache libstdc++

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy application code FIRST (before node_modules to avoid overwrite)
COPY server/ ./server/
COPY client/ ./client/
COPY style.css ./

# Copy built node_modules from server-builder (AFTER server/ copy to overlay)
COPY --from=server-builder /app/server/node_modules ./server/node_modules

# Copy built client bundle from client-builder
COPY --from=client-builder /app/dist ./dist/
COPY --from=client-builder /app/index.html ./

# Create data directory with correct permissions
RUN mkdir -p /app/server/data && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start server
WORKDIR /app/server
CMD ["node", "index.js"]
