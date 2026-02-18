FROM node:18-bullseye-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./

RUN npm install --only=production

COPY . .

EXPOSE 7860

CMD ["node", "server.js"]
