FROM node:22-alpine

WORKDIR /app

# The project has no runtime npm dependencies, but copying package files first
# keeps this layer stable if dependencies are added later.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; fi

COPY . .

RUN mkdir -p /app/.private \
 && chown -R node:node /app

ENV NODE_ENV=production \
    PORT=4173 \
    NOCTURNE_HOST=0.0.0.0

USER node
EXPOSE 4173

CMD ["npm", "start"]
