FROM node:18-bullseye-slim

WORKDIR /app

ENV NODE_ENV=production

# Tailscale will be started at runtime if TS_AUTH_KEY is set
# Download Tailscale at runtime instead of build time
ENV TS_AUTH_KEY=${TS_AUTH_KEY:-}
ENV TS_HOSTNAME=proxyos-backend

COPY package.json ./

RUN npm install --only=production

COPY . .

EXPOSE 7860

CMD ["node", "server.js"]
