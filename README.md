# SPACE WAR 

Space War là một trò chơi chiến thuật theo lượt dành cho 2 người chơi được phát triển bằng Haskell (Backend) và HTML/CSS/JavaScript (Frontend). Người chơi điều khiển tàu vũ trụ, khám phá bản đồ, khai thác tài nguyên và vận chuyển về Trái Đất để giành chiến thắng.


## 1. Yêu cầu hệ thống & Thư viện

- **Môi trường:** Stack hoặc Cabal.
- **GHC:** Phiên bản `9.4.x` hoặc mới hơn (đã test trên GHC 9.10.3).
- **Thư viện Haskell sử dụng:**
  - `containers`: Quản lý Map/Dữ liệu.
  - `random`: Sinh số ngẫu nhiên (Seed map, tỷ lệ rơi đồ).
  - `websockets`: Giao tiếp mạng Client-Server.
  - `aeson`: Parse và sinh chuỗi JSON.
  - `hspec`, `QuickCheck`: Kiểm thử.
  - `async`, `stm`, `MVar`: Xử lý đa luồng (Concurrency).

## 2. Hướng dẫn cài đặt và chạy

Mở 2 terminal (Command Prompt / PowerShell):

**Bước 1: Khởi chạy Server (Backend)**
Tại thư mục gốc của project:

```bash
stack build
stack run