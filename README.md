# Portfolio · Nguyễn Tâm Bình

Portfolio cá nhân dùng HTML, CSS, JavaScript và máy chủ Node.js. Trang chủ giới thiệu dự án công khai. Trang quản trị ghi lại công việc của Bình trong các dự án.

- Có giao diện sáng và tối (theo hệ thống, đổi được bằng nút ◐).
- Lọc dự án theo nhóm: đám mây, web, học máy, di động.
- Khách đăng ký bằng email, xác nhận mã Gmail 6 chữ số trong 10 phút rồi đăng nhập bằng email. Tên đăng nhập quản trị là `admin`.
- Máy chủ cấp phiên qua cookie HttpOnly. Tài khoản, mã chờ xác nhận và phiên được lưu trong `data/accounts.json` hoặc `PORTFOLIO_DATA_FILE`.

## Chạy và kiểm thử

Dùng Node.js 20 trở lên. Cấu hình biến môi trường `PORTFOLIO_ADMIN_PASSWORD`, `GMAIL_SMTP_USER` và `GMAIL_SMTP_APP_PASSWORD` ở nơi chạy ứng dụng. `PORT` mặc định là 3000. Trên TBT Cloud, nginx chuyển truy cập tới tiến trình Node.js lắng nghe ở `127.0.0.1:3000`.

```bash
npm ci
npm test
npm start
```

Mở `http://localhost:3000` khi chạy trên máy của mình. Khi triển khai bằng Web từ Git, chọn kho `https://github.com/nguyentambinh/portfolio`, nhánh `main`, rồi cấp các biến môi trường trên máy ảo. Dữ liệu tài khoản và thông tin Gmail nằm trong cấu hình riêng của máy chạy.

Nginx chuyển nguyên địa chỉ truy cập, gồm cả cổng, bằng `proxy_set_header Host $http_host;`. Với mẫu Web từ Git cũ bỏ mất cổng, đặt `PORTFOLIO_PUBLIC_ORIGIN` bằng đúng địa chỉ dịch vụ mà TBT Cloud cấp, gồm giao thức và cổng. Ví dụ `http://103.77.208.60:23001`.
