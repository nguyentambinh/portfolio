// Nguyễn Tâm Bình - 2324801030003
const root = document.documentElement;
try { const saved = localStorage.getItem('giao-dien'); if (saved) root.dataset.theme = saved; } catch (e) {}
document.getElementById('che-do')?.addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('giao-dien', root.dataset.theme); } catch (e) {}
});

document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
  const group = chip.dataset.loc;
  document.querySelectorAll('.card').forEach((card) => { card.hidden = group !== 'tat-ca' && !card.dataset.nhom.split(' ').includes(group); });
}));

document.querySelectorAll('[data-dem]').forEach((el) => {
  const target = Number(el.dataset.dem);
  let n = 0;
  const step = () => { n += 1; el.textContent = n; if (n < target) setTimeout(step, 90); };
  step();
});

const year = document.getElementById('nam');
if (year) year.textContent = new Date().getFullYear();

const accountNav = document.querySelector('[data-account-nav]');
if (accountNav) {
  fetch('/api/session').then(response => response.ok ? response.json() : null).then(session => {
    if (!session?.user) return;
    const admin = session.user.role === 'admin';
    const link = document.createElement('a');
    link.className = 'btn primary small';
    link.href = admin ? '/admin' : '/tai-khoan';
    link.textContent = admin ? 'Trang quản trị' : 'Tài khoản';
    accountNav.replaceChildren(link);
  }).catch(() => {});
}
