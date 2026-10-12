import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Sign in required' });
  }

  try {
    // Pin the algorithm so a forged token cannot pick a weaker one (e.g. "none").
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
}

export function signToken(user) {
  return jwt.sign({ id: String(user.id ?? user._id), email: user.email }, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMemberSince(date) {
  const [y, m] = new Date(date)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .split('-')
    .map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function publicUser(user) {
  return {
    id: String(user.id ?? user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    pan: user.pan || '',
    // e.g. "Sep 2026" - fixed 3-letter months so it matches on every Node/ICU version
    memberSince: user.createdAt ? formatMemberSince(user.createdAt) : '',
  };
}
