import 'dotenv/config';

const PLACEHOLDER = /^change-this/i;

/**
 * Fail fast on unsafe / missing configuration instead of booting an API that
 * signs tokens with an empty or guessable secret.
 */
export function assertEnv(env = process.env) {
  const problems = [];

  const secret = env.JWT_SECRET || '';
  if (!secret) {
    problems.push('JWT_SECRET is not set.');
  } else if (PLACEHOLDER.test(secret)) {
    problems.push('JWT_SECRET is still the placeholder value.');
  } else if (secret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters long.');
  }

  if (!env.MONGODB_URI) {
    problems.push('MONGODB_URI is not set.');
  }

  if (problems.length) {
    const help =
      'Generate a secret with:\n' +
      "  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"";
    throw new Error(`Invalid server configuration:\n - ${problems.join('\n - ')}\n\n${help}`);
  }
}

export function allowedOrigins(env = process.env) {
  return (env.CLIENT_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
