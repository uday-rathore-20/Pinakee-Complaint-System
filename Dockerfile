# Stage 1: Build the React client application
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Prepare production server runtime
FROM node:20-alpine AS server-runtime
WORKDIR /app/backend

# Install production dependencies only to keep container size minimal
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend application source files
COPY backend/ ./

# Copy compiled React frontend assets from Stage 1 builder
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose server port
EXPOSE 5000

# Set production environment flags
ENV NODE_ENV=production

# Execute pre-flight check before booting Express server
CMD ["node", "server.js"]
