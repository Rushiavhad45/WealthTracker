import mongoose from 'mongoose';
import '../models/index.js';

export async function connectDb(uri = process.env.MONGODB_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  // Make sure unique indexes (users.email, snapshots, job lock) exist before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
