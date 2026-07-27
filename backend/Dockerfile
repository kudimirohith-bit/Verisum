FROM node:20-alpine

WORKDIR /app

# Copy root workspace files
COPY package*.json ./
COPY libs/common ./libs/common
COPY backend ./backend

# Install dependencies and build
RUN npm install
RUN npm run build --workspace=@verisumm/common
RUN npm run build --workspace=verisumm-backend

EXPOSE 5000

CMD ["npm", "start", "--workspace=verisumm-backend"]
