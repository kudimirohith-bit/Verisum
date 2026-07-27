FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY frontend ./frontend

RUN npm install
RUN npm run build --workspace=verisumm-frontend

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace=verisumm-frontend", "--", "--host"]
