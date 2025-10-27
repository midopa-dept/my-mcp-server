FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm globally
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files and tsconfig
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN pnpm run build

# Remove dev dependencies to reduce image size
RUN pnpm prune --prod

# Expose any necessary environment variables (optional)
ENV NODE_ENV=production

# Start the MCP server
CMD ["node", "build/index.js"]

