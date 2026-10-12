import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { loginSchema, profileSchema, registerSchema } from '../validators/investment.js';

const router = Router();
const BCRYPT_COST = 12;

// Compared against when the email is unknown so login takes about the same time
// whether or not the account exists (avoids leaking which emails are registered).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password, phone, pan } = registerSchema.parse(req.body);

    if (await User.exists({ email })) {
      throw httpError(409, 'An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    // The unique index still guards the race between exists() and create().
    const user = await User.create({ name, email, passwordHash, phone, pan });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) throw httpError(401, 'Invalid email or password');

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw httpError(401, 'Account no longer exists. Please sign in again.');
    res.json({ user: publicUser(user) });
  })
);

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const updates = profileSchema.parse(req.body);
    const user = await User.findById(req.user.id);
    if (!user) throw httpError(401, 'Account no longer exists. Please sign in again.');

    if (updates.name !== undefined) user.name = updates.name;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.pan !== undefined) user.pan = updates.pan;
    await user.save();

    res.json({ user: publicUser(user) });
  })
);

export default router;
