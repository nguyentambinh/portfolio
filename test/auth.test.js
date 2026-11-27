// Nguyễn Tâm Bình - 2324801030003
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../server.js';

test('Luồng quản trị, đăng ký qua mã, quyền truy cập và đăng xuất', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'portfolio-auth-'));
  const path = join(directory, 'accounts.json');
  const mail = [];
  const server = await createApp({
    path,
    adminPassword: 'Fixture-admin-9027',
    sendCode: async (recipient, code) => { mail.push({ recipient, code }); },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(path, { force: true });
    await rm(`${path}.tmp`, { force: true });
    await rmdir(directory);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (route, cookie) => fetch(origin + route, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const post = (route, body, cookie, caller = origin) => fetch(origin + '/api/auth/' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: caller, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const cookieOf = response => response.headers.get('set-cookie').split(';', 1)[0];

  assert.match(await (await get('/')).text(), /href="\/dang-ky"/);
  assert.equal((await get('/admin')).headers.get('location'), '/dang-nhap');
  assert.equal((await get('/admin.html')).status, 404);
  assert.equal((await get('/data/accounts.json')).status, 404);
  assert.equal((await post('login', { login: 'admin', password: 'wrong' })).status, 401);
  assert.equal((await post('login', { login: 'admin', password: 'Fixture-admin-9027' }, null, 'https://example.test')).status, 403);

  const admin = await post('login', { login: 'admin', password: 'Fixture-admin-9027' });
  assert.equal(admin.status, 200);
  assert.equal((await admin.json()).next, '/admin');
  assert.match(admin.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const adminCookie = cookieOf(admin);
  const panel = await get('/admin', adminCookie);
  assert.equal(panel.status, 200);
  const description = await panel.text();
  for (const project of ['TBT Cloud', 'Đoàn – Hội', 'LLM và GNN', 'Insurance Microservices', 'Quản lý nhân sự và tài chính']) {
    assert.ok(description.includes(project));
  }

  const email = 'tenant@example.test';
  const password = 'Fixture-guest-8024';
  const registration = await post('register', { name: 'Khách thử nghiệm', email, password });
  assert.equal(registration.status, 202);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].recipient, email);
  assert.match(mail[0].code, /^\d{6}$/);
  assert.equal((await post('login', { login: email, password })).status, 401);
  const wrong = mail[0].code === '012345' ? '012346' : '012345';
  assert.equal((await post('verify', { email, code: wrong })).status, 400);

  const verified = await post('verify', { email, code: mail[0].code });
  assert.equal(verified.status, 201);
  const userCookie = cookieOf(verified);
  assert.equal((await get('/admin', userCookie)).status, 403);
  assert.equal((await get('/api/session', userCookie)).status, 200);
  assert.equal((await post('verify', { email, code: mail[0].code })).status, 400);
  assert.equal((await post('login', { login: email, password })).status, 200);
  await post('logout', {}, adminCookie);
  assert.equal((await get('/admin', adminCookie)).headers.get('location'), '/dang-nhap');
  const saved = await readFile(path, 'utf8');
  assert.ok(!saved.includes(password));
  assert.ok(!saved.includes(userCookie.split('=')[1]));
});
