FROM node:18-bullseye-slim

WORKDIR /app

ENV NODE_ENV=production

# Install Tailscale binary directly
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://tailscale.com/stable/tailscale_1.76.6_amd64.tgz -o tailscale.tgz && \
    tar -xzf tailscale.tgz -C /opt && \
    rm tailscale.tgz && \
    ln -sf /opt/tailscale_1.76.6_amd64/tailscaled /usr/local/bin/tailscaled && \
    ln -sf /opt/tailscale_1.76.6_amd64/tailscale /usr/local/bin/tailscale

ENV PATH="${PATH}:/usr/local/bin:/opt/tailscale_1.76.6_amd64"
ENV TS_AUTH_KEY=${TS_AUTH_KEY:-}
ENV TS_HOSTNAME=proxyos-backend

COPY package.json ./

RUN npm install --only=production

COPY . .

EXPOSE 7860

CMD ["node", "server.js"]
