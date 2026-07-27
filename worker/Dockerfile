FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY libs/common ./libs/common
COPY worker ./worker

RUN npm install
RUN npm run build --workspace=@verisumm/common
RUN npm run build --workspace=verisumm-worker

CMD ["npm", "start", "--workspace=verisumm-worker"]
