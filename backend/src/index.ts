import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';
import { app } from './app.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verisumm';

async function startServer() {
  await connectDB(MONGO_URI);

  app.listen(PORT, () => {
    console.log(`[Backend] Express server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Backend] Failed to start server:', err);
  process.exit(1);
});
