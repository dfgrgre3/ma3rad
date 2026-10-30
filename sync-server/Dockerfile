FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js validation.js peerReplication.js schema.sql ./
USER node

EXPOSE 47821
CMD ["node", "server.js"]
