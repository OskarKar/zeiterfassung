FROM node:24-alpine

WORKDIR /app

# Copy package files and install dependencies (no native modules needed)
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy frontend (static files)
COPY client/ ./client/

# Create data directory
RUN mkdir -p /data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# --experimental-sqlite enables the built-in node:sqlite module
CMD ["node", "--experimental-sqlite", "server/index.js"]
