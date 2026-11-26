# Build the PWA
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime: only the server and the built assets
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
# Keep EXPOSE in sync with the server's default port (see PORT in server/index.js).
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
