// Nguyễn Tâm Bình - 2324801030003
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const minute = 60_000;
export const sessionMs = 8 * 60 * minute;
const codeMs = 10 * minute;

export class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sha256 = value => createHash('sha256').update(value).digest('hex');
const emailOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const digest = await derive(password, salt, 64);
  return `${salt}:${digest.toString('hex')}`;
}

async function matchesPassword(password, hash) {
  const [salt] = hash.split(':', 1);
  const calculated = await hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(calculated), Buffer.from(hash));
}

class Store {
  constructor(path) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = { otpSecret: randomBytes(32).toString('hex'), users: {}, pending: {}, sessions: {} };
      this.change(() => {});
    }
  }

  change(update) {
    const next = structuredClone(this.state);
    const result = update(next);
    const temporaryPath = `${this.path}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporaryPath, this.path);
    this.state = next;
    return result;
  }
}

export async function createAccounts({ path, adminPassword, sendCode }) {
  const store = new Store(path);
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  const adminHash = adminPassword ? await hashPassword(adminPassword) : null;
  const adminVersion = adminPassword
    ? createHmac('sha256', store.state.otpSecret).update(adminPassword).digest('hex')
    : null;
  const sending = new Set();
  const codeHash = (email, code) => createHmac('sha256', store.state.otpSecret).update(`${email}:${code}`).digest('hex');

  function makeSession(state, id) {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    for (const [key, session] of Object.entries(state.sessions)) {
      if (session.expiresAt <= now) delete state.sessions[key];
    }
    state.sessions[sha256(token)] = { id, expiresAt: now + sessionMs, version: id === 'admin' ? adminVersion : null };
    return token;
  }

  function getUser(token) {
    if (!/^[a-f0-9]{64}$/.test(token ?? '')) return null;
    const session = store.state.sessions[sha256(token)];
    if (!session || session.expiresAt <= Date.now()) return null;
    if (session.id === 'admin') {
      return adminVersion && session.version === adminVersion ? { name: 'Nguyễn Tâm Bình', role: 'admin' } : null;
    }
    const user = store.state.users[session.id];
    return user ? { name: user.name, email: session.id, role: 'user' } : null;
  }

  async function register(input) {
    const email = emailOf(input.email);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const password = input.password;
    if (!name || name.length > 80) throw new AccountError(400, 'Nhập họ tên từ 1 đến 80 ký tự.');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AccountError(400, 'Nhập địa chỉ email hợp lệ.');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw new AccountError(400, 'Mật khẩu cần từ 8 đến 128 ký tự.');
    }
    if (!sendCode) throw new AccountError(503, 'Dịch vụ gửi mã đang tạm ngừng. Hãy thử lại sau.');
    const now = Date.now();
    if (sending.has(email) || store.state.pending[email]?.sentAt > now - minute) {
      throw new AccountError(429, 'Chờ khoảng một phút trước khi gửi mã lại.');
    }
    if (store.state.users[email]) {
      throw new AccountError(409, 'Địa chỉ email này đã đăng ký. Bình có thể đăng nhập.');
    }
    sending.add(email);
    try {
      const code = String(randomInt(1_000_000)).padStart(6, '0');
      const pending = {
        name,
        passwordHash: await hashPassword(password),
        digest: codeHash(email, code),
        sentAt: now,
        expiresAt: now + codeMs,
        attempts: 5,
      };
      await sendCode(email, code);
      store.change(state => {
        for (const [key, entry] of Object.entries(state.pending)) {
          if (entry.expiresAt <= now) delete state.pending[key];
        }
        if (!state.users[email]) state.pending[email] = pending;
      });
    } catch {
      throw new AccountError(503, 'Chưa gửi được mã xác nhận. Hãy thử lại sau.');
    } finally {
      sending.delete(email);
    }
  }

  function verify(input) {
    const email = emailOf(input.email);
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (!/^\d{6}$/.test(code)) throw new AccountError(400, 'Nhập đủ 6 chữ số trong email.');
    const challenge = store.state.pending[email];
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts <= 0) {
      throw new AccountError(400, 'Mã đã hết hiệu lực. Hãy xin mã mới.');
    }
    if (!timingSafeEqual(Buffer.from(codeHash(email, code)), Buffer.from(challenge.digest))) {
      store.change(state => { state.pending[email].attempts -= 1; });
      throw new AccountError(400, 'Mã xác nhận chưa đúng.');
    }
    return store.change(state => {
      state.users[email] = { name: challenge.name, passwordHash: challenge.passwordHash };
      delete state.pending[email];
      return makeSession(state, email);
    });
  }

  async function login(input) {
    const id = emailOf(input.login);
    const password = input.password;
    const hash = id === 'admin' ? adminHash : store.state.users[id]?.passwordHash;
    if (typeof password !== 'string' || !password || password.length > 128) {
      throw new AccountError(400, 'Nhập tên đăng nhập và mật khẩu hợp lệ.');
    }
    const valid = await matchesPassword(password, hash ?? dummyHash);
    if (!hash || !valid) throw new AccountError(401, 'Tên đăng nhập hoặc mật khẩu chưa đúng.');
    return { token: store.change(state => makeSession(state, id)), role: id === 'admin' ? 'admin' : 'user' };
  }

  function logout(token) {
    if (/^[a-f0-9]{64}$/.test(token ?? '')) {
      const key = sha256(token);
      if (store.state.sessions[key]) store.change(state => { delete state.sessions[key]; });
    }
  }

  return { getUser, login, register, verify, logout };
}
