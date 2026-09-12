FROM node:24-alpine

WORKDIR /app
COPY . .

# Datenverzeichnis (Named Volume erbt Ownership beim ersten Mount)
RUN mkdir -p /data && chown -R node:node /data /app

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/secrets.db

EXPOSE 8080
USER node

# node:sqlite ist eingebaut -> keine npm-Abhaengigkeiten, kein "npm install"
CMD ["node", "--experimental-sqlite", "server.js"]
