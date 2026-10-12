import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never returned unless explicitly selected (login only).
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, default: '' },
    pan: { type: String, uppercase: true, trim: true, default: '' },
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
