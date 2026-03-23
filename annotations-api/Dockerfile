FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

# Create the data directory for annotation storage
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "server.js"]
