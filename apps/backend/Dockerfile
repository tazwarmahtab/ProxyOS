FROM node:18-bullseye-slim

WORKDIR /app

ENV NODE_ENV=production

# Install Tailscale manually (install script doesn't work in Docker)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://tailscale.com/install.sh | bash -s -- --unattended || true

ENV PATH="${PATH}:/usr/local/bin:/root/.local/bin:/opt/tailscale"
ENV TS_AUTH_KEY=${TS_AUTH_KEY:-}
ENV TS_HOSTNAME=proxyos-backend

COPY package.json ./

RUN npm install --only=production

COPY . .

EXPOSE 7860

CMD ["node", "server.js"]
