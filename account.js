// Nguyễn Tâm Bình - 2324801030003
async function post(action, data) {
  const response = await fetch(`/api/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message);
  return result;
}

function onSubmit(form, pending, submit) {
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[data-status]');
    const label = button.textContent;
    const fields = Object.fromEntries(new FormData(form));
    button.disabled = true;
    button.textContent = pending;
    status.textContent = '';
    try {
      await submit(fields);
    } catch (error) {
      status.textContent = error instanceof TypeError ? 'Không kết nối được. Hãy thử lại.' : error.message;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}

const route = location.pathname;
const page = { '/dang-nhap': 'login', '/dang-ky': 'register', '/tai-khoan': 'profile' }[route];
if (page) document.getElementById(page).hidden = false;

onSubmit(document.getElementById('login-form'), 'Đang đăng nhập…', async data => {
  location.assign((await post('login', data)).next);
});

if (page === 'register') {
  const register = document.getElementById('register-form');
  const verify = document.getElementById('verify-form');
  const verifyEmail = document.getElementById('verify-email');
  let email = '';
  onSubmit(register, 'Đang gửi mã…', async data => {
    await post('register', data);
    email = data.email.trim().toLowerCase();
    verifyEmail.textContent = email;
    register.hidden = true;
    verify.hidden = false;
    verify.elements.code.focus();
  });
  onSubmit(verify, 'Đang xác nhận…', async data => {
    location.assign((await post('verify', { email, code: data.code })).next);
  });
  document.getElementById('edit-email').addEventListener('click', () => {
    verify.reset();
    verify.querySelector('[data-status]').textContent = '';
    verify.hidden = true;
    register.hidden = false;
    register.elements.email.focus();
  });
}

if (page === 'profile') {
  fetch('/api/session').then(response => response.json()).then(({ user }) => {
    if (!user) return location.replace('/dang-nhap');
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email ?? 'Tài khoản quản trị';
  }).catch(() => {
    document.querySelector('#profile [data-status]').textContent = 'Không tải được thông tin tài khoản. Hãy tải lại trang.';
  });
}

document.querySelectorAll('[data-logout]').forEach(form => {
  onSubmit(form, 'Đang đăng xuất…', async () => location.assign((await post('logout', {})).next));
});
