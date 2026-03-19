# Use Node.js LTS version
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
# Copy Prisma schema so `prisma generate` can run during npm install
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install dependencies — skip lifecycle scripts (no git repo in Docker context)
# then explicitly generate Prisma client
RUN npm ci --only=production --ignore-scripts && \
    npx prisma generate

# Copy remaining application files
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
