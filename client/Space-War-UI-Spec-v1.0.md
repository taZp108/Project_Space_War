# SPACE WAR --- UI SPECIFICATION V1.0

## Bản đặc tả giao diện và lộ trình triển khai cho Codex

**Trạng thái:** Đặc tả tổng hợp từ các vòng UI 1--18 đã chốt. Vòng 19
chưa được người dùng trả lời nên không được xem là quyết định đã duyệt.\
**Mục tiêu:** Cung cấp một hợp đồng triển khai đủ rõ để Codex xây giao
diện theo từng phần, dễ review, không tự ý sửa luật game.\
**Ngôn ngữ trao đổi:** Giải thích bằng tiếng Việt; nhãn giao diện trong
trận chủ yếu bằng tiếng Anh ngắn theo phong cách terminal.\
**Ràng buộc lớn nhất:** Chưa triển khai server/WebSocket trong giai đoạn
dựng UI mock. Không sửa luật game, không tự thêm cơ chế, không làm AI,
item, nâng cấp, random event hoặc lưu/load game.

------------------------------------------------------------------------

# 0. Chỉ dẫn bắt buộc cho Codex

Hãy đọc toàn bộ tài liệu này trước khi sửa file. Triển khai theo từng
phase nhỏ được mô tả ở phần 15. Không tạo một ứng dụng khổng lồ trong
một lần.

## 0.1 Những điều tuyệt đối không được làm

1.  **Không viết hoặc sửa code Haskell trong giai đoạn UI mock**, trừ
    khi người dùng yêu cầu riêng.
2.  Không tự thay đổi luật game, giá trị AP/pin, điều kiện thắng/thua,
    giới hạn bản đồ, thông tin ẩn hoặc cấu trúc giao thức.
3.  Không thêm React, Vue, Tailwind, Bootstrap, thư viện UI hoặc bundler
    nếu chưa được người dùng chấp thuận. Giai đoạn đầu dùng HTML, CSS,
    JavaScript thuần.
4.  Không triển khai WebSocket thật trong các phase mock UI. Phải dùng
    một lớp dữ liệu giả lập tách biệt để sau này thay bằng adapter mạng.
5.  Không cập nhật trạng thái gameplay như thể hành động đã thành công
    trước khi nhận phản hồi thành công từ server.
6.  Không hiển thị dữ liệu nội bộ của server mà người chơi không được
    biết.
7.  Không làm lộ vị trí hành tinh chưa khám phá, stock từ xa hoặc tọa độ
    chính xác của đối thủ.
8.  Không tạo tiến trình giả như thanh loading tăng phần trăm nếu không
    có tiến trình thật. Màn hình khởi tạo chỉ xuất hiện ngắn, mục tiêu
    tối đa khoảng một giây nếu không có lý do kỹ thuật thực tế khác.
9.  Không tự thực hiện hành động khi người chơi chọn ô, mở trợ giúp,
    đóng hộp thoại hoặc thay đổi layout.
10. Không tuyên bố đã hủy một lệnh đã gửi. Sau khi gửi, phải chờ kết
    quả.
11. Không tự động End Turn khi hết AP.
12. Không thêm AI solo, item/nâng cấp, random event, hành tinh
    Dangerous/Unknown, lưu/load, replay hoặc nhiều phòng cùng server vào
    MVP UI.
13. Không tự quyết định những chi tiết luật còn chưa rõ. Ghi chúng vào
    `OPEN QUESTIONS` để người dùng quyết định.
14. Không tạo dữ liệu mock tùy tiện trong logic UI. Dữ liệu demo phải
    tập trung trong một module riêng, có nhãn `MOCK` và dễ thay thế.
15. Không dùng emoji làm glyph chính của bản đồ chiến thuật. Dùng ký
    hiệu hình học/terminal dễ nhận biết và có legend.
16. Không dùng màu sắc làm dấu hiệu duy nhất của trạng thái. Phải kèm
    nhãn, icon hoặc hình dạng.

## 0.2 Cách làm việc mong muốn

-   Trước khi sửa file: đọc cấu trúc project hiện tại, `package.yaml`,
    `README.md` và các file client đã tồn tại.
-   Chỉ sửa đúng các file thuộc phase đang làm.
-   Không ghi đè file hiện có nếu chưa đọc nội dung.
-   Sau mỗi phase: chạy kiểm tra phù hợp, nêu file đã tạo/sửa, chức năng
    đã làm, cách chạy và các giới hạn còn lại.
-   Nếu build/test lỗi: báo lỗi thật, không giả vờ hoàn tất.
-   Ưu tiên code đơn giản, tên biến dễ hiểu, hàm nhỏ, ít phụ thuộc.
-   Không tạo abstraction quá phức tạp cho một UI mock nhỏ.
-   Không tự chuyển sang phase tiếp theo khi phase hiện tại chưa được
    người dùng review hoặc chưa đạt tiêu chí nghiệm thu.
-   UI mock phải được thiết kế để sau này thay dữ liệu mock bằng
    `PlayerView` và `ActionReport` từ server mà không phải viết lại toàn
    bộ giao diện.

------------------------------------------------------------------------

# 1. Bối cảnh và phạm vi sản phẩm

## 1.1 Trò chơi

Space War (Đại Chiến Không Gian) là game chiến thuật theo lượt cho hai
người. Mỗi người điều khiển một tàu, khám phá các hành tinh, khai thác
tài nguyên và gửi về kho Earth để đạt điểm mục tiêu.

MVP hướng tới: - Hai người chơi PvP qua mạng. - Trình duyệt web làm
client. - Server Haskell là nguồn sự thật duy nhất. - Giao tiếp bằng
WebSocket + JSON khi tới phase tích hợp mạng. - UI hiện đại theo phong
cách Retro Space Terminal, không phải CLI thật. - Chưa có AI solo; chỉ
xem xét khi người dùng yêu cầu riêng.

## 1.2 Phạm vi UI hiện tại

Giai đoạn đầu chỉ dựng giao diện và hành vi giả lập: - Màn hình
Title/Menu. - HOW TO PLAY. - Settings. - Lobby tạo/join room bằng Room
Code. - Màn hình chờ. - Màn hình trận đấu. - Bản đồ chiến thuật và
Sector Overview. - HUD tàu. - Target/Intelligence Panel. - Command
Console. - Event Log. - Hộp xác nhận. - Toast/warning/error. - Turn
overlay. - Màn hình kết quả. - Trạng thái mất kết nối. - Điều chỉnh âm
thanh, hiệu ứng, cỡ chữ, reduced motion. - Dữ liệu mock được tạo sẵn và
hành vi UI mô phỏng được chỉ rõ là mock.

Chưa làm: - Kết nối WebSocket thật. - Logic luật gameplay phía client. -
Xác thực hành động thay server. - Lưu/khôi phục trận. - AI. - Item/nâng
cấp/random events. - Nhiều room/server instance. - Replay. - Tài khoản,
tên người chơi hoặc chat.

## 1.3 Nguyên tắc kiến trúc

Sau này:

`Browser HTML/CSS/JS <-> WebSocket + JSON <-> Haskell Server`

Server chịu trách nhiệm: - GameState chính thức. - Kiểm tra hợp lệ của
hành động. - Tính chi phí AP/battery. - Cập nhật vị trí, cargo, stock,
điểm Earth, lượt, vòng. - Sinh kết quả quét và thông tin ẩn. - Xác định
thắng/thua/hòa. - Tạo PlayerView riêng cho từng người. - Trả
ActionReport và thông báo hợp lệ cho từng client.

Client chịu trách nhiệm: - Hiển thị PlayerView. - Cho người chơi chọn
mục tiêu và gửi yêu cầu hành động. - Hiển thị pending. - Chỉ cập nhật
gameplay sau phản hồi server. - Hiển thị hiệu ứng sau khi server xác
nhận. - Không tự suy luận hoặc tiết lộ dữ liệu ẩn.

Trong giai đoạn mock, tạo giao diện adapter như thể đang nhận dữ liệu từ
một nguồn bên ngoài. Không để UI component đọc trực tiếp các mảng mock
rải rác trong file.

------------------------------------------------------------------------

# 2. Luật game mà UI phải tôn trọng

Các giá trị dưới đây theo tài liệu thiết kế hiện tại. Những con số được
mô tả là giá trị tạm trong Config vẫn phải được lấy từ cấu hình khi tích
hợp, không hard-code thành một luật riêng trong UI.

## 2.1 Bản đồ và khởi tạo

-   Bản đồ: lưới 100×100.
-   Tọa độ hợp lệ: x, y từ 0 đến 99.
-   x tăng về bên phải; y tăng xuống dưới.
-   Up là y - 1.
-   Biên cứng, không đi vòng.
-   Khoảng cách là Manhattan: `abs(dx) + abs(dy)`.
-   Earth ở (50, 50) theo cấu hình mặc định.
-   Cả hai người biết vị trí Earth.
-   Mỗi người có kho Earth riêng.
-   Tàu xuất hiện ngẫu nhiên cách Earth từ 1 đến 5 ô theo Manhattan.
-   Có 80 hành tinh: Mining 40, Energy 24, Rare 16.
-   Hành tinh không trùng vị trí nhau, không nằm trên Earth, cách Earth
    ít nhất 4 ô.
-   Hai tàu, hành tinh và Earth có thể trùng ô theo tài liệu luật hiện
    tại.
-   Player 1 đi trước.
-   Battery ban đầu 100/100, AP ban đầu 5, cargo rỗng, kho Earth rỗng.

## 2.2 Tài nguyên và điểm

  Tài nguyên        Điểm mỗi đơn vị
  --------------- -----------------
  Iron                            1
  Crystal                         3
  Energy Core                     5
  Rare Ore                       10
  Exotic Matter                  25

-   Cargo tính theo số đơn vị tài nguyên, không theo điểm.
-   Mỗi đơn vị chiếm một chỗ.
-   Sức chứa cargo: 50.
-   Kho Earth là nơi chứa tài nguyên đã gửi về.
-   Dùng tài nguyên tại Earth để Recharge làm giảm tài nguyên có trong
    kho, do đó có thể làm giảm điểm kho Earth.
-   UI không được nhầm số lượng tài nguyên với điểm giá trị.

## 2.3 Lượt

-   Một lượt kéo dài cho đến khi người chơi hết AP hoặc chọn End Turn.
-   AP tối đa mặc định 5, được hồi đầy ở đầu lượt theo luật.
-   Một vòng gồm lượt P1 rồi lượt P2.
-   Trận tối đa 100 vòng.
-   Mỗi action phải đủ AP và battery; nếu không thì bị từ chối và không
    mất gì.
-   UI không tự End Turn khi AP về 0.
-   Khi một action đang pending, không cho gửi action gameplay khác. Vẫn
    cho zoom/pan bản đồ.
-   Khi End Turn đã được gửi, khóa thao tác gameplay cho đến khi server
    xác nhận chuyển lượt.

## 2.4 Hành động

  -------------------------------------------------------------------------
  Action                            AP              Battery Điều kiện/hiệu
                                                            ứng
  --------------- -------------------- -------------------- ---------------
  Move                               1                    2 Di chuyển một ô
                                                            theo một trong
                                                            bốn hướng,
                                                            không ra ngoài
                                                            bản đồ.

  Observe                            1                    1 Quét bán kính
                                                            3; trả vị trí
                                                            và loại hành
                                                            tinh trong tầm.

  ScanArea                           2                    3 Quét bán kính
                                                            8; trả vị trí
                                                            và loại hành
                                                            tinh trong tầm.

  ScanNearest                        2                    3 Trả hướng 8
                                                            phía và khoảng
                                                            cách đến hành
                                                            tinh gần nhất
                                                            còn tài nguyên;
                                                            không lộ tọa độ
                                                            chính xác.

  ScanOpponent                       3                    3 Trả hướng 8
                                                            phía đến đối
                                                            thủ; nếu cùng ô
                                                            trả `HERE`; đối
                                                            thủ nhận thông
                                                            báo vừa bị
                                                            scan.

  Mine                               2                    1 Phải đứng trên
                                                            hành tinh, loại
                                                            tài nguyên còn
                                                            stock và cargo
                                                            còn chỗ. Lấy
                                                            min(5, stock
                                                            còn, chỗ
                                                            trống).

  Deposit                            1      0 khi đứng trên Chuyển toàn bộ
                                          Earth; 2 khi cách cargo vào kho
                                               Earth 1--5 ô Earth riêng,
                                                            không hao hụt;
                                                            sau đó kiểm tra
                                                            thắng.

  Recharge                           1                    0 Chỉ tại Earth;
                                                            trả tài nguyên
                                                            từ kho Earth.
                                                            Mỗi 1 điểm giá
                                                            trị tài nguyên
                                                            đổi thành 2
                                                            battery; phần
                                                            vượt giới hạn
                                                            battery tối đa
                                                            bị mất.

  End Turn                           0                    0 Kết thúc lượt
                                                            sớm.
  -------------------------------------------------------------------------

## 2.5 Hướng ScanNearest / ScanOpponent

-   Hướng dựa trên dx, dy từ tàu tới mục tiêu.
-   Nếu `abs(dx) >= 2 * abs(dy)`, hướng Đông/Tây.
-   Nếu `abs(dy) >= 2 * abs(dx)`, hướng Bắc/Nam.
-   Trường hợp còn lại là hướng chéo.
-   Nếu khoảng cách bằng nhau khi tìm hành tinh gần nhất, server chọn
    Planet ID nhỏ hơn.
-   UI không cần phô bày quy tắc tie-break trong HUD; có thể giải thích
    trong HOW TO PLAY nếu phù hợp.
-   `ScanNearest` chỉ được hiển thị hướng và khoảng cách, không được suy
    ra tọa độ chính xác.
-   `ScanOpponent` chỉ hiển thị hướng, hoặc `HERE` nếu cùng ô. Không
    hiển thị tọa độ đối thủ.

## 2.6 Thông tin ẩn

-   Mỗi người có danh sách hành tinh đã khám phá riêng.
-   Observe/ScanArea thêm hành tinh vào danh sách biết của người thực
    hiện; server gửi lại danh sách trong cập nhật.
-   Stock còn lại chỉ được nhìn thấy khi tàu đang đứng đúng trên hành
    tinh.
-   Không biết vị trí đối thủ ngoài kết quả ScanOpponent theo luật.
-   Sector Overview chỉ hiển thị Earth, tàu của mình và hành tinh đã
    khám phá hợp lệ.
-   Ô chưa khám phá hiển thị `UNKNOWN` và tọa độ, không tiết lộ có hành
    tinh hay không.
-   Không suy luận hành tinh đã hết stock từ một lượng stock cũ. Chỉ
    hiển thị `DEPLETED` khi có dữ liệu server xác nhận và luật cho phép.
-   Không tạo tín hiệu mơ hồ trong Overview trừ khi đó là kết quả thực
    tế do server trả về.
-   UI không bao giờ nhận hoặc lưu toàn bộ GameState cho mục đích hiển
    thị. Khi tích hợp, dùng PlayerView đúng người chơi.

## 2.7 Thắng, thua, hòa

-   Thắng ngay sau Deposit nếu điểm kho Earth của mình đạt từ 500 trở
    lên.
-   Thua ngay khi battery về 0; đối thủ thắng.
-   Sau 100 vòng, điểm kho Earth cao hơn thắng; bằng nhau thì hòa.
-   Nếu đối thủ mất kết nối giữa trận, theo luật server, người còn lại
    thắng.
-   Tuy nhiên client không được kết luận đối thủ thua chỉ vì kết nối
    local của mình rớt. Phải cố truy xuất kết quả có thẩm quyền từ
    server. Nếu không xác minh được, thông báo không thể xác minh kết
    quả.
-   Kết quả cuối trận chỉ dùng dữ liệu server cung cấp.

------------------------------------------------------------------------

# 3. Hệ thống thiết kế trực quan

## 3.1 Phong cách

**Tên phong cách:** Retro Space Terminal\
**Bảng màu:** Dual Phosphor, xanh lá + cam/amber trên nền đen xanh rất
tối.\
**Cảm giác:** bảng điều khiển tàu vũ trụ, kỹ thuật, có không khí, dễ đọc
và không lộn xộn.\
**Ngôn ngữ thị giác:** lưới chiến thuật, glyph hình học, đường viền kỹ
thuật, nhãn ngắn, mã trạng thái, glow có chọn lọc.

Terminal là ngôn ngữ trình bày, không phải yêu cầu người chơi gõ lệnh.

## 3.2 Màu gợi ý

Dùng CSS custom properties để dễ chỉnh. Đây là giá trị thiết kế khởi
đầu, không phải luật gameplay:

``` css
:root {
  --bg-0: #050907;
  --bg-1: #080f0b;
  --bg-2: #0c1711;
  --panel: #0a120d;
  --green: #71ff91;
  --green-soft: #3fbf6b;
  --amber: #ffb45e;
  --amber-soft: #c9823b;
  --text: #d2e5d7;
  --text-muted: #8ba493;
  --border: #245b38;
  --border-strong: #34764a;
  --danger: #ff6565;
  --focus: #fff0a6;
}
```

Quy tắc: - Xanh lá là màu chính cho dữ liệu hoạt động, trạng thái tốt và
điểm nhấn mặc định. - Amber/cam là màu phụ cho dữ liệu kỹ thuật, lựa
chọn phụ hoặc cảnh báo không nguy cấp. - Đỏ chỉ dùng cho lỗi nghiêm
trọng, nguy cấp hoặc trạng thái nguy hiểm thực sự. - Không tô mọi panel
bằng màu sáng. - Không dùng màu đơn độc để biểu thị thành công/lỗi/cảnh
báo. - Trạng thái luôn có text hoặc icon đi kèm.

## 3.3 Font và chữ

-   Ưu tiên monospace như IBM Plex Mono, JetBrains Mono hoặc Share Tech
    Mono.
-   Có fallback monospace hệ thống để không phụ thuộc mạng.
-   Phân cấp rõ:
    1.  Tiêu đề màn hình.
    2.  Tiêu đề panel.
    3.  Giá trị quan trọng.
    4.  Nhãn.
    5.  Nội dung phụ/log.
-   Mặc định phải dễ đọc ở 1440×900.
-   Cỡ chữ điều chỉnh trong Settings.
-   Khi tăng cỡ chữ, layout phải thích ứng; không cắt nội dung quan
    trọng chỉ để giữ nguyên chiều cao panel.
-   Không dùng glow mạnh cho toàn bộ đoạn văn; glow chỉ nhấn trạng thái
    hoặc tiêu đề nhỏ.

## 3.4 Viền, khoảng cách và mật độ

-   Viền kỹ thuật mảnh.
-   Glow dùng cho selected, focus, pending và cảnh báo quan trọng.
-   Khoảng cách vừa phải để chia nhóm thông tin.
-   Mật độ vừa, hơi giàu thông tin, nhưng không nhồi mọi chỉ số vào một
    panel.
-   Cùng palette, font, kiểu viền và cách gọi trạng thái trên Menu,
    Lobby, Game và Result.
-   Mỗi màn hình vẫn được phép có layout riêng phù hợp chức năng.

## 3.5 Nút

Mọi nút gameplay phải có trạng thái phân biệt được: - Available. -
Hover. - Keyboard focus. - Selected, nếu có. - Unavailable với lý do
ngắn nếu phù hợp. - Pending. - Error, khi có kết quả lỗi.

Không dùng nút phát sáng lớn cho mọi thứ. Không cho nút unavailable
chiếm toàn bộ không gian. Hành động liên quan nhất đến mục tiêu đang
chọn được ưu tiên ở trên; các hành động khác ở dưới. Thứ tự ưu tiên
không đồng nghĩa tự động thực hiện.

## 3.6 Glyph bản đồ

Dùng glyph kỹ thuật, không dùng emoji làm ký hiệu chính. Ví dụ có thể
dùng: - Earth: `⊕` - Tàu người chơi: `▲` - Hành tinh: glyph riêng theo
loại, chẳng hạn Mining `◆`, Energy `◇`, Rare `◈`. - Ô được chọn:
viền/crosshair. - Ô chưa khám phá: không có glyph hành tinh; chỉ
`UNKNOWN` trong thanh thông tin. - Legend nhỏ luôn nhìn thấy cạnh bản
đồ.

Glyph là đề xuất thiết kế; Codex có thể tinh chỉnh hình dạng nhưng phải
giữ phân biệt rõ, dễ đọc và không dùng màu làm dấu hiệu duy nhất.

## 3.7 Motion và âm thanh

-   Glow cân bằng, hover nhẹ.
-   Scan có sweep animation.
-   Khi di chuyển, tàu trượt một ô và để lại vệt sáng ngắn.
-   Chỉ phát animation gameplay sau xác nhận server.
-   Scan Signature: hiệu ứng quét; hành tinh mới khám phá xuất hiện ngắn
    trong hiệu ứng rồi chuyển thành glyph ổn định.
-   Reduced Motion phải giảm/tắt chuyển động trang trí nhưng vẫn giữ
    phản hồi trạng thái thiết yếu.
-   Âm thanh riêng cho một số sự kiện: chọn hành động, scan, phát hiện,
    lệnh thành công/lỗi, đổi lượt, kết thúc.
-   Có global sound toggle và volume slider.
-   Không bắt buộc âm thanh để hiểu trạng thái.

------------------------------------------------------------------------

# 4. Bố cục trận đấu: Central Tactical Console

## 4.1 Màn hình mục tiêu

Ưu tiên desktop landscape: - 1440×900. - 1920×1080.

Bố cục desktop: - Cột trái: Ship HUD. - Trung tâm: Tactical Map, là khu
vực chính, mục tiêu khoảng 50% chiều rộng. - Cột phải: Target /
Intelligence Panel. - Phía dưới: Command Console và Event Log. - Thanh
trạng thái ngắn có tọa độ ô được chọn và cell status.

Không cần cố định số pixel tuyệt đối ngay từ đầu; dùng CSS Grid/Flex và
minmax để có thể thích nghi. Tuy nhiên thứ tự và chức năng của các khu
vực phải ổn định.

## 4.2 Ship HUD bên trái

Luôn nhìn thấy các chỉ số quan trọng: - Vị trí tàu: `(x, y)`. - AP hiện
tại và thanh AP. - Battery hiện tại/max và thanh battery. - Cargo tổng
số đơn vị/max. - Cargo theo từng loại tài nguyên. - Earth Score của
người chơi và mục tiêu 500.

Quy tắc: - Giá trị và thanh cùng tồn tại, không chỉ dùng màu. - Khi gần
ngưỡng thấp, đổi trạng thái kèm text cảnh báo. - Ngưỡng "low" là thiết
lập UI có thể cấu hình, không phải luật gameplay mới; tránh tự đưa
ngưỡng vào Config game nếu chưa được duyệt. - Phần chi tiết cargo có thể
thu gọn, nhưng chỉ số tổng quan luôn hiển thị. - Không hiển thị Earth
Score của đối thủ nếu PlayerView/server không cho phép. - Không hiển thị
pin/cargo ẩn của đối thủ.

## 4.3 Tactical Map ở trung tâm

Chức năng: - Hiển thị viewport quanh tàu. - Zoom bằng con lăn chuột. -
Pan bằng kéo chuột. - Nút `RESET TO SHIP` đưa camera về tàu. - Không cần
hiển thị đủ 100×100 ô ở mức zoom chiến thuật. - Chỉ cho chọn ô đang hiển
thị trong viewport chính. Muốn chọn ô xa thì pan tới trước. - Sector
Overview hiển thị toàn bản đồ ở mức tổng quan, nhưng vẫn tuân thủ fog of
war. - Sector Overview không cho phép click chọn ô; đây chỉ là lựa chọn
UI đã chốt. - Cell click chọn ô trước; không tự Move. - Khi chọn ô: viền
chọn, hiển thị tọa độ và trạng thái ô trong thanh thông tin. - Không vẽ
đường nối từ tàu tới ô được chọn. - Nếu ô chưa khám phá: hiển thị tọa
độ + `UNKNOWN`, không tiết lộ vật thể. - Nếu mục tiêu ngoài phạm vi hành
động: vẫn hiển thị ô và `OUT OF RANGE` trong Target Panel. - Ngoài phạm
vi Move: không cung cấp Move như hành động khả dụng; giải thích lý do. -
Trong khi lệnh pending: cho zoom/pan nhưng không chọn ô mới hoặc gửi
lệnh khác. - Không cập nhật vị trí tàu trước khi server xác nhận Move. -
Sau xác nhận Move, mới chạy animation trượt và vệt sáng. - Có legend
glyph nhỏ bên cạnh bản đồ. - Sector Overview chỉ hiển thị Earth, tàu
mình và hành tinh đã khám phá hợp lệ. - Không hiển thị tín hiệu mơ hồ
nếu server không trả kết quả đó. - Không suy ra trạng thái `DEPLETED` từ
dữ liệu stock cũ.

## 4.4 Target / Intelligence Panel bên phải

Khi chưa chọn ô: - Hiển thị hướng dẫn ngắn `SELECT A CELL`. - Có thể
hiển thị trạng thái mục tiêu hiện tại là none.

Khi chọn ô: - Tọa độ. - Cell status: `UNKNOWN`, `EARTH`, `OWN SHIP`,
`KNOWN PLANET`, `EMPTY/KNOWN CELL` nếu dữ liệu hợp lệ cho phép. - Thông
tin object ID, loại, nguồn khám phá, dữ liệu đã biết. - Các mục không
biết phải hiển thị `UNKNOWN` hoặc không xuất hiện; tuyệt đối không điền
bằng dữ liệu nội bộ. - Nếu mục tiêu ngoài tầm: `OUT OF RANGE`. - Nếu một
hành động không đủ AP/battery: nêu lý do ở khu vực hành động có liên
quan. - Nếu mục tiêu là hành tinh đã biết từ xa: chỉ ID, loại, tọa độ và
nguồn khám phá nếu có; không hiện stock hiện tại. - Stock chỉ hiển thị
khi tàu đang đứng đúng trên hành tinh, theo luật. - Nếu server xác nhận
depleted và thông tin đó được phép biết, mới hiện `DEPLETED`.

## 4.5 Command Console phía dưới

-   Vị trí ổn định.
-   Các hành động hiển thị theo ngữ cảnh mục tiêu và trạng thái người
    chơi.
-   Ưu tiên hành động phù hợp nhất với mục tiêu được chọn; hành động
    khác có thể nằm trong nhóm phụ.
-   Không tự thực hiện hành động khi chọn ô.
-   Mỗi hành động hiển thị AP/battery cost.
-   Tóm tắt lựa chọn gồm action name, target và chi phí.
-   Nếu thiếu AP/battery, có thể hiển thị hành động trong khu vực
    "Unavailable" nếu nó liên quan đến mục tiêu, kèm lý do ngắn. Không
    hiển thị tất cả hành động dưới dạng nút disabled.
-   Nếu không còn AP cho action có chi phí AP, cảnh báo và để người chơi
    tự chọn End Turn.
-   Nếu battery bằng 0, thể hiện trạng thái critical; chỉ kết luận thua
    sau khi server xác nhận game end.
-   Sau action thành công: giữ nguyên mục tiêu và viewport; cập nhật
    trạng thái theo phản hồi server; để người chơi tự chọn action tiếp
    theo.
-   Khi lệnh đã gửi: chuyển thành pending và khóa thao tác gameplay
    khác. Vẫn cho zoom/pan.
-   End Turn cần xác nhận, sau đó pending và khóa gameplay đến khi
    server xác nhận chuyển lượt.
-   Deposit cần xác nhận, hiển thị số điểm dự kiến và mục tiêu 500. Điểm
    chính thức chỉ cập nhật sau phản hồi server.
-   Recharge cần xác nhận, hiển thị giá trị tài nguyên tiêu thụ và pin
    dự kiến nhận. Không tự giả định cơ chế chọn tài nguyên nếu game rule
    chưa định nghĩa đủ chi tiết.
-   Hộp xác nhận gọn bên trong Command Console, không che bản đồ.

## 4.6 Event Log

-   Nằm ở khu vực dưới, cạnh hoặc gần Command Console theo layout cuối.
-   Hiển thị các sự kiện gần nhất, có thể mở rộng để xem lịch sử.
-   Timestamp `MM:SS` tính từ đầu trận.
-   Có event code và nội dung ngắn, dễ hiểu.
-   Ví dụ định dạng: `[00:42] [ERROR] ACTION_REJECTED`.
-   Khi lỗi lệnh: hiển thị cảnh báo ngắn cạnh Command Console và ghi lỗi
    vào Event Log.
-   Event Log chỉ chứa thông tin người chơi được phép biết.
-   Không lưu tọa độ ẩn, stock ẩn hoặc state nội bộ server.
-   Log có thể ghi kết quả action, scan, discovery, deposit, recharge,
    turn change, warnings, server errors và game result nếu server gửi.
-   Tránh lặp log chỉ vì UI render lại.
-   Toast quan trọng có thể biến mất, nhưng sự kiện vẫn có thể được tra
    cứu trong log nếu nó là sự kiện được ghi nhận.

## 4.7 Opponent Status / Intelligence

Panel đối thủ riêng, không nhập nhằng với Target Panel. - Hiển thị trạng
thái kết nối. - Trạng thái lượt nếu server cung cấp. - Thông tin công
khai được server cung cấp. - Không hiện IP hoặc thông tin riêng tư của
đối thủ. - Không hiện battery/cargo/score đối thủ trừ khi luật hoặc
PlayerView chủ động cho phép. - Kết quả ScanOpponent: chỉ hướng; nếu
cùng ô thì `HERE`. - Không hiển thị tọa độ chính xác. - Khi đối thủ bị
scan, người đó nhận thông báo tương ứng do server gửi.

------------------------------------------------------------------------

# 5. Quy trình chọn và thực hiện hành động

## 5.1 Luồng chuẩn

1.  Người chơi chọn ô trong viewport chính.
2.  UI cập nhật selected cell, tọa độ, cell status và Target Panel.
3.  UI xác định danh sách action phù hợp để trình bày dựa trên dữ liệu
    PlayerView và quy tắc hiển thị.
4.  Người chơi chọn action.
5.  UI hiển thị action summary gồm tên action, target và AP/battery
    cost.
6.  Với Deposit, Recharge, End Turn: mở hộp xác nhận.
7.  Người chơi chọn Confirm hoặc Cancel.
8.  Khi gửi, UI chuyển sang Pending.
9.  Trong Pending: khóa chọn ô và action gameplay; cho phép zoom/pan.
10. Chờ phản hồi server.
11. Nếu thành công: cập nhật state từ server trước, sau đó mới chạy
    animation/feedback.
12. Nếu bị từ chối: giữ state chính thức cũ, hiển thị lỗi ngắn và ghi
    log.
13. Người chơi tiếp tục chọn action tiếp theo. Không tự động chọn action
    hay kết thúc lượt.

## 5.2 Hủy và đổi mục tiêu

-   Có `CLEAR TARGET` khi đang có target.
-   Hủy hộp xác nhận đóng hộp nhưng giữ target và action đã chọn.
-   Bấm ngoài hộp xác nhận không tự Confirm.
-   `Escape` có thể đóng trợ giúp hoặc hủy xác nhận trước khi gửi.
-   Chọn ô mới trước khi gửi lệnh cập nhật Target Panel và đánh giá lại
    action; không tự gửi.
-   Sau khi lệnh đã gửi, không cho client giả lập hủy.
-   Nếu trạng thái server thay đổi trong lúc hộp xác nhận đang mở, cập
    nhật thông tin; nếu chi phí/điều kiện thay đổi thì yêu cầu xem
    lại/xác nhận lại trước khi gửi.
-   Server vẫn là nơi kiểm tra hợp lệ cuối cùng.

## 5.3 Action summary và xác nhận

Deposit: - Hiển thị toàn bộ cargo sẽ gửi. - Hiển thị điểm dự kiến tăng
theo giá trị tài nguyên. - Hiển thị Earth Score hiện tại và target 500
nếu dữ liệu có sẵn. - Không hiển thị điểm mới như đã chính thức tăng
trước khi server xác nhận.

Recharge: - Hiển thị tài nguyên/giá trị bị tiêu thụ và pin dự kiến
nhận. - Phần vượt battery max bị mất theo luật. - Nếu cách chọn loại và
số lượng tài nguyên chưa được xác định trong giao diện hoặc API, không
tự thiết kế logic bí mật. Đưa câu hỏi đó vào `OPEN QUESTIONS`.

End Turn: - Xác nhận kết thúc lượt. - Sau Confirm, hiển thị Pending và
khóa action. - Chỉ báo lượt mới sau phản hồi server.

------------------------------------------------------------------------

# 6. Menu, Lobby, Settings, How to Play

## 6.1 Title/Menu

Chỉ có bốn mục: 1. `MULTIPLAYER` 2. `HOW TO PLAY` 3. `SETTINGS` 4.
`EXIT`

Không dùng boot sequence làm màn hình chính. Có thể có chi tiết khởi
động nhỏ để tạo không khí, nhưng không chặn menu hoặc giả vờ tải dữ
liệu.

## 6.2 Multiplayer Lobby

Luồng: 1. Người chơi vào Multiplayer. 2. Lobby có `CREATE ROOM` và
`JOIN ROOM`. 3. Create Room: server tạo phòng và trả Room Code. 4. Hiển
thị Room Code lớn, nút `COPY CODE`, trạng thái waiting. 5. Join Room:
người chơi nhập Room Code. 6. Nếu join lỗi, hiển thị thông báo người
dùng hiểu được, error code và hướng thử lại. 7. Khi hai người kết nối,
hiển thị `PLAYERS CONNECTED`, trạng thái hai người đã kết nối. 8. Tự bắt
đầu trận; không có Ready/Start button. 9. Hiện initializing ngắn, mục
tiêu tối đa khoảng một giây; không giả phần trăm tiến trình. 10. Nếu
lobby mất kết nối: `LINK LOST`, cho Retry hoặc Back to Menu.

Không có QR code. Không hiển thị IP riêng của đối thủ. Room Code là
thông tin chính để ghép phòng.

## 6.3 Room errors và Cancel/Back

-   Các lỗi cần phân biệt khi server trả được lý do: `ROOM NOT FOUND`,
    `INVALID ROOM CODE`, room full, connection error hoặc lỗi tương ứng.
-   Mỗi lỗi có nội dung ngắn, mã chi tiết và gợi ý thử lại phù hợp.
-   Không auto-retry vô hạn.
-   Nút `CANCEL`/`BACK` gửi yêu cầu rời phòng.
-   UI chỉ báo rời phòng thành công sau phản hồi server.
-   Nếu kết nối rớt trước phản hồi, không tuyên bố phòng đã được giải
    phóng.
-   Nếu người chơi Cancel đúng lúc người thứ hai join, server quyết định
    theo thứ tự sự kiện. Client không được tuyên bố cancel thành công
    nếu trận đã bắt đầu.

## 6.4 Server address

-   Server address nằm trong Settings, không nằm ở màn hình join room.
-   Có `TEST CONNECTION`.
-   Test Connection chỉ kiểm tra kết nối, không tự tạo/join room.
-   Hiển thị lỗi rõ ràng nếu test thất bại.
-   Trong trận, không cho đổi active server address; người chơi phải rời
    session trước.
-   UI mock chỉ mô phỏng Settings. Không tuyên bố test kết nối thật
    thành công nếu chưa có mạng thật.

## 6.5 How to Play

Chia thành các mục ngắn: - Objective / Victory. - Map & Coordinates. -
AP and Battery. - Move. - Observe / ScanArea. - ScanNearest. -
ScanOpponent. - Mine & Cargo. - Deposit. - Recharge. - End Turn. - Fog
of War. - Losing Conditions / Round Limit.

Mỗi mục gồm: - Hành động dùng để làm gì. - Chi phí AP/battery theo luật
hiện tại. - Điều kiện sử dụng. - Thông tin trả về. - Những thông tin
không được tiết lộ.

Có thể mở lại bất cứ lúc nào, kể cả trong trận. Mở trợ giúp không pause
trận, không đổi lượt, không tiêu tài nguyên. Nếu đối thủ hành động trong
lúc panel trợ giúp mở, khi đóng phải dùng state mới nhất server đã xác
nhận.

## 6.6 Settings

Tối thiểu: - Server address. - Test Connection. - Font size. - Sound
on/off. - Volume slider. - Reduced Motion.

Trong trận: - Có thể đổi cỡ chữ, âm thanh, volume và hiệu ứng. - Không
thể đổi active server address. - Thay đổi Settings không thay đổi trạng
thái gameplay. - Reduced Motion phải giữ feedback thiết yếu. - Cỡ chữ
thay đổi phải làm layout thích ứng.

------------------------------------------------------------------------

# 7. Thông báo, âm thanh và chuyển lượt

## 7.1 Cấp thông báo

### Informational

Ví dụ: `PLANETARY SIGNAL ACQUIRED`, action thành công, kết quả scan. -
Nhấn nhẹ. - Có thể tự biến mất. - Sự kiện quan trọng vẫn được ghi trong
log.

### Warning

Ví dụ: `BATTERY LOW`, `CARGO CAPACITY REACHED`, `OUT OF RANGE`. - Nhấn
rõ hơn. - Có text và icon/shape. - Không phát lại liên tục khi trạng
thái không đổi. - Cảnh báo trạng thái còn hiệu lực phải phản ánh trong
HUD.

### Error/Critical

Ví dụ: `ACTION REJECTED`, `LINK LOST`, trạng thái pin critical. - Có
thông báo rõ ràng. - Lỗi action xuất hiện gần Command Console và được
ghi vào Event Log. - Hộp thoại lớn chỉ dùng khi thật sự cần chặn tiếp
tục. - Không tuyên bố kết quả trận nếu chưa có dữ liệu server.

## 7.2 Toast

-   Giới hạn số toast hiển thị cùng lúc.
-   Có thể xếp hàng hoặc gộp thông báo ít quan trọng.
-   Không cho toast che bản đồ, Command Console hoặc trạng thái quan
    trọng.
-   Toast tự biến mất theo thời hạn.
-   Cảnh báo quan trọng còn xem được trong HUD/Event Log khi thích hợp.
-   Cảnh báo lặp chỉ xuất hiện lại khi trạng thái bắt đầu, đổi mức hoặc
    cần hành động mới.

## 7.3 Chuyển lượt

-   `TURN COMPLETE` cho người vừa kết thúc lượt, chỉ sau xác nhận
    server.
-   `YOUR TURN` cho người đến lượt, chỉ khi trạng thái mới và AP/battery
    đã đồng bộ.
-   Overlay tự đóng sau khoảng 2 giây.
-   Không yêu cầu người chơi bấm xác nhận overlay.
-   Không chỉ dựa vào âm thanh hoặc animation để truyền trạng thái.

## 7.4 Âm thanh

-   Có global sound toggle.
-   Có volume slider.
-   Âm thanh sự kiện là phụ trợ, không phải nguồn thông tin duy nhất.
-   Tôn trọng Settings và reduced motion/effects.
-   Không tự phát âm thanh lặp mỗi lần render.

------------------------------------------------------------------------

# 8. Kết nối, pending và kết thúc trận

## 8.1 Pending state

Khi client gửi action: - Hiển thị action đang chờ. - Không cho chọn
target mới hoặc gửi action khác. - Cho zoom/pan bản đồ. - Không cập nhật
vị trí, AP, battery, cargo, stock hoặc score như thể đã thành công. -
Nếu server trả lỗi, quay lại trạng thái có thể thao tác dựa trên state
mới nhất. - Nếu kết nối mất trong lúc pending, không giả định action
thành công hoặc thất bại.

## 8.2 LINK LOST

-   Hiển thị `LINK LOST`.
-   Cố lấy kết quả authoritative từ server nếu giao thức hỗ trợ.
-   Nếu nhận được kết quả, hiển thị kết quả đó.
-   Nếu không xác minh được, nói rõ không thể xác minh kết quả; cho về
    menu.
-   Không tự tuyên bố thắng/thua chỉ từ việc client mất kết nối.
-   Trong lobby, cho Retry hoặc Back to Menu.
-   Trong trận, không tự retry vô hạn.
-   Luật game quy định disconnect có thể làm đối thủ thắng, nhưng client
    chỉ trình bày kết quả khi server xác nhận.

## 8.3 Màn hình kết quả

Hiển thị dữ liệu server cung cấp: - `VICTORY`, `DEFEAT` hoặc `DRAW`. -
Lý do dễ hiểu. - Event code/chi tiết lý do. - Earth Score của cả hai nếu
server cung cấp. - Số vòng. - Tổng tài nguyên đã gửi về Earth nếu server
cung cấp. - `BACK TO MENU`. - `COPY MATCH SUMMARY`.

Không lưu state/replay. Copy Match Summary chỉ sao chép văn bản, không
tạo file hay lưu trận.

Kết thúc có thể có hiệu ứng terminal ngắn; reduced motion tắt/giảm hiệu
ứng nhưng vẫn hiện kết quả ngay.

## 8.4 Dữ liệu kết quả

-   Không tự tính lại kết quả từ dữ liệu client nếu server đã trả kết
    quả.
-   Không tự điền dữ liệu thiếu.
-   Nếu score hoặc thống kê không có trong message server, ẩn mục đó
    hoặc ghi `NOT PROVIDED` theo quyết định UI; không bịa.
-   Draw sau 100 vòng phải hiển thị `DRAW`, hai score nếu có và lý do.
-   Thắng do đạt target, thua do battery bằng 0 hoặc kết quả do
    disconnect đều cần reason do server xác nhận.

------------------------------------------------------------------------

# 9. Chọn ô, panel, keyboard và responsive

## 9.1 Chọn ô

-   Click ô trong viewport chính để chọn.
-   Click không tự Move.
-   Hover/click hiển thị outline và tọa độ/cell status.
-   Không vẽ line từ tàu đến ô chọn.
-   `CLEAR TARGET` xuất hiện khi có target.
-   Khi chọn target mới, cập nhật Target Panel và action list.
-   Không tự gửi action.

## 9.2 Keyboard accessibility

-   Chuột là cách chơi chính.
-   `Tab` di chuyển focus qua control có thể tương tác.
-   `Enter` kích hoạt control đang focus theo chức năng của nó.
-   `Escape` đóng trợ giúp hoặc hủy confirmation trước khi gửi.
-   Focus ring phải rõ.
-   Không gán phím tắt dễ gây hành động gameplay ngoài ý muốn.
-   Nếu người dùng đã gửi lệnh, Escape không hủy lệnh trên server.

## 9.3 Responsive --- phần đã chốt

Đã xác nhận mục tiêu chính là desktop 1440×900 và 1920×1080. Đã xác
nhận: - Cửa sổ nhỏ: thu gọn side panels, giữ bản đồ và Command Console
dùng được. - Không gian nhỏ không được làm các nút chồng lên nhau. - Cỡ
chữ thay đổi phải được layout hỗ trợ. - In-match Settings không làm thay
đổi trạng thái gameplay.

**Vòng 19 chưa được trả lời.** Vì vậy các quyết định cụ thể về
breakpoint, cách panel mở/đóng, cách xử lý cửa sổ cực hẹp và giữ trạng
thái panel giữa màn hình chưa được xem là đã duyệt. Codex nên tạo
responsive cơ bản an toàn, ghi rõ các giả định và không khóa các quyết
định đó thành hành vi khó đổi.

------------------------------------------------------------------------

# 10. Cấu trúc file client được đề xuất

Dùng cấu trúc đơn giản, có thể điều chỉnh sau khi Codex đọc project hiện
tại:

``` text
space-war/
  client/
    index.html
    style.css
    app.js
    README.md
    js/
      mock-data.js
      state.js
      render.js
      map.js
      interactions.js
      notifications.js
      settings.js
      help.js
      network-adapter.js
```

Nếu dự án cần giữ đúng yêu cầu tối giản ban đầu chỉ có `index.html`,
`style.css`, `app.js`, hãy bắt đầu với ba file đó và chỉ tách module khi
file thực sự quá lớn. Không tạo hàng loạt file rỗng chỉ để trông có vẻ
kiến trúc tốt.

### Trách nhiệm gợi ý

-   `index.html`: khung màn hình và vùng mount.
-   `style.css`: design tokens, layout, panel, buttons, responsive,
    focus.
-   `app.js`: khởi động ứng dụng, điều phối state và render.
-   `mock-data.js`: dữ liệu demo duy nhất, có nhãn MOCK.
-   `state.js`: trạng thái giao diện như screen, selected cell, selected
    action, pending, settings.
-   `render.js`: render từng màn hình/panel.
-   `map.js`: Canvas/grid, camera, zoom/pan, selection và glyph.
-   `interactions.js`: click handlers, confirmation, action selection.
-   `notifications.js`: toast, event log, warning dedupe.
-   `settings.js`: font, volume, reduced motion, server address mock.
-   `help.js`: nội dung HOW TO PLAY và contextual help.
-   `network-adapter.js`: interface giả lập cho việc gửi action và nhận
    PlayerView/ActionReport sau này; không kết nối thật trong mock
    phase.

Không cần phải tạo đủ các file này ngay lập tức. Lộ trình bên dưới quy
định thời điểm tạo.

------------------------------------------------------------------------

# 11. Mô hình trạng thái UI

Tách **game state được server xác nhận** khỏi **UI state cục bộ**.

## 11.1 Authoritative view (mock trong giai đoạn đầu)

Dạng khái niệm, không bắt buộc khớp JSON cuối cùng trước khi
Protocol/PlayerView được chốt:

``` js
{
  player: {
    position: { x: 50, y: 51 },
    ap: 5,
    battery: 100,
    batteryMax: 100,
    cargo: {},
    cargoUsed: 0,
    cargoCapacity: 50,
    earthScore: 0
  },
  earth: { x: 50, y: 50 },
  knownPlanets: [],
  turn: {
    activePlayer: "Player1",
    round: 1,
    isMyTurn: true
  },
  opponent: {
    connection: "connected",
    publicStatus: "waiting"
  },
  gameStatus: "in-progress"
}
```

Đây chỉ là ví dụ minh họa cho mock. Khi tích hợp thật, dùng đúng kiểu
PlayerView từ Haskell; không ép server phải đổi schema để phù hợp ví dụ
này.

## 11.2 UI state

Tách riêng: - `screen`: title, how-to-play, settings, lobby, game,
result. - `selectedCell`. - `selectedAction`. - `confirmation`. -
`pendingAction`. - `toasts`. - `eventLogExpanded`. -
`sectorOverviewOpen`. - `camera` (zoom, pan). - `settings` (font size,
sound, volume, reduced motion). - `connectionStatus`. - `helpPanelOpen`.

Không đặt thông tin ẩn vào UI state chỉ vì mock data biết nó. UI state
không được trở thành kho dữ liệu thứ hai chứa toàn bộ GameState.

## 11.3 Interface adapter

Thiết kế interface để về sau thay mock bằng network:

-   `getInitialView()`
-   `sendAction(action)`
-   `subscribeToUpdates(callback)` hoặc cơ chế tương đương
-   `testConnection(serverAddress)`
-   `createRoom()`
-   `joinRoom(roomCode)`
-   `leaveRoom()`
-   `requestMatchResult()`

Các hàm trong mock phải được đặt tên/đóng gói sao cho không tạo ấn tượng
rằng chúng đang kết nối thật. Khi chưa có server, UI có thể mô phỏng
response sau thao tác demo nhưng cần phân biệt rõ mock mode trong
code/README. Không dùng timer để giả tiến trình loading vô hạn.

------------------------------------------------------------------------

# 12. Quy tắc xử lý từng action trong UI

## Move

-   Chỉ hiện khi target là ô hợp lệ có thể đi đến theo quy tắc UI và
    không ngoài biên.
-   Hiển thị cost AP 1 / battery 2 theo cấu hình hiện tại.
-   Click action tạo action summary.
-   Khi gửi: pending.
-   Khi server xác nhận: cập nhật position/AP/battery rồi animate.
-   Nếu ngoài phạm vi/không hợp lệ: giải thích ngắn, không gửi.

## Observe

-   Hiển thị cost AP 1 / battery 1.
-   Chọn action không làm lộ hành tinh.
-   Khi gửi: pending.
-   Chỉ sau kết quả server mới chạy scan sweep và cập nhật known
    planets.
-   Discovery toast/log chỉ tạo từ dữ liệu trả về.

## ScanArea

-   Hiển thị cost AP 2 / battery 3.
-   Bán kính 8 theo luật hiện tại.
-   Không hiển thị các planet chưa được server xác nhận là đã phát hiện.
-   Animation chỉ chạy sau xác nhận.

## ScanNearest

-   Cost AP 2 / battery 3.
-   Kết quả UI: hướng + khoảng cách.
-   Không vẽ marker tại tọa độ suy ra.
-   Không hiển thị tên/ID/stock nếu response không cho phép.

## ScanOpponent

-   Cost AP 3 / battery 3.
-   Kết quả chỉ hướng hoặc `HERE`.
-   Không hiển thị tọa độ.
-   Event Log ghi kết quả hợp lệ.
-   Người bị scan nhận notification nếu server gửi.

## Mine

-   Cost AP 2 / battery 1.
-   Chỉ hợp lệ khi đứng trên hành tinh, có stock loại tài nguyên đó và
    cargo còn chỗ.
-   Lượng lấy tối đa 5, bị giới hạn bởi stock và chỗ trống.
-   Stock hiện tại chỉ hiển thị khi đứng trên hành tinh.
-   Cargo/stock chỉ cập nhật sau phản hồi server.
-   Nếu thiếu cargo capacity hoặc stock, giải thích đúng lý do được xác
    nhận.

## Deposit

-   Cost AP 1.
-   Battery cost phụ thuộc vị trí: 0 trên Earth, 2 ở khoảng cách 1--5.
-   Chuyển toàn bộ cargo vào kho Earth riêng.
-   Xác nhận trước khi gửi.
-   Hiển thị điểm dự kiến và mục tiêu 500.
-   Cập nhật score chính thức sau response.
-   Nếu đạt mục tiêu, result phải do server xác nhận.

## Recharge

-   Cost AP 1 / battery 0.
-   Chỉ tại Earth.
-   Tài nguyên trả từ Earth storage.
-   1 điểm giá trị đổi 2 battery; phần vượt battery max mất.
-   Xác nhận trước khi gửi.
-   Hiển thị mức tiêu hao và pin dự kiến nhận.
-   Không tự quyết định lựa chọn loại/số lượng tài nguyên nếu contract
    gameplay chưa làm rõ.

## End Turn

-   Cost 0/0.
-   Có confirmation.
-   Confirm -\> pending, khóa gameplay.
-   Chờ server xác nhận.
-   Không tự reset AP hoặc đổi active player phía client.

------------------------------------------------------------------------

# 13. HOW TO PLAY --- nội dung phải bao phủ

Nội dung chính xác sẽ dựa vào luật đã chốt. Mỗi mục ngắn, dùng câu dễ
hiểu.

1.  **Objective:** khai thác tài nguyên, gửi về Earth; đạt 500 điểm để
    thắng ngay sau Deposit.
2.  **Map:** tọa độ 0--99, x tăng sang phải, y tăng xuống, khoảng cách
    Manhattan, biên không vòng.
3.  **Turn/AP:** tối đa 5 AP mỗi lượt theo luật hiện tại; lượt kết thúc
    khi hết AP hoặc End Turn.
4.  **Battery:** action tiêu pin theo chi phí; battery về 0 là thua theo
    xác nhận server.
5.  **Move:** đi một ô theo bốn hướng.
6.  **Observe:** phát hiện vị trí và loại hành tinh trong bán kính 3.
7.  **ScanArea:** tương tự Observe nhưng bán kính 8.
8.  **ScanNearest:** hướng và khoảng cách tới hành tinh gần nhất còn tài
    nguyên; không tiết lộ tọa độ.
9.  **ScanOpponent:** hướng đến đối thủ; `HERE` nếu cùng ô; đối thủ nhận
    thông báo bị scan.
10. **Mine:** phải đứng trên hành tinh; mỗi lần lấy tối đa 5 đơn vị và
    không vượt stock/cargo.
11. **Cargo:** tối đa 50 đơn vị, không phải 50 điểm.
12. **Deposit:** gửi toàn bộ cargo về Earth hoặc trong tầm cho phép;
    điểm kho Earth có thể đạt target.
13. **Recharge:** chỉ tại Earth, tiêu tài nguyên từ kho Earth; mỗi điểm
    giá trị đổi 2 battery; phần vượt max bị mất.
14. **Fog of War:** chỉ biết các hành tinh đã khám phá; stock chỉ thấy
    khi đang đứng trên hành tinh; không biết tọa độ đối thủ từ
    ScanOpponent.
15. **Round Limit:** tối đa 100 vòng; điểm cao hơn thắng, bằng nhau hòa.
16. **Disconnect:** kết quả do server xác nhận, không dựa vào phỏng đoán
    của client.

------------------------------------------------------------------------

# 14. Tiêu chí nghiệm thu tổng thể

## Giao diện

-   [ ] Phong cách Retro Space Terminal, Dual Phosphor.
-   [ ] Màu sắc/typography nhất quán ở mọi màn hình.
-   [ ] Bản đồ là trọng tâm ở màn hình trận.
-   [ ] Các panel không chồng lấn ở viewport mục tiêu.
-   [ ] Nút có hover/focus/available/unavailable/pending/error rõ.
-   [ ] Reduced Motion hoạt động.
-   [ ] Sound toggle và volume slider hoạt động trong UI.
-   [ ] Cỡ chữ có thể thay đổi mà không cắt nội dung quan trọng.

## Gameplay UI

-   [ ] Click ô chỉ chọn ô, không tự Move.
-   [ ] Action summary hiện target và cost.
-   [ ] Confirmation cho Deposit, Recharge, End Turn.
-   [ ] Pending khóa action gameplay nhưng vẫn cho pan/zoom.
-   [ ] State chỉ cập nhật sau response thành công từ adapter/server.
-   [ ] Lỗi hiện gần Command Console và trong Event Log.
-   [ ] Không tự End Turn khi hết AP.
-   [ ] Không tự tuyên bố game over khi battery về 0 nếu server chưa xác
    nhận.
-   [ ] Không giả hủy action đã gửi.

## Fog of war

-   [ ] Ô chưa khám phá không lộ planet.
-   [ ] Overview không lộ vật thể ẩn.
-   [ ] Planet stock chỉ hiện khi đang đứng trên planet.
-   [ ] ScanNearest không lộ tọa độ.
-   [ ] ScanOpponent không lộ tọa độ.
-   [ ] Không dùng dữ liệu nội bộ server trong UI/log.
-   [ ] `DEPLETED` chỉ xuất hiện nếu được server xác nhận và luật cho
    phép.

## Mạng và phòng

-   [ ] Room Code create/join flow rõ.
-   [ ] Không có QR.
-   [ ] Create/join error có nội dung và code.
-   [ ] Không auto-retry vô hạn.
-   [ ] Cancel/leave chỉ được xác nhận sau server response.
-   [ ] LINK LOST không tự suy đoán kết quả.
-   [ ] Test Connection không tạo/join room.

## Result

-   [ ] Result, reason, scores nếu có, rounds và total deposited nếu có.
-   [ ] Dữ liệu thiếu không được bịa.
-   [ ] Back to Menu.
-   [ ] Copy Match Summary sao chép văn bản.
-   [ ] Không có save/replay.

------------------------------------------------------------------------

# 15. Lộ trình triển khai cho Codex --- từng phần, từng checkpoint

**Không yêu cầu Codex làm toàn bộ các phase trong một lần.** Mỗi phase
là một đơn vị review riêng. Sau mỗi phase, chạy thử, chụp/miêu tả kết
quả, nêu file thay đổi và dừng chờ người dùng duyệt.

## Phase UI-0 --- Khảo sát project và kế hoạch

**Mục tiêu:** hiểu project hiện tại trước khi đụng file.

Việc làm: 1. Đọc `README.md`, `package.yaml`, `stack.yaml` và các file
`client/` đang tồn tại. 2. Xác định client đã có gì, có file nào cần
giữ. 3. Kiểm tra `.gitignore` để không commit `.stack-work/`, build
output hoặc file tạm. 4. Không sửa Haskell. 5. Đề xuất cấu trúc client
tối thiểu và báo những điểm xung đột với file hiện tại.

**Nghiệm thu:** - Chỉ báo cáo phân tích và kế hoạch. - Không sửa file
trong phase này. - Dừng chờ người dùng duyệt.

## Phase UI-1 --- Design tokens và khung ứng dụng

**Mục tiêu:** dựng nền visual system trước khi làm logic.

File dự kiến: - `client/index.html` - `client/style.css` -
`client/app.js`

Việc làm: 1. Tạo design tokens CSS cho nền, xanh, amber, text, viền,
danger, focus. 2. Đặt font monospace và fallback. 3. Tạo khung ứng dụng,
panel, tiêu đề, nút và trạng thái cơ bản. 4. Tạo cấu trúc layout desktop
1440×900. 5. Chưa tạo logic gameplay; dùng placeholder có chủ đích. 6.
Không thêm thư viện UI.

**Nghiệm thu:** - Mở được bằng trình duyệt/Live Server. - Không có lỗi
console. - Nhìn ra phong cách Retro Space Terminal. - Chưa cần kết nối
server. - Dừng chờ review.

## Phase UI-2 --- Title, How to Play và Settings

**Mục tiêu:** hoàn thành các màn hình ngoài trận.

Việc làm: 1. Title có đúng bốn mục: Multiplayer, How to Play, Settings,
Exit. 2. HOW TO PLAY chia thành các mục ở phần 13. 3. Settings gồm font
size, sound toggle, volume, reduced motion, server address, Test
Connection. 4. Test Connection trong mock phải được ghi rõ là mô phỏng,
không giả vờ kiểm tra server thật. 5. Exit xử lý phù hợp với trình
duyệt: không giả định browser cho phép tự đóng tab; có thể hiện hướng
dẫn đóng tab nếu không thể đóng.

**Nghiệm thu:** - Điều hướng giữa menu, help và settings hoạt động. - Cỡ
chữ, volume, sound toggle, reduced motion có phản hồi UI. - Không thay
đổi gameplay state. - Dừng chờ review.

## Phase UI-3 --- Lobby và Room Code mock

**Mục tiêu:** dựng luồng tạo/join phòng bằng mock adapter.

Việc làm: 1. Multiplayer mở Lobby. 2. Hai lựa chọn Create Room / Join
Room. 3. Create Room hiển thị Room Code lớn và Copy Code. 4. Join Room
nhận Room Code. 5. Hiển thị lỗi khác nhau theo mock server reason. 6.
Waiting screen, Cancel/Back, Players Connected. 7. Hai người đã kết nối
thì chuyển sang initializing ngắn và game mock. 8. Không QR, không
Ready/Start. 9. Tất cả phải có nhãn mock trong code/README; chưa
WebSocket.

**Nghiệm thu:** - Luồng create/join/cancel có thể demo bằng mock. - Copy
Code thực sự gọi clipboard nếu browser cho phép; nếu thất bại, hiển thị
lỗi. - Không nói đã giải phóng phòng nếu chưa nhận response mock tương
ứng. - Dừng chờ review.

## Phase UI-4 --- Bố cục trận và dữ liệu mock

**Mục tiêu:** có màn hình game hoàn chỉnh về bố cục nhưng chưa cần bản
đồ tương tác phức tạp.

Việc làm: 1. Tạo Ship HUD. 2. Tạo Target/Intelligence Panel. 3. Tạo
Opponent Status Panel. 4. Tạo Command Console. 5. Tạo Event Log. 6. Tạo
turn/status bar. 7. Tạo mock `PlayerView` với dữ liệu demo có nhãn MOCK.
8. Tách dữ liệu khỏi render. 9. Không hiển thị thông tin ẩn trong các
panel.

**Nghiệm thu:** - Tất cả panel ở đúng vị trí. - HUD hiển thị vị
trí/AP/battery/cargo/score. - Target Panel có trạng thái chưa
chọn/unknown/known planet. - Event Log có timestamp `MM:SS` và event
code. - Dừng chờ review.

## Phase UI-5 --- Tactical Map Canvas

**Mục tiêu:** bản đồ chiến thuật tương tác.

Việc làm: 1. Dùng Canvas hoặc cách vẽ phù hợp để hiển thị lưới. 2. Hỗ
trợ camera viewport quanh tàu. 3. Wheel zoom, drag pan, Reset to Ship.
4. Cell click chọn ô; không auto Move. 5. Hover/click hiện tọa độ và
cell status. 6. Chỉ hiển thị Earth, tàu mình, hành tinh đã khám phá
trong mock. 7. Sector Overview cho toàn map, vẫn tuân thủ fog of war. 8.
Legend glyph. 9. `CLEAR TARGET`. 10. Khi pending, khóa cell selection
nhưng vẫn cho zoom/pan.

**Nghiệm thu:** - Tọa độ x/y nhất quán với luật: x sang phải, y xuống. -
Pan/zoom không thay đổi game state. - Click chỉ chọn ô. - Overview không
lộ hidden planets. - Dừng chờ review.

## Phase UI-6 --- Command Console và state machine

**Mục tiêu:** mô phỏng vòng đời action đúng nguyên tắc
server-authoritative.

Việc làm: 1. Xây state UI rõ ràng: idle, selected, confirming, pending,
success, error. 2. Hành động theo ngữ cảnh. 3. Hiện chi phí AP/battery.
4. Action summary. 5. Confirmation cho Deposit/Recharge/End Turn. 6.
Cancel giữ selection/action. 7. Chọn ô mới cập nhật target, không gửi
action. 8. Pending khóa gameplay action. 9. Mock adapter trả kết quả
success/error có cấu trúc. 10. Chỉ sau mock response thành công mới cập
nhật mock authoritative view và chạy animation. 11. Không tự End Turn.
12. Không fake cancel sau khi gửi.

**Nghiệm thu:** - Có thể demo success và error. - Không có optimistic
gameplay state update. - Không thể gửi hai action cùng lúc. - End Turn
pending khóa action cho đến response. - Dừng chờ review.

## Phase UI-7 --- Scan, movement animation và diegetic feedback

**Mục tiêu:** bổ sung motion/feedback sau khi state machine đã đúng.

Việc làm: 1. Scan sweep. 2. Discovery effect chỉ sau response. 3. Ship
movement slide + trail chỉ sau response. 4. Command Echo hiển thị lệnh
đã chọn và kết quả. 5. Toast phân cấp. 6. Gộp/xếp hàng toast. 7.
Deduplicate cảnh báo lặp. 8. Event Log có thể mở rộng. 9. Sound
toggle/volume và reduced motion ảnh hưởng hiệu ứng. 10. Không chạy
animation gameplay khi server từ chối.

**Nghiệm thu:** - Animation không bao giờ thể hiện action thất bại như
thành công. - Toast không che vùng thao tác chính. - Cảnh báo quan trọng
còn trong HUD/log. - Reduced motion vẫn giữ feedback trạng thái. - Dừng
chờ review.

## Phase UI-8 --- Result và LINK LOST

**Mục tiêu:** hoàn thiện trạng thái cuối trận và kết nối lỗi ở mức UI
mock.

Việc làm: 1. Result screen Victory/Defeat/Draw. 2. Reason và event code.
3. Scores/rounds/total deposited chỉ khi mock response cung cấp. 4. Back
to Menu. 5. Copy Match Summary. 6. LINK LOST. 7. Mock thử kết quả có thể
xác minh và không thể xác minh. 8. Không suy luận kết quả chỉ từ local
connection error.

**Nghiệm thu:** - Kết quả không được tự tính/bịa khi thiếu dữ liệu. -
Copy Match Summary sao chép văn bản. - LINK LOST có trạng thái rõ. -
Dừng chờ review.

## Phase UI-9 --- Responsive, accessibility và polish

**Mục tiêu:** làm UI ổn định, dễ dùng.

Việc làm: 1. Kiểm tra 1440×900 và 1920×1080. 2. Kiểm tra cửa sổ nhỏ. 3.
Thu gọn panel phụ theo quyết định responsive đã được duyệt. 4. Keyboard
focus/Tab/Enter/Escape. 5. Cỡ chữ tăng/giảm. 6. Không để panel/nút chồng
nhau. 7. Reduced Motion. 8. Contrast, trạng thái không chỉ dựa màu. 9.
Kiểm tra toàn bộ màn hình và chuyển trạng thái. 10. Sửa lỗi giao diện,
không thêm tính năng mới.

**Nghiệm thu:** - Không có nút quan trọng bị cắt. - Keyboard focus rõ. -
UI vẫn dùng được ở cửa sổ nhỏ theo chính sách responsive đã chốt. - Dừng
chờ review.

## Phase UI-10 --- Chuẩn bị thay mock bằng network adapter

**Mục tiêu:** làm sạch ranh giới giữa UI và mock để phase mạng sau này
không phải viết lại giao diện.

Việc làm: 1. Xác định interface của adapter. 2. Tách toàn bộ mock
response ra khỏi component render. 3. Chuẩn hóa cách nhận PlayerView,
ActionReport, notification, game result và errors. 4. Ghi rõ field nào
cần server cung cấp. 5. Không triển khai WebSocket thật trong phase này.
6. Không tự sửa Haskell Protocol/PlayerView để chiều UI nếu chưa review
contract.

**Nghiệm thu:** - Có thể thay mock adapter bằng adapter thật mà không
sửa layout/panel chính. - Không còn dữ liệu mock rải rác trong nhiều
file. - Tài liệu mô tả rõ interface và các field cần thiết. - Dừng chờ
review.

## Phase UI-11 --- Review tổng thể trước tích hợp thật

**Mục tiêu:** đóng băng UI mock trước khi bắt đầu tích hợp
Haskell/WebSocket.

Checklist: 1. Đi hết Title → How to Play/Settings → Lobby → Game →
Result. 2. Thử tất cả action mock success/error. 3. Thử fog of war. 4.
Thử pending. 5. Thử confirmation cancel/confirm. 6. Thử LINK LOST. 7.
Thử reduced motion, sound, font size. 8. Kiểm tra responsive. 9. Kiểm
tra không có UI tự đổi luật. 10. Ghi các vấn đề còn mở.

**Không bắt đầu tích hợp WebSocket thật cho đến khi người dùng duyệt UI
mock và hợp đồng dữ liệu.**

------------------------------------------------------------------------

# 16. Mẫu yêu cầu Codex cho từng phase

Dùng mẫu này và thay `UI-N` bằng phase muốn làm:

> Đọc `client/UI-SPEC.md` toàn bộ trước khi làm. Thực hiện riêng Phase
> UI-N, không làm phase sau. Đọc các file hiện có trước khi sửa. Không
> sửa Haskell, không thêm dependency hoặc framework, không triển khai
> WebSocket thật trong UI mock. Không tự thay đổi luật gameplay. Sau khi
> làm xong, chạy kiểm tra phù hợp và báo: (1) file đã tạo/sửa, (2) hành
> vi đã triển khai, (3) lệnh chạy/kiểm tra, (4) kết quả kiểm tra thật,
> (5) giới hạn hoặc quyết định còn mở. Dừng để người dùng review.

## Prompt đầu tiên đề xuất cho Codex

> Đọc `client/UI-SPEC.md`. Chỉ thực hiện Phase UI-0: khảo sát project
> hiện tại và đề xuất kế hoạch triển khai. Không sửa bất kỳ file nào.
> Kiểm tra cấu trúc repo, file client hiện có, README, package.yaml và
> stack.yaml. Báo lại cấu trúc hiện tại, những file nên giữ, cấu trúc
> client đề xuất và các xung đột/rủi ro. Chờ tôi duyệt trước khi sửa
> code.

------------------------------------------------------------------------

# 17. Những điểm cần giữ mở, không được Codex tự quyết

1.  **Vòng 19 responsive:** người dùng chưa đưa lựa chọn. Breakpoint,
    cách mở panel, hành vi cửa sổ cực hẹp và giữ trạng thái panel chưa
    được duyệt đầy đủ.
2.  **Recharge UI:** luật nói Recharge chọn loại và số lượng tài nguyên,
    nhưng quy trình lựa chọn chính xác cần đối chiếu API/game core.
    Không tự giả định.
3.  **Thông tin công khai của đối thủ:** chỉ hiện những gì
    PlayerView/server thực sự cung cấp và người dùng đã duyệt là công
    khai.
4.  **Cấu trúc JSON cuối cùng:** dùng contract Protocol/Message và
    PlayerView thật khi phase mạng được triển khai. Các object trong tài
    liệu này chỉ là mô hình khái niệm cho mock.
5.  **Ngưỡng BATTERY LOW / CARGO NEAR FULL:** đây là ngưỡng UX cần định
    nghĩa, không được biến thành luật gameplay mới nếu chưa duyệt.
6.  **Hành động hợp lệ theo target:** UI có thể hỗ trợ hiển thị ngữ
    cảnh, nhưng kiểm tra hợp lệ cuối cùng thuộc server.
7.  **Server address và Test Connection:** ở UI mock chỉ mô phỏng; không
    báo kết nối thật nếu chưa có adapter mạng.
8.  **Responsive panel policy:** dựng cơ bản an toàn, nhưng không xem
    các lựa chọn ở vòng 19 là đã chốt.
9.  **Cơ chế retry:** không auto-retry vô hạn; chính sách retry cụ thể
    phải nhất quán với giao thức mạng khi được triển khai.
10. **Thay đổi luật:** bất kỳ xung đột giữa UI và luật Haskell đều phải
    báo người dùng, không tự sửa luật hoặc tự sửa UI để che mâu thuẫn.

------------------------------------------------------------------------

# 18. Nguyên tắc nghiệm thu và phối hợp nhóm

-   Chỉ một người/agent sửa một nhóm file trong cùng một thời điểm để
    tránh xung đột.
-   UI phase không chạm các module `Game.*`, `Protocol.*`, `Server.*`.
-   Mỗi phase nên có commit riêng nếu đang dùng Git.
-   Không commit build output, `.stack-work/`, file executable tạm hoặc
    thư mục sinh tự động.
-   Tên commit nên nói rõ phạm vi, ví dụ
    `ui: add retro terminal design tokens`.
-   Khi phát hiện luật không rõ, ghi câu hỏi thay vì phỏng đoán.
-   Mọi dữ liệu mock phải được đánh dấu, tránh nhầm mock với server thật
    khi demo.
-   UI phải có thể chạy local bằng trình duyệt/Live Server mà không cần
    server Haskell trong các phase mock.
-   Trước tích hợp thật, người dùng duyệt UI và contract dữ liệu.
-   Sau mỗi phase, Codex dừng lại để review, không tự chạy tiếp toàn bộ
    roadmap.

------------------------------------------------------------------------

# 19. Tóm tắt chỉ đạo cốt lõi

**Xây một giao diện PvP terminal đẹp, rõ và đúng luật; không xây một
CLI, không tự chơi thay người dùng, không lộ thông tin ẩn và không giả
vờ client là server.**

Thứ tự triển khai:

1.  Khảo sát repo.
2.  Design tokens + khung.
3.  Menu / How to Play / Settings.
4.  Lobby mock.
5.  Game layout + mock PlayerView.
6.  Tactical Map.
7.  Command state machine.
8.  Scan/movement animation + notification.
9.  Result + LINK LOST.
10. Responsive/accessibility.
11. Tách mock adapter.
12. Review UI mock.
13. Chỉ sau khi duyệt mới tích hợp Protocol/WebSocket thật.

Mỗi phase nhỏ, chạy được, kiểm tra được, review được. Không viết cả hệ
thống trong một lần rồi phát hiện mọi quyết định UX đều bị hiểu sai.
