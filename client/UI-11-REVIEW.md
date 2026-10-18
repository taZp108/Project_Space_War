# UI-11 Review — mock UI trước khi tích hợp thật

Ngày rà soát: 2026-10-18

Phạm vi: rà source và hợp đồng UI mock trước giai đoạn tích hợp. Không thay đổi luật game, Haskell hoặc kết nối mạng.

## Kết quả checklist

| Hạng mục | Kết quả | Ghi chú |
| --- | --- | --- |
| Title → How to Play/Settings → Lobby → Game → Result | Có luồng và fixture trong source; chưa chạy trực tiếp | Lobby có tạo/join, chờ người chơi và chuyển sang trận; result có Victory/Defeat/Draw/Unverified. |
| Action mock success/error | Có các nhánh trong `mock-actions.js`; chưa bấm thử | Gồm Move, Observe, ScanArea, ScanNearest, ScanOpponent, Mine, Deposit, Recharge, End Turn và các lỗi AP/battery/target/range/cargo/storage. |
| Fog of war | Source giữ planet chưa khám phá ngoài PlayerView; Observe/ScanArea mới thêm planet được tìm thấy | Chưa kiểm tra trực quan các ô unknown và sector overview. |
| Pending | Có trạng thái pending và khóa command khi chờ response | Chưa kiểm tra bằng trình duyệt. |
| Confirmation cancel/confirm | Deposit, Recharge, End Turn mở confirmation; cancel giữ lựa chọn; confirm gửi action | Chưa kiểm tra thao tác bàn phím/chuột trực tiếp. |
| LINK LOST | Có demo ở lobby và trong trận; kết quả không xác minh vẫn hiển thị unknown | Chưa chạy trực tiếp các đường retry và check result. |
| Reduced motion, sound, font size | Có cài đặt và lưu local | Chưa kiểm tra hiệu ứng và hiển thị khi thay đổi tùy chọn. |
| Responsive | CSS có breakpoint/reflow; UI-9 đã ghi cần xem ở nhiều viewport | Chưa nghiệm thu 1440×900, 1920×1080 và cửa sổ hẹp. |
| UI không tự đổi luật | Action mock chỉ đổi view khi trả success; kết quả cuối lấy từ result fixture/adapter; hết AP không tự kết thúc lượt | Đây là kiểm tra source, không xác thực luật server/Haskell. |
| Vấn đề còn mở | Ghi bên dưới | Cần giải quyết trước khi tuyên bố UI mock đã nghiệm thu hoàn toàn. |

## Vấn đề còn mở

1. Chưa có phiên chạy trình duyệt trong môi trường hiện tại để thao tác và chụp xác nhận các luồng, responsive, focus và reduced motion. Cần mở `client/index.html` hoặc serve thư mục `client/` rồi hoàn tất checklist UI-11 và các viewport UI-9.
2. Hợp đồng server/Haskell vẫn cần đối chiếu trước tích hợp: shape PlayerView và MatchResult, quy ước error/notification/event, semantics của `resourceValue`, và cách gửi tham số Recharge. `ADAPTER-CONTRACT.md` là hợp đồng phía UI đã chốt, chưa phải giao thức server.
3. Các luật và dữ liệu trong `mock-actions.js` chỉ là fixture. Chúng chưa chứng minh server áp dụng cùng chi phí, giới hạn, hoặc timing kết thúc trận.

## Kiểm tra đã thực hiện

- Đọc checklist UI-11 cùng `app.js`, `game-adapter.js`, `mock-actions.js`, `mock-data.js`, `mock-lobby.js` và tài liệu client.
- `git diff --check`: không báo lỗi whitespace; có cảnh báo line-ending từ Git.
- Không chạy UI trong trình duyệt và không chạy kiểm tra cú pháp JavaScript vì môi trường hiện không cung cấp runtime/trình duyệt khả dụng.

## Trạng thái phase

UI-11 đã được rà source và ghi nhận kết quả. Chưa thể đánh dấu nghiệm thu hoàn tất cho đến khi checklist tương tác và viewport được xem trực tiếp. Chưa bắt đầu UI-12 hoặc tích hợp WebSocket.
