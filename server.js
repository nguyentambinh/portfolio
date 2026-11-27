// Nguyễn Tâm Bình - 2324801030003
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import nodemailer from 'nodemailer';
import { AccountError, createAccounts, sessionMs } from './accounts.js';

const cookieName = 'portfolio_session';
const contentTypes = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
const assets = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/style.css', 'style.css'], ['/main.js', 'main.js'], ['/account.js', 'account.js'],
]);
const accountPages = new Set(['/dang-nhap', '/dang-ky', '/tai-khoan']);

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function sendFile(response, file) {
  const body = await readFile(new URL(file, import.meta.url));
  response.writeHead(200, { 'Content-Type': `${contentTypes[file.split('.').pop()]}; charset=utf-8` });
  response.end(body);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';', 1)[0] !== 'application/json') {
    throw new AccountError(415, 'Yêu cầu cần dữ liệu JSON.');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > 8192) throw new AccountError(413, 'Dữ liệu gửi vượt kích thước cho phép.');
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  } catch {
    // Yêu cầu JSON sai định dạng.
  }
  throw new AccountError(400, 'Dữ liệu gửi chưa đúng định dạng.');
}

function fromProxy(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
}

function sendCookie(request, response, token) {
  const secure = request.socket.encrypted || (fromProxy(request) && request.headers['x-forwarded-proto'] === 'https');
  response.setHeader('Set-Cookie', `${cookieName}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? sessionMs / 1000 : 0}${secure ? '; Secure' : ''}`);
}

function makeLimiter() {
  const windows = new Map();
  return (key, limit) => {
    const now = Date.now();
    const existing = windows.get(key);
    if (existing?.until > now) {
      if (existing.count >= limit) throw new AccountError(429, 'Bạn đã thử quá nhiều lần. Hãy chờ rồi thử lại.');
      existing.count += 1;
      return;
    }
    if (windows.size >= 2000) {
      for (const [id, entry] of windows) if (entry.until <= now) windows.delete(id);
      if (windows.size >= 2000) throw new AccountError(429, 'Hệ thống đang nhận nhiều yêu cầu. Hãy thử lại sau.');
    }
    windows.set(key, { count: 1, until: now + 15 * 60_000 });
  };
}

export function gmailSender(user, password) {
  if (!user || !password) return null;
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass: password },
    connectionTimeout: 12_000, greetingTimeout: 12_000, socketTimeout: 20_000,
  });
  return async (to, code) => {
    try {
      await transport.sendMail({
        from: { name: 'Portfolio Nguyễn Tâm Bình', address: user },
        to, subject: 'Mã xác nhận đăng ký portfolio',
        text: `Mã xác nhận của bạn là ${code}. Mã có hiệu lực trong 10 phút. Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.`,
      });
    } catch (error) {
      console.error('Gửi mã xác nhận thất bại.', error.code ?? 'SMTP_ERROR');
      throw error;
    }
  };
}

export async function createApp({ path, adminPassword, sendCode }) {
  const accounts = await createAccounts({ path, adminPassword, sendCode });
  const limit = makeLimiter();

  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      const token = request.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`))?.[1];
      const user = accounts.getUser(token);
      if (request.method === 'GET') {
        if (assets.has(pathname)) return await sendFile(response, assets.get(pathname));
        if (pathname === '/api/session') return sendJson(response, 200, { user });
        if (pathname === '/admin') {
          if (user?.role === 'admin') return await sendFile(response, 'admin.html');
          if (user) return sendJson(response, 403, { message: 'Trang này dành cho quản trị viên.' });
          return redirect(response, '/dang-nhap');
        }
        if (accountPages.has(pathname)) {
          if (pathname === '/tai-khoan' && !user) return redirect(response, '/dang-nhap');
          if (pathname !== '/tai-khoan' && user) return redirect(response, user.role === 'admin' ? '/admin' : '/tai-khoan');
          return await sendFile(response, 'account.html');
        }
      }
      const isAuthRequest = request.method === 'POST' && pathname.startsWith('/api/auth/');
      if (!isAuthRequest) return sendJson(response, 404, { message: 'Không tìm thấy trang.' });
      const origin = request.headers.origin;
      if (origin && !['http', 'https'].some(scheme => origin === `${scheme}://${request.headers.host}`)) {
        throw new AccountError(403, 'Nguồn gửi yêu cầu chưa hợp lệ.');
      }
      const input = await readJson(request);
      const ip = (fromProxy(request) && request.headers['x-forwarded-for']?.split(',').at(-1)?.trim()) || request.socket.remoteAddress;
      switch (pathname) {
        case '/api/auth/login': {
          limit(`login:${ip}`, 15);
          const result = await accounts.login(input);
          accounts.logout(token);
          sendCookie(request, response, result.token);
          return sendJson(response, 200, { next: result.role === 'admin' ? '/admin' : '/tai-khoan' });
        }
        case '/api/auth/register': {
          limit(`register:${ip}`, 6);
          const emailKey = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, 254) : '';
          if (emailKey) limit(`email:${emailKey}`, 4);
          await accounts.register(input);
          return sendJson(response, 202, { message: 'Đã gửi mã xác nhận qua email.' });
        }
        case '/api/auth/verify': {
          limit(`verify:${ip}`, 20);
          const verifiedToken = accounts.verify(input);
          accounts.logout(token);
          sendCookie(request, response, verifiedToken);
          return sendJson(response, 201, { next: '/tai-khoan' });
        }
        case '/api/auth/logout':
          accounts.logout(token);
          sendCookie(request, response, null);
          return sendJson(response, 200, { next: '/' });
        default:
          return sendJson(response, 404, { message: 'Không tìm thấy thao tác.' });
      }
    } catch (error) {
      if (response.destroyed) return;
      if (!(error instanceof AccountError)) console.error('Yêu cầu thất bại.', error.code ?? 'INTERNAL_ERROR');
      return sendJson(response, error.status ?? 500, { message: error instanceof AccountError ? error.message : 'Có lỗi xảy ra. Hãy thử lại.' });
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = await createApp({
    path: process.env.PORTFOLIO_DATA_FILE || './data/accounts.json',
    adminPassword: process.env.PORTFOLIO_ADMIN_PASSWORD,
    sendCode: gmailSender(process.env.GMAIL_SMTP_USER, process.env.GMAIL_SMTP_APP_PASSWORD),
  });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`Portfolio đang chạy ở cổng ${port}.`));
}
