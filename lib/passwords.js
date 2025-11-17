import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  if (!password || !passwordHash) {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
