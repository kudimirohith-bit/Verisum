import mongoose from 'mongoose';

export async function connectDB(uri: string): Promise<void> {
  mongoose.connection.on('connected', () =>
    console.log('[MongoDB] Connection established'),
  );
  mongoose.connection.on('error', (err) =>
    console.error('[MongoDB] Connection error:', err),
  );
  mongoose.connection.on('disconnected', () =>
    console.warn('[MongoDB] Disconnected'),
  );

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log('[MongoDB] Disconnected cleanly');
}
