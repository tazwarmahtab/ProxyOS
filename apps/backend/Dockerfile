FROM node:18-bullseye-slim

WORKDIR /app

ENV NODE_ENV=production

# Install Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

ENV TS_AUTH_KEY=${TS_AUTH_KEY:-}
ENV TS_HOSTNAME=proxyos-backend

COPY package.json ./

RUN npm install --only=production

COPY . .

EXPOSE 7860

CMD ["node", "server.js"]
