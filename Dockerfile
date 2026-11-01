# Application images are built only by Linux CI (linux/amd64).
FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/jearton/wallet-balance" \
      org.opencontainers.image.description="Local multi-chain wallet balance tracker" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/home/node/wallet-data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
    && mkdir -p /home/node/wallet-data && chown node:node /home/node/wallet-data
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
USER node
EXPOSE 4173
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
