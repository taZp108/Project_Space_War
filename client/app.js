"use strict";

const root = document.querySelector("#main");
const runtimeStatus = document.querySelector("#runtime-status");
const preferenceKey = "space-war-ui-settings-v1";

const defaultSettings = {
  fontSize: 16,
  sound: false,
  volume: 35,
  reducedMotion: false,
  serverAddress: "ws://localhost:8080",
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) || "{}");
    return { ...defaultSettings, ...saved };
  } catch {
    return { ...defaultSettings };
  }
}

let settings = loadSettings();
let currentScreen = "home";
let connectionNotice = "CHỈ THỬ NGHIỆM — không gửi yêu cầu kết nối.";
let lobbyState = null;
let joinCodeValue = "";
let lobbyBusy = false;
let lobbyError = null;
let playerView = null;
let matchResult = null;
let matchLinkLost = false;
let matchLinkNotice = "Kết quả trận chưa được xác nhận. Mất kết nối không đồng nghĩa với việc có người thắng.";
let summaryNotice = "";
let selectedCell = null;
let hoverCell = null;
let sectorOverviewOpen = false;
let pendingAction = false;
let actionFlow = { status: "idle", selected: null, result: null };
let rechargeSelection = { resource: "Crystal", amount: 1 };
let commandEcho = null;
let eventLogExpanded = false;
let localActionEvents = [];
let activeEffects = [];
let effectFrame = 0;
let activeToast = null;
let toastQueue = [];
let toastTimer = null;
const recentToastKeys = new Map();
let audioContext = null;
const camera = { x: 50, y: 51, zoom: 1 };

function saveSettings() {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(settings));
  } catch {
    // Preferences still work for this page session when local storage is unavailable.
  }
}

function applySettings() {
  document.documentElement.style.setProperty("--text-scale", String(settings.fontSize / 16));
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
}

const actionLabels = {
  MOVE: "DI CHUYỂN", OBSERVE: "QUAN SÁT", SCAN_AREA: "QUÉT KHU VỰC",
  SCAN_NEAREST: "TÌM HÀNH TINH GẦN NHẤT", SCAN_OPPONENT: "QUÉT ĐỐI THỦ",
  MINE: "KHAI THÁC", DEPOSIT: "NỘP TÀI NGUYÊN", RECHARGE: "SẠC PIN", END_TURN: "KẾT THÚC LƯỢT",
};
const resourceLabels = { Iron: "Sắt", Crystal: "Pha lê", EnergyCore: "Lõi năng lượng", RareOre: "Quặng hiếm", ExoticMatter: "Vật chất lạ" };
const planetLabels = { Mining: "Khai thác", Energy: "Năng lượng", Rare: "Hiếm", Observe: "Quan sát", ScanArea: "Quét khu vực" };
const cellStatusLabels = { EARTH: "TRÁI ĐẤT", "OWN SHIP": "TÀU CỦA BẠN", "KNOWN PLANET": "HÀNH TINH ĐÃ BIẾT", UNKNOWN: "CHƯA KHÁM PHÁ" };
const statusLabels = { connected: "ĐÃ KẾT NỐI", waiting: "ĐANG CHỜ", active: "ĐANG HOẠT ĐỘNG", lost: "MẤT KẾT NỐI", restored: "ĐÃ KẾT NỐI LẠI", unknown: "CHƯA RÕ" };
const eventKindLabels = { INFO: "TIN", SCAN: "QUÉT", MOVE: "DI CHUYỂN", WARN: "CẢNH BÁO", ERROR: "LỖI" };
const resultLabels = { Victory: "CHIẾN THẮNG", Defeat: "THẤT BẠI", Draw: "HÒA", "Outcome unavailable": "CHƯA CÓ KẾT QUẢ", "Result unverified": "KẾT QUẢ CHƯA XÁC MINH" };
const reasonLabels = { REACHED_TARGET: "ĐẠT ĐIỂM MỤC TIÊU", EARTH_SCORE_TARGET_REACHED: "ĐẠT ĐIỂM TRÁI ĐẤT MỤC TIÊU", ReachedTarget: "ĐẠT ĐIỂM MỤC TIÊU", BATTERY_DEPLETED: "CẠN PIN", OpponentOutOfBattery: "ĐỐI THỦ CẠN PIN", ROUND_LIMIT_REACHED: "HẾT GIỚI HẠN VÒNG", HigherScoreAtLimit: "ĐIỂM CAO HƠN KHI HẾT VÒNG", OPPONENT_DISCONNECTED: "ĐỐI THỦ MẤT KẾT NỐI", OpponentDisconnected: "ĐỐI THỦ MẤT KẾT NỐI", RESULT_UNAVAILABLE: "CHƯA CÓ KẾT QUẢ" };
const uiText = {
  "Your turn is active.": "Đến lượt của bạn.", "Cargo manifest received.": "Đã cập nhật hàng hóa.",
  "The mock server accepted the command.": "Lệnh đã được chấp nhận.", "The mock opponent turn ended. Your turn is active.": "Đối thủ đã kết thúc lượt. Đến lượt của bạn.",
  "This mock match is not active.": "Trận đấu hiện không hoạt động.", "Wait for your turn before sending a command.": "Hãy chờ đến lượt của bạn rồi gửi lệnh.",
  "The mock adapter does not recognize this command.": "Không nhận diện được lệnh này.", "Not enough AP for this command.": "Không đủ AP cho lệnh này.",
  "Not enough battery for this command.": "Không đủ pin cho lệnh này.", "Choose a cell inside the 0–99 map.": "Chọn một ô trong bản đồ từ 0 đến 99.",
  "Move requires one adjacent cell in a cardinal direction.": "Di chuyển cần đến một ô kề theo hướng ngang hoặc dọc.",
  "Observe scan complete.": "Đã quan sát xong.", "Area scan complete.": "Đã quét khu vực xong.",
  "Nearest-planet scan complete; no exact coordinates returned.": "Đã tìm hướng đến hành tinh gần nhất; không hiển thị tọa độ chính xác.",
  "Opponent scan complete; coordinates remain hidden.": "Đã quét đối thủ; tọa độ vẫn được giữ kín.",
  "Mining requires the ship to stand on a known planet.": "Tàu phải ở trên hành tinh đã biết để khai thác.",
  "No mock stock remains on this planet.": "Hành tinh này không còn tài nguyên.", "Cargo hold is full.": "Khoang hàng đã đầy.",
  "Earth is outside the 5-cell deposit range.": "Trái Đất nằm ngoài tầm nộp hàng 5 ô.", "There is no cargo to deposit.": "Không có hàng hóa để nộp.",
  "Recharge is available only while docked at Earth.": "Chỉ có thể sạc pin khi tàu ở Trái Đất.", "Battery is already at maximum.": "Pin đã đầy.",
  "Choose a positive whole number of resource units.": "Chọn số nguyên dương cho lượng tài nguyên.",
  "Earth storage does not contain that many units.": "Kho Trái Đất không có đủ lượng tài nguyên này.",
  "Turn ended. Waiting for the opponent.": "Đã kết thúc lượt. Đang chờ đối thủ.",
  "That code does not match the mock room format.": "Mã phòng không đúng định dạng.", "Enter a code such as MOCK-7K2Q.": "Nhập mã theo dạng MOCK-7K2Q.",
  "This mock room already has two players.": "Phòng thử này đã đủ hai người chơi.", "Try another room code.": "Hãy thử mã phòng khác.",
  "The mock connection was interrupted.": "Kết nối thử đã bị gián đoạn.", "Check the address in Settings or retry the demo.": "Kiểm tra địa chỉ trong Cài đặt hoặc thử kết nối lại.",
  "No mock room uses that code.": "Không tìm thấy phòng thử với mã này.", "Check the code and try again.": "Kiểm tra mã rồi thử lại.",
  "The mock room is no longer available.": "Phòng thử này không còn khả dụng.", "Return to the menu and create another mock room.": "Quay lại menu và tạo phòng thử khác.",
  "Select a target cell first.": "Hãy chọn ô mục tiêu trước.", "Choose a positive whole number of units.": "Chọn số nguyên dương cho lượng tài nguyên.",
  "The match result is unconfirmed. A lost local connection does not establish a winner.": "Kết quả trận chưa được xác nhận. Mất kết nối không đồng nghĩa với việc có người thắng.",
  "No object information is available for this cell.": "Chưa có thông tin về ô này.",
  "INVALID ROOM CODE": "MÃ PHÒNG KHÔNG HỢP LỆ", "ROOM FULL": "PHÒNG ĐÃ ĐẦY", "CONNECTION ERROR": "LỖI KẾT NỐI", "ROOM NOT FOUND": "KHÔNG TÌM THẤY PHÒNG",
  "No cell selected": "Chưa chọn ô", "All cargo to Earth": "Toàn bộ hàng về Trái Đất", "Next player": "Người chơi tiếp theo",
  "ACTION ACCEPTED": "ĐÃ CHẤP NHẬN", "ACTION REJECTED": "HÀNH ĐỘNG BỊ TỪ CHỐI", "SERVER NOTICE": "THÔNG BÁO MÁY CHỦ",
  "PLANETARY SIGNAL ACQUIRED": "ĐÃ PHÁT HIỆN HÀNH TINH", "YOUR TURN ACTIVE": "ĐẾN LƯỢT CỦA BẠN",
  "MOCK RESULT: no connection request was sent.": "KẾT QUẢ THỬ: không gửi yêu cầu kết nối.",
  "MATCH RESULT RECEIVED": "ĐÃ NHẬN KẾT QUẢ TRẬN", "MOCK FIXTURE / RESULT RECEIVED": "ĐÃ NHẬN KẾT QUẢ THỬ",
  "MATCH RESULT RESPONSE RECEIVED": "ĐÃ NHẬN PHẢN HỒI KẾT QUẢ TRẬN", "MOCK FIXTURE / VERIFIED RESULT": "KẾT QUẢ THỬ ĐÃ XÁC MINH",
  "MOCK FIXTURE / OUTCOME UNKNOWN": "KẾT QUẢ THỬ CHƯA RÕ", "MATCH SUMMARY COPIED.": "ĐÃ SAO CHÉP TÓM TẮT TRẬN.",
  "ROOM CODE COPIED TO CLIPBOARD.": "ĐÃ SAO CHÉP MÃ PHÒNG.",
  "COPY FAILED. The match summary is selected below for manual copying.": "Sao chép thất bại. Tóm tắt trận đã được chọn bên dưới để sao chép thủ công.",
  "COPY FAILED. Select the code above and copy it manually.": "Sao chép thất bại. Hãy chọn mã phía trên và sao chép thủ công.",
};

function actionLabel(action) { return actionLabels[action] || action.replaceAll("_", " "); }
function resourceLabel(resource) { return resourceLabels[resource] || resource; }
function planetLabel(planet) { return planetLabels[planet] || planet; }
function cellStatusLabel(status) { return cellStatusLabels[status] || status; }
function statusLabel(status) { return statusLabels[String(status).toLowerCase()] || String(status).toUpperCase(); }
function resultLabel(result) { return resultLabels[result] || result; }
function reasonLabel(reason) { return reasonLabels[reason] || reason; }
function localizeText(text) {
  if (uiText[text]) return uiText[text];
  const patterns = [
    [/^From \((\d+), (\d+)\)$/, (_, x, y) => `Từ (${x}, ${y})`],
    [/^The mock match connection was lost\. No authoritative result is available, so the winner and score remain unknown\.$/, () => "Kết nối trận thử bị mất. Chưa có kết quả xác thực nên chưa rõ người thắng và điểm số."],
    [/^No authoritative match result was returned\.$/, () => "Máy chủ chưa trả về kết quả xác thực của trận."],
    [/^No verified MatchResult was included in the response\. The match outcome remains unknown\.$/, () => "Phản hồi không có kết quả trận đã xác minh. Kết quả vẫn chưa rõ."],
    [/^(.+) · (\d+) units$/, (_, type, amount) => `${resourceLabel(type)} · ${amount} đơn vị`],
    [/^(\w+) · (Mining|Energy|Rare) planet discovered\.$/, (_, id, type) => `${id} · đã phát hiện hành tinh ${planetLabel(type).toLowerCase()}.`],
    [/^(Mining|Energy|Rare) planet discovered\.$/, (_, type) => `Đã phát hiện hành tinh ${planetLabel(type).toLowerCase()}.`],
    [/^(.+) scan complete\.$/, (_, type) => `Đã quét xong: ${actionLabel(type.toUpperCase())}.`],
    [/^(.+) complete\.$/, (_, action) => `Đã hoàn tất: ${actionLabel(action.toUpperCase())}.`],
    [/^The mock match connection was lost\.(.*)$/, (_, rest) => `Kết nối trận thử bị mất.${rest}`],
    [/^The mock lobby connection was lost\.(.*)$/, (_, rest) => `Kết nối phòng thử bị mất.${rest}`],
    [/^The match outcome remains unknown\.$/, () => "Kết quả trận vẫn chưa rõ."],
    [/^Mock opponent turn complete\.$/, () => "Đối thủ đã kết thúc lượt."],
    [/^The mock opponent turn complete\. AP restored from the new view\.$/, () => "Đối thủ đã xong lượt. AP được cập nhật theo trạng thái mới."],
    [/^(.+) complete; no new planets found\.$/, (_, action) => `Đã quét xong: ${actionLabel(action.toUpperCase())}; không tìm thấy hành tinh mới.`],
    [/^The mock room connection was lost\.(.*)$/, (_, rest) => `Kết nối phòng thử bị mất.${rest}`],
    [/^Ship moved to \((\d+), (\d+)\)\.$/, (_, x, y) => `Tàu đã di chuyển đến (${x}, ${y}).`],
    [/^Recovered (\d+) (\w+)\.$/, (_, amount, type) => `Đã thu được ${amount} ${resourceLabel(type)}.`],
    [/^Cargo deposited · \+(\d+) Earth score\.$/, (_, score) => `Đã nộp hàng · +${score} điểm Trái Đất.`],
    [/^Battery recharged by (\d+); Earth storage consumed (\d+) (\w+)\.$/, (_, battery, amount, type) => `Đã sạc thêm ${battery} pin; đã dùng ${amount} ${resourceLabel(type)} từ kho Trái Đất.`],
    [/^Battery \+(\d+); spent (\d+) (\w+)\.$/, (_, battery, amount, type) => `Pin +${battery}; đã dùng ${amount} ${resourceLabel(type)}.`],
    [/^(\d+) new planet signal(s?) acquired\.$/, (_, count) => `Đã phát hiện ${count} hành tinh mới.`],
  ];
  for (const [pattern, replace] of patterns) { const match = text.match(pattern); if (match) return replace(...match); }
  return text;
}

const helpTopics = [
  {
    title: "Mục tiêu / Chiến thắng", tag: "01 / ĐIỀU KIỆN THẮNG", cost: "—",
    condition: "Khám phá hành tinh, khai thác tài nguyên và mang hàng về Trái Đất.",
    result: "Đạt 500 điểm trong kho Trái Đất để thắng ngay sau khi nộp hàng.",
    hidden: "Chỉ máy chủ mới xác nhận kết quả trận.",
  },
  {
    title: "Bản đồ & Tọa độ", tag: "02 / ĐIỀU HƯỚNG", cost: "—",
    condition: "Tọa độ từ 0 đến 99. X tăng sang phải, Y tăng xuống dưới. Tàu không thể ra ngoài bản đồ.",
    result: "Khoảng cách tính theo số bước ngang cộng dọc.",
    hidden: "Ô chưa biết không hiển thị hành tinh.",
  },
  {
    title: "Lượt, AP & Pin", tag: "03 / TÀI NGUYÊN", cost: "Tùy hành động",
    condition: "Mỗi lượt có tối đa 5 AP. Mỗi hành động cũng tiêu hao pin theo mức hiển thị.",
    result: "Lượt kết thúc khi hết AP hoặc khi bạn chọn Kết thúc lượt.",
    hidden: "Pin về 0 là thua nếu máy chủ xác nhận. Giao diện không tự kết thúc lượt.",
  },
  {
    title: "Di chuyển", tag: "04 / ĐIỀU HƯỚNG", cost: "1 AP · 2 pin",
    condition: "Đi một ô theo hướng ngang hoặc dọc; không thể vượt biên bản đồ.",
    result: "Máy chủ trả về vị trí mới nếu chấp nhận lệnh.",
    hidden: "Di chuyển không tự khám phá hành tinh xung quanh.",
  },
  {
    title: "Quan sát", tag: "05 / QUÉT", cost: "1 AP · 1 pin",
    condition: "Quét trong bán kính 3 ô.", result: "Trả về vị trí và loại hành tinh trong tầm.",
    hidden: "Chỉ hành tinh được trả về mới trở thành đã biết.",
  },
  {
    title: "Quét khu vực", tag: "06 / QUÉT", cost: "2 AP · 3 pin",
    condition: "Quét trong bán kính 8 ô.", result: "Trả về vị trí và loại hành tinh trong tầm.",
    hidden: "Không tiết lộ hành tinh ngoài kết quả quét.",
  },
  {
    title: "Tìm hành tinh gần nhất", tag: "07 / TÌNH BÁO", cost: "2 AP · 3 pin",
    condition: "Tìm hành tinh gần nhất còn tài nguyên.", result: "Trả về hướng và khoảng cách.",
    hidden: "Không trả về tọa độ chính xác của hành tinh.",
  },
  {
    title: "Quét đối thủ", tag: "08 / TÌNH BÁO", cost: "3 AP · 3 pin",
    condition: "Quét vị trí tàu đối thủ.", result: "Trả về hướng, hoặc CÙNG Ô nếu hai tàu trùng vị trí. Đối thủ sẽ được báo đã bị quét.",
    hidden: "Không hiển thị tọa độ đối thủ.",
  },
  {
    title: "Khai thác", tag: "09 / TÀI NGUYÊN", cost: "2 AP · 1 pin",
    condition: "Đứng trên hành tinh còn tài nguyên và có chỗ trống trong khoang.",
    result: "Lấy tối đa 5 đơn vị, tùy lượng còn lại và sức chứa.",
    hidden: "Chỉ thấy lượng tài nguyên khi tàu đang ở hành tinh đó.",
  },
  {
    title: "Hàng hóa", tag: "10 / KHOANG HÀNG", cost: "Sức chứa: 50 đơn vị",
    condition: "Hàng hóa tính theo số đơn vị tài nguyên, không theo điểm.",
    result: "Mỗi đơn vị tài nguyên chiếm một chỗ trong khoang.",
    hidden: "Hàng trên tàu tách biệt với kho và điểm tại Trái Đất.",
  },
  {
    title: "Nộp tài nguyên", tag: "11 / TRÁI ĐẤT", cost: "1 AP · 0 pin tại Trái Đất; ngoài ra 2 pin",
    condition: "Nộp tại Trái Đất hoặc trong phạm vi 1–5 bước.",
    result: "Chuyển toàn bộ hàng vào kho riêng; kiểm tra chiến thắng sau khi nộp.",
    hidden: "Mỗi người có kho và điểm Trái Đất riêng.",
  },
  {
    title: "Sạc pin", tag: "12 / TRÁI ĐẤT", cost: "1 AP · 0 pin",
    condition: "Chỉ sạc tại Trái Đất bằng tài nguyên trong kho.",
    result: "Mỗi điểm giá trị tài nguyên đổi thành 2 pin. Pin vượt mức tối đa sẽ mất.",
    hidden: "Sạc pin tiêu hao tài nguyên và có thể giảm điểm Trái Đất.",
  },
  {
    title: "Kết thúc lượt", tag: "13 / ĐIỀU KHIỂN LƯỢT", cost: "0 AP · 0 pin",
    condition: "Chọn để kết thúc lượt bất cứ lúc nào.",
    result: "Lượt tiếp theo bắt đầu sau khi máy chủ xác nhận.",
    hidden: "Giao diện không tự gửi lệnh này khi AP về 0.",
  },
  {
    title: "Sương mù chiến tranh", tag: "14 / TÌNH BÁO", cost: "—",
    condition: "Mỗi người có danh sách hành tinh đã khám phá riêng.",
    result: "Toàn khu vực chỉ hiện Trái Đất, tàu của bạn và hành tinh đã khám phá.",
    hidden: "Ô chưa biết không lộ hành tinh; lượng tài nguyên cũ không được xem là hiện tại. Tọa độ đối thủ luôn được giữ kín.",
  },
  {
    title: "Giới hạn vòng", tag: "15 / KẾT THÚC TRẬN", cost: "Tối đa 100 vòng",
    condition: "Một vòng gồm lượt Người chơi 1 rồi đến Người chơi 2.",
    result: "Đến giới hạn, người có điểm kho Trái Đất cao hơn thắng; bằng điểm thì hòa.",
    hidden: "Máy chủ cung cấp kết quả cuối cùng.",
  },
  {
    title: "Mất kết nối", tag: "16 / KẾT NỐI", cost: "—",
    condition: "Mất kết nối cục bộ không có nghĩa đối thủ đã thua.",
    result: "Giao diện yêu cầu máy chủ xác nhận kết quả khi có thể.",
    hidden: "Nếu không xác minh được, giao diện sẽ báo chưa rõ thay vì đoán.",
  },
];

function homeScreen() {
  return `
    <section class="home-screen">
      <div class="home-copy">
        <span class="eyebrow amber-eyebrow">MẠNG CHIẾN THUẬT // ĐIỀU KHIỂN TRỰC TIẾP</span>
        <h1>Chỉ huy<br /><span>khám phá.</span></h1>
        <p class="welcome-copy">Cuộc viễn chinh hai người giữa vùng không gian chưa được lập bản đồ. Khám phá, thu thập tài nguyên và mang chúng về nhà.</p>
        <div class="home-signature"><span class="signature-line"></span><span>SPACE WAR / CHIẾN THUẬT ĐỐI KHÁNG</span></div>
      </div>
      <nav class="menu-panel panel" aria-label="Menu chính">
        <div class="panel-heading"><div><span class="eyebrow">TRUNG TÂM ĐIỀU KHIỂN</span><h2>Chọn điểm đến</h2></div><span class="panel-code">MENU.01</span></div>
        <div class="menu-list">
          <button class="menu-button menu-primary" data-screen="lobby"><span class="menu-index">01</span><span class="menu-label">NHIỀU NGƯỜI CHƠI</span><span class="menu-arrow" aria-hidden="true">→</span></button>
          <button class="menu-button" data-screen="help"><span class="menu-index">02</span><span class="menu-label">HƯỚNG DẪN</span><span class="menu-arrow" aria-hidden="true">→</span></button>
          <button class="menu-button" data-screen="settings"><span class="menu-index">03</span><span class="menu-label">CÀI ĐẶT</span><span class="menu-arrow" aria-hidden="true">→</span></button>
          <button class="menu-button menu-exit" data-action="exit"><span class="menu-index">04</span><span class="menu-label">THOÁT</span><span class="menu-arrow" aria-hidden="true">↗</span></button>
        </div>
        <div class="menu-footnote"><span class="live-mark"></span> GIAO DIỆN SẴN SÀNG <span class="menu-footnote-right">BẢN THỬ / 0.2</span></div>
      </nav>
      <div class="home-coordinate coordinate-top">KHU VỰC // CHƯA KHÁM PHÁ</div>
      <div class="home-coordinate coordinate-bottom">CHƯA CÓ TÍN HIỆU / ĐANG CHỜ</div>
      <div class="home-orbit" aria-hidden="true"><span></span><i></i></div>
    </section>`;
}

function helpScreen() {
  const cards = helpTopics.map((topic) => `
      <article class="help-card panel">
      <div class="help-card-heading"><span class="eyebrow">${topic.tag}</span><span class="help-cost">${topic.cost}</span></div>
      <h2>${topic.title}</h2>
      <dl>
        <div><dt>CÁCH DÙNG / ĐIỀU KIỆN</dt><dd>${topic.condition}</dd></div>
        <div><dt>KẾT QUẢ</dt><dd>${topic.result}</dd></div>
        <div><dt>GIỚI HẠN THÔNG TIN</dt><dd>${topic.hidden}</dd></div>
      </dl>
    </article>`).join("");

  return `
    <section class="content-screen help-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">SỔ TAY // HƯỚNG DẪN NGƯỜI CHƠI</span><h1 id="screen-title">Hướng dẫn <span>chơi</span></h1><p>Tóm tắt luật chơi. Máy chủ xác nhận mọi hành động và kết quả.</p></div>
        <button class="utility-button" data-screen="home">← <span>VỀ MENU</span></button>
      </div>
      <div class="help-grid">${cards}</div>
      <p class="screen-footnote">CÁC GIÁ TRỊ ĐANG THEO ĐẶC TẢ HIỆN TẠI. MÁY CHỦ LÀ NGUỒN XÁC NHẬN.</p>
    </section>`;
}

function settingsScreen() {
  return `
    <section class="content-screen settings-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">HỒ SƠ NGƯỜI CHƠI // TÙY CHỌN CỤC BỘ</span><h1 id="screen-title">Cài đặt <span>hệ thống</span></h1><p>Các tùy chọn này chỉ thay đổi cách hiển thị, không ảnh hưởng luật chơi.</p></div>
        <button class="utility-button" data-screen="home">← <span>VỀ MENU</span></button>
      </div>
      <div class="settings-layout">
        <section class="settings-group panel" aria-labelledby="display-title">
          <div class="panel-heading"><div><span class="eyebrow">01 / TRỢ NĂNG</span><h2 id="display-title">Hiển thị & âm thanh</h2></div><span class="panel-code">CỤC BỘ</span></div>
          <div class="setting-row"><div class="setting-copy"><label for="font-size">Cỡ chữ</label><p>Điều chỉnh kích thước chữ giao diện.</p></div><div class="setting-control range-control"><input id="font-size" type="range" min="14" max="22" step="1" value="${settings.fontSize}" /><output id="font-size-output" for="font-size">${settings.fontSize}px</output></div></div>
          <div class="setting-row"><div class="setting-copy"><label for="sound-toggle">Âm thanh</label><p>Phát âm báo ngắn sau khi có phản hồi hành động.</p></div><label class="toggle"><input id="sound-toggle" type="checkbox" ${settings.sound ? "checked" : ""} /><span class="toggle-track" aria-hidden="true"></span><span class="toggle-value">${settings.sound ? "BẬT" : "TẮT"}</span></label></div>
          <div class="setting-row"><div class="setting-copy"><label for="volume">Âm lượng</label><p>Điều chỉnh âm báo giao diện.</p></div><div class="setting-control range-control"><input id="volume" type="range" min="0" max="100" step="1" value="${settings.volume}" /><output id="volume-output" for="volume">${settings.volume}%</output></div></div>
          <div class="setting-row"><div class="setting-copy"><label for="reduced-motion">Giảm chuyển động</label><p>Giảm hiệu ứng và chuyển cảnh trang trí.</p></div><label class="toggle"><input id="reduced-motion" type="checkbox" ${settings.reducedMotion ? "checked" : ""} /><span class="toggle-track" aria-hidden="true"></span><span class="toggle-value">${settings.reducedMotion ? "BẬT" : "TẮT"}</span></label></div>
        </section>
        <section class="settings-group panel" aria-labelledby="network-title">
          <div class="panel-heading"><div><span class="eyebrow">02 / KẾT NỐI</span><h2 id="network-title">Địa chỉ máy chủ</h2></div><span class="panel-code">THỬ NGHIỆM</span></div>
          <div class="network-settings">
            <label class="field-label" for="server-address">ĐỊA CHỈ MÁY CHỦ</label>
            <input class="text-field" id="server-address" type="text" autocomplete="url" spellcheck="false" />
            <button class="secondary-button" data-action="test-connection">KIỂM TRA KẾT NỐI <span aria-hidden="true">↗</span></button>
            <p class="mock-callout"><span aria-hidden="true">i</span> CHỈ MÔ PHỎNG, KHÔNG GỬI YÊU CẦU ĐẾN MÁY CHỦ.</p>
            <p class="connection-notice" id="connection-notice" role="status" aria-live="polite">${connectionNotice}</p>
          </div>
        </section>
      </div>
      <p class="screen-footnote">TÙY CHỌN ĐƯỢC LƯU TRÊN TRÌNH DUYỆT NÀY. ĐỊA CHỈ MÁY CHỦ CHƯA ĐƯỢC SỬ DỤNG.</p>
    </section>`;
}

function lobbyHomeScreen() {
  return `
    <section class="content-screen lobby-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">NHIỀU NGƯỜI CHƠI // VÀO PHÒNG</span><h1 id="screen-title">Thiết lập <span>kết nối.</span></h1><p>Tạo phòng và chia sẻ mã, hoặc nhập mã phòng của người chơi khác.</p></div>
        <button class="utility-button" data-screen="home">← <span>VỀ MENU</span></button>
      </div>
      <div class="lobby-choice-grid">
        <article class="lobby-action panel"><span class="panel-code">TẠO PHÒNG / 01</span><span class="lobby-symbol" aria-hidden="true">＋</span><h2>Tạo phòng</h2><p>Tạo mã phòng thử và chờ người chơi thứ hai.</p><button class="primary-button" data-action="create-room">TẠO PHÒNG <span aria-hidden="true">→</span></button></article>
        <article class="lobby-action panel"><span class="panel-code">VÀO PHÒNG / 02</span><span class="lobby-symbol amber-symbol" aria-hidden="true">⌁</span><h2>Vào phòng</h2><p>Nhập mã phòng do chủ phòng chia sẻ.</p><button class="secondary-button" data-screen="join-room">NHẬP MÃ PHÒNG <span aria-hidden="true">→</span></button></article>
      </div>
      <div class="mock-banner"><span class="mock-banner-mark">THỬ</span><span>Phòng và kết nối được mô phỏng tại máy này.</span></div>
    </section>`;
}

function joinRoomScreen(errorResult = null) {
    const errorMarkup = errorResult ? `
    <div class="room-error" role="alert">
      <div class="error-heading"><span class="error-symbol" aria-hidden="true">!</span><div><strong>${escapeHtml(errorResult.details?.title || errorResult.code)}</strong><span>${escapeHtml(errorResult.code)}</span></div></div>
      <p>${escapeHtml(localizeText(errorResult.message))}</p><p class="error-hint">${escapeHtml(localizeText(errorResult.details?.hint || "Kiểm tra mã phòng rồi thử lại."))}</p>
    </div>` : "";
  return `
    <section class="content-screen join-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">NHIỀU NGƯỜI CHƠI // VÀO PHÒNG</span><h1 id="screen-title">Vào <span>phòng.</span></h1><p>Nhập mã phòng của chủ phòng để xin tham gia.</p></div>
        <button class="utility-button" data-screen="lobby">← <span>QUAY LẠI</span></button>
      </div>
      <form class="join-form panel" id="join-form">
        <label class="field-label" for="room-code">MÃ PHÒNG</label>
        <input class="room-code-input" id="room-code" name="room-code" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Ví dụ: MOCK-7K2Q" value="${escapeHtml(joinCodeValue)}" ${lobbyBusy ? "disabled" : ""} />
        <p class="field-note">Mã thử: MOCK-7K2Q vào phòng; FULL-0000 và LINK-0000 minh họa lỗi.</p>
        ${errorMarkup}
        <div class="join-actions"><button class="primary-button" type="submit" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "ĐANG KIỂM TRA PHÒNG…" : "VÀO PHÒNG"}<span aria-hidden="true">→</span></button><button class="utility-button" type="button" data-screen="lobby" ${lobbyBusy ? "disabled" : ""}>HỦY</button></div>
      </form>
      <p class="screen-footnote">MÃ PHÒNG VÀ LỖI TRÊN MÀN HÌNH NÀY LÀ DỮ LIỆU THỬ.</p>
    </section>`;
}

function creatingRoomScreen() {
  return `
    <section class="content-screen initializing-screen" aria-live="polite"><div class="initializing-card panel"><span class="eyebrow amber-eyebrow">DỊCH VỤ PHÒNG // THỬ NGHIỆM</span><span class="initializing-mark" aria-hidden="true">⌁</span><h1>Đang tạo <span>phòng.</span></h1><p>Đang chờ phản hồi…</p></div></section>`;
}

function waitingRoomScreen() {
  const status = lobbyBusy ? "ĐANG CHỜ PHẢN HỒI…" : "ĐANG CHỜ NGƯỜI CHƠI THỨ HAI";
  return `
    <section class="content-screen waiting-screen" aria-labelledby="screen-title">
      <div class="waiting-layout panel">
        <div class="waiting-main">
          <span class="eyebrow amber-eyebrow">NHIỀU NGƯỜI CHƠI // CHỦ PHÒNG</span>
          <h1 id="screen-title">Phòng đã <span>sẵn sàng.</span></h1>
          <p class="waiting-description">Chia sẻ mã này với người chơi còn lại. Trận đấu bắt đầu khi cả hai đã kết nối.</p>
          <span class="field-label">MÃ PHÒNG <span class="mock-inline">THỬ</span></span>
          <div class="room-code-display" id="created-room-code">${lobbyState?.roomCode || "—"}</div>
          <button class="copy-button" data-action="copy-room">▣ <span>SAO CHÉP MÃ</span></button>
          <p class="copy-notice" id="copy-notice" role="status" aria-live="polite">Sao chép mã để chia sẻ phòng thử này.</p>
          <div class="player-wait-state"><span class="wait-ring" aria-hidden="true"></span><div><strong>${status}</strong><span>Phòng sẽ hoạt động đến khi yêu cầu hủy được xác nhận.</span></div></div>
          <div class="waiting-actions"><button class="utility-button" data-action="cancel-room" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "ĐANG CHỜ PHẢN HỒI…" : "HỦY PHÒNG"}</button></div>
        </div>
        ${window.mockDemoAdapter ? `<aside class="demo-controls"><span class="eyebrow">ĐIỀU KHIỂN THỬ</span><p>Mô phỏng sự kiện từ người chơi khác hoặc máy chủ.</p><button class="secondary-button" data-action="simulate-join" ${lobbyBusy ? "disabled" : ""}>MÔ PHỎNG NGƯỜI CHƠI VÀO <span aria-hidden="true">→</span></button><button class="utility-button demo-link-button" data-action="simulate-link-loss" ${lobbyBusy ? "disabled" : ""}>MÔ PHỎNG MẤT KẾT NỐI</button><span class="panel-code">CHỈ THỬ / NGOẠI TUYẾN</span></aside>` : ""}
      </div>
      <p class="screen-footnote">Không có nút sẵn sàng hoặc bắt đầu. Trận chuyển tiếp khi xác nhận đủ hai người chơi.</p>
    </section>`;
}

function linkLostScreen() {
  return `
    <section class="content-screen link-lost-screen" aria-labelledby="screen-title">
      <div class="link-lost-card panel"><span class="eyebrow danger-eyebrow">NHIỀU NGƯỜI CHƠI // MẤT KẾT NỐI</span><span class="link-lost-icon" aria-hidden="true">×</span><h1 id="screen-title">Kết nối <span>bị gián đoạn.</span></h1><p>${localizeText(matchLinkLost ? matchLinkNotice : "Kết nối phòng thử bị mất. Trạng thái phòng chưa được xác nhận; màn hình này không khẳng định phòng đã được giải phóng.")}</p><div class="link-lost-actions">${matchLinkLost ? `<button class="primary-button" data-action="check-match-result" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "ĐANG KIỂM TRA KẾT QUẢ…" : "KIỂM TRA KẾT QUẢ TRẬN"}</button>` : `<button class="primary-button" data-action="retry-lobby" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "ĐANG CHỜ PHẢN HỒI…" : "THỬ LẠI"}</button>`}<button class="utility-button" data-screen="home" ${lobbyBusy ? "disabled" : ""}>VỀ MENU</button></div><p class="screen-footnote">${matchLinkLost ? "KẾT QUẢ TRẬN CHƯA XÁC MINH" : "CHƯA XÁC NHẬN ĐÃ HỦY PHÒNG"}</p></div>
    </section>`;
}

function matchResultScreen() {
  const result = matchResult || {};
  const verified = result.verified === true;
  const outcome = resultLabel(verified ? (result.outcome || "Outcome unavailable") : "Result unverified");
  const fields = [
    ["LÝ DO", reasonLabel(result.reason)], ["MÃ SỰ KIỆN", result.eventCode],
    ["ĐIỂM CỦA BẠN", result.playerScore], ["ĐIỂM ĐỐI THỦ", result.opponentScore],
    ["SỐ VÒNG", result.rounds], ["TỔNG ĐÃ NỘP", result.totalDeposited],
  ].filter(([, value]) => value !== undefined && value !== null);
  const details = fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  return `<section class="content-screen result-screen" aria-labelledby="screen-title"><article class="match-result-card panel ${verified ? "result-verified" : "result-unverified"}"><span class="eyebrow ${verified ? "amber-eyebrow" : "danger-eyebrow"}">NHIỀU NGƯỜI CHƠI // ${verified ? "KẾT QUẢ MÁY CHỦ" : "TRẠNG THÁI KẾT QUẢ"}</span><span class="result-mark" aria-hidden="true">${verified ? "✦" : "?"}</span><h1 id="screen-title">${escapeHtml(outcome)}</h1><p>${verified ? "Kết quả thử này được đánh dấu xác minh." : "Chưa xác minh được kết quả. Không suy đoán người thắng hoặc điểm số."}</p>${details ? `<dl class="match-result-details">${details}</dl>` : ""}<div class="link-lost-actions"><button class="primary-button" data-action="copy-match-summary">SAO CHÉP TÓM TẮT TRẬN</button><button class="utility-button" data-screen="home">VỀ MENU</button></div><p class="summary-notice" role="status" aria-live="polite">${escapeHtml(localizeText(summaryNotice || (verified ? "KẾT QUẢ THỬ ĐÃ XÁC MINH" : "KẾT QUẢ THỬ CHƯA RÕ")))}</p></article></section>`;
}

function matchDemoControls() {
  if (!window.mockDemoAdapter) return "";
  return `<aside class="match-demo-controls panel"><span class="eyebrow">KẾT QUẢ / TÌNH HUỐNG KẾT NỐI</span><p>Dữ liệu thử để xem kết quả xác minh và tình huống mất kết nối.</p><div class="match-demo-buttons"><button data-action="result-fixture" data-outcome="victory">CHIẾN THẮNG</button><button data-action="result-fixture" data-outcome="defeat">THẤT BẠI</button><button data-action="result-fixture" data-outcome="draw">HÒA</button><button data-action="result-fixture" data-outcome="unknown">CHƯA XÁC MINH</button><button data-action="match-link-loss">MÔ PHỎNG MẤT KẾT NỐI</button></div></aside>`;
}

function matchResultSummary(result) {
  const lines = [`TÓM TẮT TRẬN SPACE WAR`, `TRẠNG THÁI: ${result.verified === true ? "ĐÃ XÁC MINH" : "CHƯA XÁC MINH"}`];
  if (result.outcome !== undefined) lines.push(`KẾT QUẢ: ${resultLabel(result.outcome)}`);
  for (const [label, key] of [["LÝ DO", "reason"], ["MÃ SỰ KIỆN", "eventCode"], ["ĐIỂM CỦA BẠN", "playerScore"], ["ĐIỂM ĐỐI THỦ", "opponentScore"], ["SỐ VÒNG", "rounds"], ["TỔNG ĐÃ NỘP", "totalDeposited"]]) {
    if (result[key] !== undefined && result[key] !== null) lines.push(`${label}: ${key === "reason" ? reasonLabel(result[key]) : result[key]}`);
  }
  return lines.join("\n");
}

function initializingScreen() {
  return `
    <section class="content-screen initializing-screen" aria-live="polite"><div class="initializing-card panel"><span class="eyebrow amber-eyebrow">BẮT TAY TRẬN ĐẤU // THỬ</span><span class="initializing-mark" aria-hidden="true">⊕</span><h1>Người chơi đã <span>kết nối.</span></h1><p>Đang khởi tạo giao diện trận đấu…</p></div></section>`;
}

function renderMapPreview(view) {
  return `
    <div class="map-canvas-wrap"><canvas id="tactical-canvas" class="tactical-canvas" tabindex="0" role="img" aria-label="Bản đồ chiến thuật. Nhấp ô để chọn; kéo để di chuyển bản đồ; dùng con lăn để thu phóng. Khi đặt tiêu điểm bàn phím, dùng phím mũi tên để dịch chuyển và Enter để chọn ô giữa."></canvas></div>
    <div class="map-legend" aria-label="Chú giải bản đồ"><span><b class="legend-earth">⊕</b> TRÁI ĐẤT</span><span><b class="legend-ship">▲</b> TÀU CỦA BẠN</span><span><b class="legend-mining">◆</b> KHAI THÁC</span><span><b class="legend-energy">◇</b> NĂNG LƯỢNG</span><span><b class="legend-rare">◈</b> HIẾM</span><span>Ô CHƯA BIẾT ĐỂ TRỐNG</span></div>`;
}

function getCellInfo(view, cell) {
  if (!cell) return null;
  if (cell.x === view.earth.x && cell.y === view.earth.y) return { status: "EARTH", object: null };
  if (cell.x === view.player.position.x && cell.y === view.player.position.y) return { status: "OWN SHIP", object: null };
  const planet = view.knownPlanets.find((item) => item.position.x === cell.x && item.position.y === cell.y);
  if (planet) return { status: "KNOWN PLANET", object: planet };
  return { status: "UNKNOWN", object: null };
}

function targetPreviewPanel(view) {
  if (!selectedCell) {
    return `<div class="target-empty"><span class="target-crosshair" aria-hidden="true">＋</span><strong>CHỌN MỘT Ô</strong><span>Chưa chọn mục tiêu</span></div>`;
  }
  const info = getCellInfo(view, selectedCell);
  if (info.status === "KNOWN PLANET") {
    const planet = info.object;
    const stock = selectedCell.x === view.player.position.x && selectedCell.y === view.player.position.y
      ? view.player.currentPlanetStock
      : null;
    const stockValue = stock
      ? (Object.entries(stock).filter(([, amount]) => amount > 0).map(([type, amount]) => `${resourceLabel(type)} ${amount}`).join(" · ") || "HẾT")
      : selectedCell.x === view.player.position.x && selectedCell.y === view.player.position.y
        ? "CHƯA RÕ · không có trong dữ liệu lượt xem"
        : "CHƯA RÕ · tàu không ở hành tinh";
    return `<div class="target-state target-known"><span class="target-glyph" aria-hidden="true">◆</span><div><span class="field-label">TRẠNG THÁI Ô</span><strong>${cellStatusLabel(info.status)}</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y}) · ${planet.id}</span></div></div><dl class="target-details"><div><dt>LOẠI</dt><dd>${planetLabel(planet.type)}</dd></div><div><dt>PHÁT HIỆN BẰNG</dt><dd>${planetLabel(planet.discoveredBy)}</dd></div><div><dt>TÀI NGUYÊN</dt><dd class="unknown-value">${stockValue}</dd></div></dl>`;
  }
  const glyph = info.status === "EARTH" ? "⊕" : info.status === "OWN SHIP" ? "▲" : "□";
  return `<div class="target-state ${info.status === "UNKNOWN" ? "target-unknown" : ""}"><span class="target-glyph" aria-hidden="true">${glyph}</span><div><span class="field-label">TRẠNG THÁI Ô</span><strong>${cellStatusLabel(info.status)}</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y})</span></div></div>${info.status === "UNKNOWN" ? '<p class="target-note">Chưa có thông tin về ô này.</p>' : ""}`;
}

const commandDefinitions = [
  ["MOVE", "1 AP · 2 PIN", ""],
  ["OBSERVE", "1 AP · 1 PIN", ""],
  ["SCAN_AREA", "2 AP · 3 PIN", ""],
  ["SCAN_NEAREST", "2 AP · 3 PIN", ""],
  ["SCAN_OPPONENT", "3 AP · 3 PIN", ""],
  ["MINE", "2 AP · 1 PIN", ""],
  ["DEPOSIT", "1 AP · 0–2 PIN", ""],
  ["RECHARGE", "1 AP · 0 PIN", ""],
  ["END_TURN", "0 AP · 0 PIN", ""],
];

function commandEchoMarkup() {
  if (!commandEcho) return "";
  const outcome = commandEcho.ok ? "ĐÃ CHẤP NHẬN" : "BỊ TỪ CHỐI";
  const tone = commandEcho.ok ? "echo-accepted" : "echo-rejected";
  return `<div class="command-echo ${tone}" role="status"><span class="echo-label">PHẢN HỒI LỆNH / ${outcome}</span><strong>${escapeHtml(actionLabel(commandEcho.action))}</strong><span>${escapeHtml(localizeText(commandEcho.target))} · ${escapeHtml(commandEcho.code)}</span><p>${escapeHtml(localizeText(commandEcho.message))}</p></div>`;
}

function toastMarkup() {
  if (!activeToast) return "";
  const repeat = activeToast.count > 1 ? `<span class="toast-count">×${activeToast.count}</span>` : "";
  const role = activeToast.level === "warning" || activeToast.level === "error" ? "alert" : "status";
  const levelLabel = { info: "THÔNG TIN", success: "THÀNH CÔNG", warning: "CẢNH BÁO", error: "LỖI" }[activeToast.level] || activeToast.level;
  return `<article class="terminal-toast toast-${activeToast.level}" role="${role}"><span class="toast-level">${levelLabel}</span><div><strong>${escapeHtml(localizeText(activeToast.title))}</strong><p>${escapeHtml(localizeText(activeToast.message))}</p></div>${repeat}<button type="button" data-action="dismiss-toast" aria-label="Đóng thông báo">×</button></article>`;
}

function renderToastRegion() {
  const region = root.querySelector("#toast-region");
  if (!region) return;
  region.innerHTML = toastMarkup();
  region.hidden = !activeToast;
}

function advanceToast() {
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = null;
  activeToast = toastQueue.shift() || null;
  renderToastRegion();
  if (activeToast) toastTimer = window.setTimeout(advanceToast, 4200);
}

function enqueueToast(toast) {
  const now = Date.now();
  const key = `${toast.level}:${toast.code || toast.title}`;
  if (toast.level === "warning" || toast.level === "error") {
    if (activeToast?.key === key) {
      activeToast.count += 1;
      activeToast.message = toast.message;
      renderToastRegion();
      return;
    }
    const queued = toastQueue.find((item) => item.key === key);
    if (queued) { queued.count += 1; queued.message = toast.message; return; }
    const previous = recentToastKeys.get(key);
    if (previous && now - previous < 5000) return;
    recentToastKeys.set(key, now);
  }
  const item = { ...toast, key, count: 1 };
  if (!activeToast) {
    activeToast = item;
    renderToastRegion();
    toastTimer = window.setTimeout(advanceToast, 4200);
  } else if (toastQueue.length < 4) {
    toastQueue.push(item);
  }
}

function dismissToast() { advanceToast(); }

function showAdapterNotification(notice = {}) {
  enqueueToast({ level: notice.level || "info", title: notice.title || "SERVER NOTICE", message: notice.message || "", code: notice.code || "SERVER_NOTIFICATION" });
}

function playFeedbackTone(isSuccess) {
  if (!settings.sound || settings.volume <= 0) return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  try {
    audioContext ||= new AudioContextType();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(isSuccess ? 660 : 235, now);
    oscillator.frequency.exponentialRampToValueAtTime(isSuccess ? 880 : 175, now + 0.12);
    gain.gain.setValueAtTime((settings.volume / 100) * 0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  } catch {
    // Audio is optional; visual response feedback remains available.
  }
}

function isMotionReduced() {
  return settings.reducedMotion || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function startActionEffects(action, previousView, nextView) {
  if (isMotionReduced()) { activeEffects = []; return; }
  const startedAt = performance.now();
  if (action === "MOVE") {
    activeEffects = activeEffects.filter((effect) => effect.type !== "move");
    activeEffects.push({ type: "move", from: { ...previousView.player.position }, to: { ...nextView.player.position }, startedAt, duration: 620 });
  }
  if (["OBSERVE", "SCAN_AREA", "SCAN_NEAREST", "SCAN_OPPONENT"].includes(action)) {
    const radius = action === "OBSERVE" ? 3 : action === "SCAN_AREA" ? 8 : null;
    activeEffects.push({ type: "scan", center: { ...previousView.player.position }, radius, startedAt, duration: 760 });
  }
  const knownIds = new Set(previousView.knownPlanets.map((planet) => planet.id));
  const discovered = nextView.knownPlanets.filter((planet) => !knownIds.has(planet.id));
  for (const planet of discovered) activeEffects.push({ type: "discovery", position: { ...planet.position }, startedAt, duration: 1050 });
}

function formatActionResult(action, response) {
  if (!response.ok) return `${response.error.code} · ${localizeText(response.error.message)}`;
  const report = response.actionReport || {};
  const result = report.result || {};
  if (result.kind === "Moved") return `Đã di chuyển đến (${result.position.x}, ${result.position.y}).`;
  if (result.kind === "PlanetsFound") return result.planets.length ? `Đã phát hiện ${result.planets.length} hành tinh mới.` : "Quét xong; không tìm thấy hành tinh mới.";
  if (result.kind === "Mined") return `Đã thu được ${result.amount} ${resourceLabel(result.resource)}.`;
  if (result.kind === "Deposited") return `Đã nộp hàng; +${result.scoreAdded} điểm Trái Đất.`;
  if (result.kind === "Recharged") return `Pin +${result.batteryAdded}; đã dùng ${result.amount} ${resourceLabel(result.resource)}.`;
  if (result.kind === "TurnEnded") return "Đã kết thúc lượt; đang chờ đối thủ.";
  return localizeText(report.message || `Đã hoàn tất: ${actionLabel(action)}.`);
}

function addLocalActionEvent(code, text) {
  const now = new Date();
  const time = `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  localActionEvents.unshift({ time, kind: "WARN", code, text });
  localActionEvents = localActionEvents.slice(0, 20);
}

function setCommandEcho(action, target, response) {
  commandEcho = {
    ok: response.ok,
    action,
    target,
    code: response.ok ? response.actionReport?.code || "ACTION_CONFIRMED" : response.error.code,
    message: formatActionResult(action, response),
  };
}

function playActionFeedback(action, response, previousView, nextView) {
  const report = response.actionReport || {};
  const found = response.ok && report.result?.kind === "PlanetsFound" ? (report.result.planets || []) : [];
  if (response.ok) {
    startActionEffects(action, previousView, nextView);
    const discovered = found.length > 0;
    enqueueToast({
      level: discovered ? "success" : "info",
      title: discovered ? "ĐÃ PHÁT HIỆN HÀNH TINH" : `${actionLabel(action)} ĐÃ XÁC NHẬN`,
      message: discovered ? `Đã thêm ${found.length} hành tinh mới vào bản đồ.` : localizeText(report.message),
      code: discovered ? "PLANET_DISCOVERED" : report.code,
    });
    for (const notice of response.notifications || []) {
      showAdapterNotification(notice);
    }
  } else {
    enqueueToast({ level: "warning", title: "HÀNH ĐỘNG BỊ TỪ CHỐI", message: `${response.error.code} · ${localizeText(response.error.message)}`, code: response.error.code });
  }
  playFeedbackTone(response.ok);
}

function commandSummaryMarkup(view) {
  const locked = actionFlow.status === "pending" || !view.turn.isMyTurn;
  const commands = commandDefinitions.map(([name, cost]) => `
    <button class="command-option" type="button" data-command="${name}" ${locked ? "disabled" : ""} aria-pressed="${actionFlow.selected === name}">
      <strong>${actionLabel(name)}</strong><span>${cost}</span>
    </button>`).join("");
  const selected = actionFlow.selected;
  let detail = `<p class="command-note"><span class="notice-icon" aria-hidden="true">◇</span><span>Chọn hành động để xem mục tiêu và chi phí. Chế độ thử nghiệm.</span></p>`;
  if (selected) {
    const target = selected === "MOVE" && selectedCell
      ? `(${selectedCell.x}, ${selectedCell.y})`
      : selected === "MOVE" ? "Chưa chọn ô" : selected === "DEPOSIT" ? "Toàn bộ hàng" : selected === "RECHARGE" ? "Kho Trái Đất" : "—";
    const cost = selected === "DEPOSIT" && distanceBetween(view.player.position, view.earth) > 0
      ? "1 AP · 2 PIN"
      : commandDefinitions.find(([name]) => name === selected)?.[1];
    const result = actionFlow.result ? `<div class="action-result ${actionFlow.result.ok ? "result-success" : "result-error"}" role="status"><strong>${actionFlow.result.ok ? "ĐÃ CHẤP NHẬN" : escapeHtml(actionFlow.result.error.code)}</strong><span>${escapeHtml(actionFlow.result.ok ? localizeText(actionFlow.result.actionReport?.message || "Lệnh đã được chấp nhận.") : localizeText(actionFlow.result.error.message))}</span></div>` : "";
    const recharge = selected === "RECHARGE" ? rechargeControlsMarkup(view) : "";
    const pendingMarkup = actionFlow.status === "pending" ? `<div class="action-pending" role="status" aria-live="polite"><span class="wait-ring" aria-hidden="true"></span><span>ĐANG CHỜ PHẢN HỒI… Các lệnh đang tạm khóa.</span></div>` : "";
    const isModal = actionFlow.status === "confirming";
    detail = `
      <div class="action-summary">
        <div class="action-summary-heading"><span class="field-label">TÓM TẮT LỆNH</span><strong>${actionLabel(selected)}</strong></div>
        <dl><div><dt>MỤC TIÊU</dt><dd>${escapeHtml(target)}</dd></div><div><dt>CHI PHÍ</dt><dd>${escapeHtml(cost || "—")}</dd></div></dl>
        ${recharge}
        ${!isModal && actionFlow.status !== "pending" ? `<div class="action-controls"><button class="primary-button" type="button" data-action="${["DEPOSIT", "RECHARGE", "END_TURN"].includes(selected) ? "review-command" : "send-command"}" ${locked ? "disabled" : ""}>${["DEPOSIT", "RECHARGE", "END_TURN"].includes(selected) ? "XEM LẠI & XÁC NHẬN" : "GỬI LỆNH THỬ"} <span aria-hidden="true">→</span></button><button class="utility-button" type="button" data-action="clear-command" ${locked ? "disabled" : ""}>BỎ CHỌN LỆNH</button></div>` : ""}
        ${pendingMarkup}${result}
      </div>`;
  }
  return `<div class="command-list">${commands}</div><div class="command-interaction">${detail}${commandEchoMarkup()}</div>`;
}

function distanceBetween(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function rechargeControlsMarkup(view) {
  const storage = view.player.earthStorage || {};
  const resources = Object.keys(storage).filter((type) => storage[type] > 0);
  if (!resources.length) return `<p class="field-note recharge-empty">Kho Trái Đất không còn tài nguyên để sạc.</p>`;
  if (!resources.includes(rechargeSelection.resource)) rechargeSelection = { resource: resources[0], amount: 1 };
  const amountAvailable = storage[rechargeSelection.resource] || 0;
  rechargeSelection.amount = Math.max(1, Math.min(amountAvailable, Number(rechargeSelection.amount) || 1));
  const points = window.gameAdapter.resourceValue(rechargeSelection.resource) * Number(rechargeSelection.amount) * 2;
  return `<div class="recharge-controls"><label>TÀI NGUYÊN<select id="recharge-resource">${resources.map((type) => `<option value="${escapeHtml(type)}" ${type === rechargeSelection.resource ? "selected" : ""}>${escapeHtml(resourceLabel(type))} · ${storage[type]} đơn vị</option>`).join("")}</select></label><label>SỐ LƯỢNG<input id="recharge-amount" type="number" min="1" max="${amountAvailable}" step="1" value="${rechargeSelection.amount}" /></label><span class="recharge-preview">TỐI ĐA +${points} PIN · −${Number(rechargeSelection.amount) * window.gameAdapter.resourceValue(rechargeSelection.resource)} ĐIỂM</span></div>`;
}

function confirmationDialogMarkup(view) {
  if (actionFlow.status !== "confirming" || !actionFlow.selected) return "";
  const action = actionFlow.selected;
  const args = getActionArgs(action);
  const cost = action === "DEPOSIT" && distanceBetween(view.player.position, view.earth) > 0 ? "1 AP · 2 PIN" : commandDefinitions.find(([name]) => name === action)?.[1];
  let summary = action === "DEPOSIT"
    ? `Nộp toàn bộ ${view.player.cargoUsed} đơn vị hàng vào kho Trái Đất? Điểm chỉ thay đổi sau phản hồi.`
    : action === "END_TURN" ? "Kết thúc lượt ngay? Các lệnh sẽ tạm khóa đến khi có phản hồi."
      : `Dùng ${args.amount} ${resourceLabel(args.resource)} từ kho Trái Đất để sạc? Pin vượt tối đa sẽ mất.`;
  return `<dialog id="action-confirm-dialog" class="terminal-dialog action-confirm-dialog" aria-labelledby="action-confirm-title"><div class="dialog-card panel"><span class="eyebrow amber-eyebrow">XÁC NHẬN LỆNH</span><h2 id="action-confirm-title">Xác nhận ${actionLabel(action)}</h2><p>${escapeHtml(summary)}</p><div class="confirmation-cost"><span>CHI PHÍ</span><strong>${escapeHtml(cost || "—")}</strong></div><div class="action-controls"><button class="primary-button" type="button" data-action="confirm-command">XÁC NHẬN & GỬI</button><button class="utility-button" type="button" data-action="cancel-confirmation">HỦY</button></div><p class="screen-footnote">Trạng thái chỉ đổi sau khi có phản hồi.</p></div></dialog>`;
}

function getActionArgs(action) {
  if (action === "MOVE") return { target: selectedCell ? { ...selectedCell } : null };
  if (action === "RECHARGE") return { resource: rechargeSelection.resource, amount: Number(rechargeSelection.amount) };
  return {};
}

function gameScreen() {
  const view = playerView;
  const player = view.player;
  const cargoItems = Object.entries(player.cargo);
  const cargoRows = cargoItems.map(([name, amount]) => `<li><span>${resourceLabel(name)}</span><b>${amount}</b></li>`).join("");
  const apWidth = Math.round((player.ap / player.apMax) * 100);
  const batteryWidth = Math.round((player.battery / player.batteryMax) * 100);
  const cargoWidth = Math.round((player.cargoUsed / player.cargoCapacity) * 100);
  const scoreWidth = Math.round((player.earthScore / player.earthScoreTarget) * 100);
  const selectedInfo = getCellInfo(view, selectedCell);
  const allEvents = [...localActionEvents, ...view.recentEvents];
  const events = allEvents.slice(0, eventLogExpanded ? 40 : 4).map((event) => `
    <li class="event-row event-${event.kind.toLowerCase()}">
      <time>[${event.time}]</time><span class="event-kind">[${eventKindLabels[event.kind] || event.kind}]</span><div><code>${event.code}</code><p>${localizeText(event.text)}</p></div>
    </li>`).join("");
  const overviewMarkup = sectorOverviewOpen ? `
    <dialog id="sector-overview" class="sector-dialog" aria-labelledby="overview-title">
      <div class="overview-dialog-panel panel">
        <div class="panel-heading"><div><span class="eyebrow amber-eyebrow">TOÀN KHU VỰC</span><h2 id="overview-title">Bản đồ tổng quan</h2></div><button class="utility-button" data-action="close-overview" autofocus>ĐÓNG <span aria-hidden="true">×</span></button></div>
        <p class="overview-note">Tọa độ 0–99 · X tăng sang phải · Y tăng xuống dưới. Chỉ hiện Trái Đất, tàu của bạn và hành tinh đã khám phá. Ô chưa biết vẫn được giữ kín. Không thể chọn ô trong chế độ này.</p>
        <div class="overview-canvas-wrap"><canvas id="overview-canvas" class="overview-canvas" role="img" aria-label="Bản đồ tổng quan chỉ hiển thị Trái Đất, tàu của bạn và hành tinh đã khám phá. Không thể chọn ô trong chế độ này."></canvas></div>
        <div class="map-legend"><span><b class="legend-earth">⊕</b> TRÁI ĐẤT</span><span><b class="legend-ship">▲</b> TÀU CỦA BẠN</span><span><b class="legend-mining">◆</b> KHAI THÁC</span><span><b class="legend-energy">◇</b> NĂNG LƯỢNG</span><span><b class="legend-rare">◈</b> HIẾM</span><span>Ô CHƯA BIẾT ĐỂ TRỐNG</span></div>
      </div>
    </dialog>` : "";

  return `
    <section class="game-screen" aria-label="Giao diện trận đấu thử">
      <div class="game-turnbar panel"><div class="turn-readout"><span class="eyebrow">VÒNG</span><strong>${String(view.turn.round).padStart(2, "0")} <small>/ ${view.turn.roundMax}</small></strong></div><div class="turn-divider"></div><div class="turn-status"><span class="status-indicator"></span><div><strong>${view.turn.isMyTurn ? "LƯỢT CỦA BẠN" : "LƯỢT ĐỐI THỦ"}</strong><span>${view.turn.activePlayer === "Player 1" ? "NGƯỜI CHƠI 1" : "NGƯỜI CHƠI 2"} · TRẬN THỬ</span></div></div><div class="turn-right"><span class="field-label">PHIÊN</span><strong>TRẬN ĐẤU</strong><button class="utility-button game-leave-button" data-action="leave-room" ${lobbyBusy || pendingAction ? "disabled" : ""}>RỜI TRẬN THỬ</button></div></div>
      <div id="toast-region" class="toast-region" aria-live="polite" ${activeToast ? "" : "hidden"}>${toastMarkup()}</div>
      <div class="game-grid">
        <aside class="ship-hud panel" aria-labelledby="ship-hud-title">
          <div class="panel-heading"><h2 id="ship-hud-title">THÔNG TIN TÀU</h2></div>
          <div class="hud-content">
            <section class="hud-position"><span class="field-label">VỊ TRÍ TÀU</span><strong>(${player.position.x}, ${player.position.y})</strong></section>
            <div class="meter-block"><div class="meter-label"><span>AP</span><strong>${player.ap} <small>/ ${player.apMax}</small></strong></div><div class="meter-track" role="progressbar" aria-label="Điểm hành động" aria-valuemin="0" aria-valuemax="${player.apMax}" aria-valuenow="${player.ap}"><span style="width:${apWidth}%"></span></div></div>
            <div class="meter-block"><div class="meter-label"><span>PIN</span><strong>${player.battery} <small>/ ${player.batteryMax}</small></strong></div><div class="meter-track meter-amber" role="progressbar" aria-label="Pin" aria-valuemin="0" aria-valuemax="${player.batteryMax}" aria-valuenow="${player.battery}"><span style="width:${batteryWidth}%"></span></div></div>
            <div class="hud-section-title"><span>HÀNG HÓA</span><span>${player.cargoUsed} / ${player.cargoCapacity}</span></div>
            <div class="meter-track cargo-meter" role="progressbar" aria-label="Sức chứa hàng hóa" aria-valuemin="0" aria-valuemax="${player.cargoCapacity}" aria-valuenow="${player.cargoUsed}"><span style="width:${cargoWidth}%"></span></div>
            <ul class="cargo-list">${cargoRows || "<li><span>RỖNG</span><b>0</b></li>"}</ul>
            <section class="score-block"><div class="meter-label"><span>ĐIỂM TRÁI ĐẤT</span><strong>${player.earthScore} <small>/ ${player.earthScoreTarget}</small></strong></div><div class="meter-track score-meter" role="progressbar" aria-label="Điểm Trái Đất đến mục tiêu chiến thắng" aria-valuemin="0" aria-valuemax="${player.earthScoreTarget}" aria-valuenow="${player.earthScore}"><span style="width:${scoreWidth}%"></span></div></section>
          </div>
        </aside>

        <section class="tactical-panel panel" aria-labelledby="map-title">
          <div class="panel-heading map-panel-heading"><h2 id="map-title">BẢN ĐỒ CHIẾN THUẬT</h2><div class="map-controls"><button class="map-control-button" data-action="reset-to-ship" title="Đưa bản đồ về vị trí tàu">VỀ VỊ TRÍ TÀU</button><button class="map-control-button" data-action="open-overview">TOÀN KHU VỰC</button></div></div>
          <div class="map-preview">${renderMapPreview(view)}</div>
          <div class="cell-status-strip"><span class="field-label">Ô MỤC TIÊU</span><strong>${selectedCell ? `(${selectedCell.x}, ${selectedCell.y}) · ${cellStatusLabel(selectedInfo.status)}` : "CHƯA CHỌN Ô"}</strong><span id="hover-status" role="status" aria-live="polite">Chọn ô chỉ để xem · chưa gửi lệnh</span><button class="clear-target-button" data-action="clear-target" ${selectedCell ? "" : "hidden"}>BỎ CHỌN MỤC TIÊU</button></div>
        </section>

        <aside class="target-panel panel" aria-labelledby="target-title">
          <div class="panel-heading"><h2 id="target-title">THÔNG TIN MỤC TIÊU</h2></div>
          <div class="target-content">${targetPreviewPanel(view)}</div>
          <section class="opponent-status"><div class="opponent-heading"><span class="eyebrow">TRẠNG THÁI ĐỐI THỦ</span></div><div class="opponent-connection"><span class="status-indicator" aria-hidden="true"></span><strong>${escapeHtml(statusLabel(view.opponent?.connection || "unknown"))}</strong></div><p>Lượt: ${escapeHtml(statusLabel(view.opponent?.publicStatus || "unknown"))}</p></section>
        </aside>

        <section class="command-console panel" aria-labelledby="command-title">
          <div class="panel-heading"><h2 id="command-title">BẢNG HÀNH ĐỘNG</h2></div>
          ${commandSummaryMarkup(view)}
        </section>

        <section class="event-log panel ${eventLogExpanded ? "expanded" : ""}" aria-labelledby="event-log-title">
          <div class="panel-heading event-panel-heading"><h2 id="event-log-title">NHẬT KÝ SỰ KIỆN</h2><button class="event-toggle" type="button" data-action="toggle-event-log" aria-expanded="${eventLogExpanded}">${eventLogExpanded ? "THU GỌN" : "XEM THÊM"} · ${view.recentEvents.length}</button></div>
          <ol class="event-list">${events}</ol>
        </section>
      </div>
      <div class="game-statusbar"><span><span class="live-mark"></span> TRẠNG THÁI NGƯỜI CHƠI</span><span>${selectedCell ? `MỤC TIÊU: (${selectedCell.x}, ${selectedCell.y}) / ${cellStatusLabel(selectedInfo.status)}` : "CHỌN MỘT Ô / CHƯA CÓ MỤC TIÊU"}</span><span>${view.turn.isMyTurn ? "MẠNG NGOẠI TUYẾN" : "ĐANG CHỜ LƯỢT ĐỐI THỦ"}</span></div>
      ${window.mockDemoAdapter && !view.turn.isMyTurn && !pendingAction ? `<div class="opponent-turn-control"><span>Đang chờ lượt của Người chơi 2.</span><button class="utility-button" data-action="simulate-opponent-turn">MÔ PHỎNG LƯỢT ĐỐI THỦ</button></div>` : ""}
      ${matchDemoControls()}
    </section>${overviewMarkup}${confirmationDialogMarkup(view)}`;
}

function canvasContext(canvas) {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const pixelRatio = window.devicePixelRatio || 1;
  const canvasWidth = Math.round(width * pixelRatio);
  const canvasHeight = Math.round(height * pixelRatio);
  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawFeedbackEffects(ctx, width, height, cellSize, screenX, screenY, now) {
  for (const effect of activeEffects) {
    const progress = Math.max(0, Math.min(1, (now - effect.startedAt) / effect.duration));
    if (effect.type === "move") {
      const eased = 1 - Math.pow(1 - progress, 3);
      const x = effect.from.x + (effect.to.x - effect.from.x) * eased;
      const y = effect.from.y + (effect.to.y - effect.from.y) * eased;
      const fromX = screenX(effect.from.x), fromY = screenY(effect.from.y);
      const shipX = screenX(x), shipY = screenY(y);
      ctx.save();
      ctx.strokeStyle = `rgba(113, 255, 145, ${0.45 * (1 - progress)})`;
      ctx.lineWidth = Math.max(1, cellSize * 0.045);
      ctx.setLineDash([cellSize * 0.12, cellSize * 0.1]);
      ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(shipX, shipY); ctx.stroke();
      ctx.restore();
      drawMapGlyph(ctx, "ship", shipX, shipY, cellSize);
    } else if (effect.type === "scan") {
      const centerX = screenX(effect.center.x), centerY = screenY(effect.center.y);
      // A null radius is a viewport-wide decorative sweep, not scan-range feedback.
      const scanRadius = effect.radius === null ? Math.hypot(width, height) / (2 * cellSize) : effect.radius;
      const radius = Math.max(2, scanRadius * cellSize * progress);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 180, 94, ${0.7 * (1 - progress * 0.45)})`;
      ctx.lineWidth = Math.max(1, cellSize * 0.035);
      ctx.beginPath(); ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
      const angle = -Math.PI / 2 + progress * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius); ctx.stroke();
      ctx.restore();
    } else if (effect.type === "discovery") {
      const x = screenX(effect.position.x), y = screenY(effect.position.y);
      const radius = cellSize * (0.35 + progress * 0.85);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 220, 140, ${1 - progress})`;
      ctx.lineWidth = Math.max(1, cellSize * 0.04);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

function drawTacticalMap() {
  const canvas = root.querySelector("#tactical-canvas");
  if (!canvas) return;
  const now = performance.now();
  if (isMotionReduced()) activeEffects = [];
  activeEffects = activeEffects.filter((effect) => now - effect.startedAt < effect.duration);
  const isMoving = activeEffects.some((effect) => effect.type === "move");
  const { context: ctx, width, height } = canvasContext(canvas);
  const view = playerView;
  const cellSize = Math.min(width, height) / 9 * camera.zoom;
  const screenX = (x) => width / 2 + (x - camera.x) * cellSize;
  const screenY = (y) => height / 2 + (y - camera.y) * cellSize;
  const minX = Math.floor(camera.x - width / (2 * cellSize)) - 1;
  const maxX = Math.ceil(camera.x + width / (2 * cellSize)) + 1;
  const minY = Math.floor(camera.y - height / (2 * cellSize)) - 1;
  const maxY = Math.ceil(camera.y + height / (2 * cellSize)) + 1;

  ctx.fillStyle = "#07100b";
  ctx.fillRect(0, 0, width, height);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const left = screenX(x) - cellSize / 2;
      const top = screenY(y) - cellSize / 2;
      if (x < 0 || x > 99 || y < 0 || y > 99) {
        ctx.fillStyle = "rgba(1, 4, 2, 0.62)";
        ctx.fillRect(left, top, cellSize, cellSize);
      }
      ctx.strokeStyle = "rgba(63, 191, 107, 0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.ceil(cellSize), Math.ceil(cellSize));

      if (x < 0 || x > 99 || y < 0 || y > 99) continue;
      const centerX = screenX(x);
      const centerY = screenY(y);
      const isShip = x === view.player.position.x && y === view.player.position.y;
      const isEarth = x === view.earth.x && y === view.earth.y;
      const planet = view.knownPlanets.find((item) => item.position.x === x && item.position.y === y);
      if (isEarth) drawMapGlyph(ctx, "earth", centerX, centerY, cellSize);
      if (planet) drawMapGlyph(ctx, planet.type, centerX, centerY, cellSize);
      if (isShip && !isMoving) drawMapGlyph(ctx, "ship", centerX, centerY, cellSize);

      const isSelected = selectedCell?.x === x && selectedCell?.y === y;
      const isHovered = hoverCell?.x === x && hoverCell?.y === y;
      if (isHovered || isSelected) {
        ctx.strokeStyle = isSelected ? "#fff0a6" : "rgba(255, 180, 94, 0.82)";
        ctx.lineWidth = isSelected ? 2 : 1.5;
        const inset = Math.max(2, cellSize * 0.08);
        ctx.strokeRect(left + inset, top + inset, cellSize - inset * 2, cellSize - inset * 2);
      }
    }
  }

  drawFeedbackEffects(ctx, width, height, cellSize, screenX, screenY, now);

  ctx.fillStyle = "rgba(210, 229, 215, 0.62)";
  ctx.font = "10px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.fillText("X →", width - 12, 17);
  ctx.textAlign = "left";
  ctx.fillText("Y ↓", 12, height - 10);
  ctx.fillStyle = "rgba(139, 164, 147, 0.82)";
  ctx.textAlign = "left";
  ctx.fillText(`CENTER ${Math.round(camera.x)}, ${Math.round(camera.y)}  /  ZOOM ${camera.zoom.toFixed(1)}×`, 12, 17);
  if (activeEffects.length && !effectFrame) {
    effectFrame = window.requestAnimationFrame(() => {
      effectFrame = 0;
      drawTacticalMap();
    });
  }
}

function drawMapGlyph(ctx, kind, x, y, cellSize) {
  const radius = Math.max(4, Math.min(11, cellSize * 0.2));
  ctx.save();
  ctx.lineWidth = 1.5;
  if (kind === "ship") {
    ctx.fillStyle = "#71ff91";
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.8, y + radius * 0.7);
    ctx.lineTo(x, y + radius * 0.35);
    ctx.lineTo(x - radius * 0.8, y + radius * 0.7);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "earth") {
    ctx.strokeStyle = "#ffb45e";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - radius, y);
    ctx.lineTo(x + radius, y);
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x, y + radius);
    ctx.stroke();
  } else if (kind === "Mining") {
    ctx.fillStyle = "#ffb45e";
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.82);
    ctx.lineTo(x + radius * 0.82, y);
    ctx.lineTo(x, y + radius * 0.82);
    ctx.lineTo(x - radius * 0.82, y);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "Energy") {
    ctx.strokeStyle = "#71ff91";
    ctx.beginPath();
    for (let edge = 0; edge < 6; edge += 1) {
      const angle = Math.PI / 3 * edge - Math.PI / 2;
      const px = x + Math.cos(angle) * radius * 0.82;
      const py = y + Math.sin(angle) * radius * 0.82;
      if (edge === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#ffb45e";
    for (const factor of [0.82, 0.42]) {
      ctx.beginPath();
      ctx.moveTo(x, y - radius * factor);
      ctx.lineTo(x + radius * factor, y);
      ctx.lineTo(x, y + radius * factor);
      ctx.lineTo(x - radius * factor, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSectorOverview() {
  const canvas = root.querySelector("#overview-canvas");
  if (!canvas) return;
  const { context: ctx, width, height } = canvasContext(canvas);
  const view = playerView;
  const cellSize = Math.min(width, height) / 100;
  const offsetX = (width - cellSize * 100) / 2;
  const offsetY = (height - cellSize * 100) / 2;
  ctx.fillStyle = "#07100b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(63, 191, 107, 0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let cell = 0; cell <= 100; cell += 1) {
    const x = offsetX + cell * cellSize;
    const y = offsetY + cell * cellSize;
    ctx.moveTo(Math.round(x) + 0.5, offsetY);
    ctx.lineTo(Math.round(x) + 0.5, offsetY + cellSize * 100);
    ctx.moveTo(offsetX, Math.round(y) + 0.5);
    ctx.lineTo(offsetX + cellSize * 100, Math.round(y) + 0.5);
  }
  ctx.stroke();
  const marker = (x, y, kind) => {
    const centerX = offsetX + (x + 0.5) * cellSize;
    const centerY = offsetY + (y + 0.5) * cellSize;
    drawMapGlyph(ctx, kind, centerX, centerY, Math.max(12, cellSize * 3));
  };
  marker(view.earth.x, view.earth.y, "earth");
  for (const planet of view.knownPlanets) marker(planet.position.x, planet.position.y, planet.type);
  marker(view.player.position.x, view.player.position.y, "ship");
}

function cellAtPoint(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cellSize = Math.min(rect.width, rect.height) / 9 * camera.zoom;
  const x = Math.round(camera.x + (clientX - rect.left - rect.width / 2) / cellSize);
  const y = Math.round(camera.y + (clientY - rect.top - rect.height / 2) / cellSize);
  if (x < 0 || x > 99 || y < 0 || y > 99) return null;
  return { x, y };
}

function updateTargetDisplay() {
  const view = playerView;
  const target = root.querySelector(".target-content");
  const strip = root.querySelector(".cell-status-strip");
  const statusbar = root.querySelector(".game-statusbar");
  if (!target || !strip || !statusbar) return;
  target.innerHTML = targetPreviewPanel(view);
  const info = getCellInfo(view, selectedCell);
  strip.querySelector("strong").textContent = selectedCell
    ? `(${selectedCell.x}, ${selectedCell.y}) · ${cellStatusLabel(info.status)}`
    : "CHƯA CHỌN Ô";
  strip.querySelector(".clear-target-button").hidden = !selectedCell;
  statusbar.children[1].textContent = selectedCell
    ? `MỤC TIÊU: (${selectedCell.x}, ${selectedCell.y}) / ${cellStatusLabel(info.status)}`
    : "CHỌN MỘT Ô / CHƯA CÓ MỤC TIÊU";
  const commandPanel = root.querySelector(".command-console");
  if (commandPanel) commandPanel.innerHTML = `<div class="panel-heading"><h2 id="command-title">BẢNG HÀNH ĐỘNG</h2></div>${commandSummaryMarkup(view)}`;
}

function attachTacticalCanvas() {
  const canvas = root.querySelector("#tactical-canvas");
  if (!canvas) return;
  let pointerStart = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerStart = {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointerStart && pointerStart.id === event.pointerId) {
      const dx = event.clientX - pointerStart.clientX;
      const dy = event.clientY - pointerStart.clientY;
      if (Math.hypot(dx, dy) > 4) pointerStart.moved = true;
      if (pointerStart.moved) {
        const rect = canvas.getBoundingClientRect();
        const cellSize = Math.min(rect.width, rect.height) / 9 * camera.zoom;
        camera.x = Math.max(0, Math.min(99, pointerStart.cameraX - dx / cellSize));
        camera.y = Math.max(0, Math.min(99, pointerStart.cameraY - dy / cellSize));
        hoverCell = null;
        const hoverStatus = root.querySelector("#hover-status");
        if (hoverStatus) hoverStatus.textContent = "ĐANG DỊCH BẢN ĐỒ · KHÔNG ĐỔI TRẠNG THÁI TRẬN";
        drawTacticalMap();
        return;
      }
    }
    hoverCell = cellAtPoint(canvas, event.clientX, event.clientY);
    const hoverStatus = root.querySelector("#hover-status");
    if (hoverStatus) {
      const info = getCellInfo(playerView, hoverCell);
      hoverStatus.textContent = hoverCell ? `ĐANG RÊ (${hoverCell.x}, ${hoverCell.y}) · ${cellStatusLabel(info.status)}` : "NGOÀI RÌA BẢN ĐỒ";
    }
    drawTacticalMap();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const wasDrag = pointerStart.moved;
    pointerStart = null;
    if (!wasDrag && !pendingAction) {
      const cell = cellAtPoint(canvas, event.clientX, event.clientY);
      if (cell) {
        selectedCell = cell;
        updateTargetDisplay();
      }
    }
    hoverCell = cellAtPoint(canvas, event.clientX, event.clientY);
    drawTacticalMap();
  });
  canvas.addEventListener("pointercancel", () => { pointerStart = null; });
  canvas.addEventListener("pointerleave", () => {
    if (pointerStart) return;
    hoverCell = null;
    const hoverStatus = root.querySelector("#hover-status");
    if (hoverStatus) hoverStatus.textContent = "Chọn ô chỉ để xem · chưa gửi lệnh";
    drawTacticalMap();
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    camera.zoom = Math.max(0.55, Math.min(2.5, camera.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    drawTacticalMap();
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (directions[event.key]) {
      event.preventDefault();
      camera.x = Math.max(0, Math.min(99, camera.x + directions[event.key][0]));
      camera.y = Math.max(0, Math.min(99, camera.y + directions[event.key][1]));
      drawTacticalMap();
    } else if (event.key === "Enter" && !pendingAction) {
      event.preventDefault();
      selectedCell = { x: Math.round(camera.x), y: Math.round(camera.y) };
      updateTargetDisplay();
      drawTacticalMap();
    }
  });
  drawTacticalMap();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

async function beginCreateRoom() {
  if (lobbyBusy) return;
  lobbyBusy = true;
  render("creating-room");
  const response = await window.gameAdapter.createRoom();
  lobbyBusy = false;
  if (!response.ok) return;
  lobbyState = { roomCode: response.data.roomCode, role: "host" };
  render("waiting-room");
}

async function submitJoinRoom() {
  if (lobbyBusy) return;
  const input = root.querySelector("#room-code");
  joinCodeValue = input.value;
  lobbyBusy = true;
  render("join-room");
  const response = await window.gameAdapter.joinRoom(joinCodeValue);
  lobbyBusy = false;
  if (!response.ok) {
    joinCodeValue = joinCodeValue.trim().toUpperCase();
    lobbyError = response.error;
    render("join-room");
    root.querySelector("#room-code").focus();
    root.querySelector("#room-code").setSelectionRange(0, joinCodeValue.length);
    return;
  }
  lobbyError = null;
  lobbyState = { roomCode: response.data.roomCode, role: "guest" };
  beginMatchTransition();
}

async function beginMatchTransition() {
  lobbyBusy = false;
  render("initializing");
  const matchResponse = await window.gameAdapter.startMatch();
  if (!matchResponse.ok) {
    matchLinkNotice = `${matchResponse.error.code}: ${matchResponse.error.message}`;
    render("link-lost");
    return;
  }
  playerView = matchResponse.playerView;
  matchResult = null;
  matchLinkLost = false;
    matchLinkNotice = "Kết quả trận chưa được xác nhận. Mất kết nối không đồng nghĩa với việc có người thắng.";
  summaryNotice = "";
  actionFlow = { status: "idle", selected: null, result: null };
  commandEcho = null;
  localActionEvents = [];
  eventLogExpanded = false;
  activeEffects = [];
  activeToast = null;
  toastQueue = [];
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = null;
  recentToastKeys.clear();
  pendingAction = false;
  selectedCell = null;
  hoverCell = null;
  sectorOverviewOpen = false;
  camera.x = playerView.player.position.x;
  camera.y = playerView.player.position.y;
  camera.zoom = 1;
  render("initializing");
  window.setTimeout(() => {
    if (currentScreen === "initializing") render("game");
  }, 550);
}

function render(screen = currentScreen) {
  currentScreen = screen;
  pendingAction = actionFlow.status === "pending";
  if (runtimeStatus) runtimeStatus.textContent = screen === "home" ? "GIAO DIỆN SẴN SÀNG" : "GIAO DIỆN THỬ NGHIỆM";
  root.innerHTML = screen === "help" ? helpScreen()
    : screen === "settings" ? settingsScreen()
      : screen === "lobby" ? lobbyHomeScreen()
        : screen === "join-room" ? joinRoomScreen(lobbyError)
          : screen === "waiting-room" ? waitingRoomScreen()
            : screen === "link-lost" ? linkLostScreen()
              : screen === "match-result" ? matchResultScreen()
              : screen === "initializing" ? initializingScreen()
                : screen === "creating-room" ? creatingRoomScreen()
                  : screen === "game" ? gameScreen()
        : homeScreen();

  if (screen === "settings") {
    const address = root.querySelector("#server-address");
    address.value = settings.serverAddress;
  }
  applySettings();
  root.focus({ preventScroll: true });
  if (screen === "game") {
    window.requestAnimationFrame(() => {
      attachTacticalCanvas();
      const dialog = root.querySelector("#sector-overview");
      if (dialog) {
        dialog.addEventListener("cancel", () => { sectorOverviewOpen = false; }, { once: true });
        dialog.showModal();
        drawSectorOverview();
      }
      const confirmation = root.querySelector("#action-confirm-dialog");
      if (confirmation) {
        confirmation.addEventListener("cancel", (event) => {
          event.preventDefault();
          if (actionFlow.status === "confirming") {
            actionFlow.status = "selected";
            render("game");
          }
        }, { once: true });
        confirmation.showModal();
      }
    });
  }
}

async function sendMockCommand() {
  if (!actionFlow.selected || actionFlow.status === "pending" || !playerView.turn.isMyTurn) return;
  const action = actionFlow.selected;
  const args = getActionArgs(action);
  if (action === "MOVE" && !args.target) {
    const response = { ok: false, error: { code: "TARGET_REQUIRED", message: "Hãy chọn ô mục tiêu trước." } };
    actionFlow.result = response;
    actionFlow.status = "error";
    setCommandEcho(action, "Chưa chọn ô", response);
    addLocalActionEvent(response.error.code, response.error.message);
    playActionFeedback(action, response, playerView, playerView);
    render("game");
    return;
  }
  if (action === "RECHARGE" && (!Number.isInteger(args.amount) || args.amount < 1)) {
    const response = { ok: false, error: { code: "INVALID_AMOUNT", message: "Chọn số nguyên dương cho lượng tài nguyên." } };
    actionFlow.result = response;
    actionFlow.status = "error";
    setCommandEcho(action, `${args.amount} ${args.resource}`, response);
    addLocalActionEvent(response.error.code, response.error.message);
    playActionFeedback(action, response, playerView, playerView);
    render("game");
    return;
  }
  actionFlow.status = "pending";
  actionFlow.result = null;
  render("game");
  const previousView = playerView;
  const response = await window.gameAdapter.submitAction(action, args);
  const nextView = response.ok ? response.playerView : previousView;
  const targetLabel = action === "MOVE" ? `(${args.target.x}, ${args.target.y})`
    : action === "RECHARGE" ? `${args.amount} ${resourceLabel(args.resource)}`
      : action === "DEPOSIT" ? "Toàn bộ hàng về Trái Đất" : action === "END_TURN" ? "Người chơi tiếp theo" : `Từ (${previousView.player.position.x}, ${previousView.player.position.y})`;
  setCommandEcho(action, targetLabel, response);
  if (!response.ok) addLocalActionEvent(response.error.code, response.error.message);
  playActionFeedback(action, response, previousView, nextView);
  if (response.ok) playerView = response.playerView;
  actionFlow.result = response;
  actionFlow.status = response.ok ? "success" : "error";
  if (response.ok && action === "MOVE") {
    camera.x = response.playerView.player.position.x;
    camera.y = response.playerView.player.position.y;
  }
  if (response.matchResult) {
    matchResult = response.matchResult;
    summaryNotice = "ĐÃ NHẬN KẾT QUẢ TRẬN";
    render("match-result");
    return;
  }
  render("game");
}

function showExitDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "terminal-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="dialog-card panel">
      <span class="eyebrow amber-eyebrow">ĐIỀU KHIỂN PHIÊN // THOÁT</span>
      <h2>Đóng thẻ trình duyệt này để thoát.</h2>
      <p>Trang này không thể tự đóng thẻ không được mở từ trò chơi.</p>
      <button class="secondary-button" value="close">ĐÃ HIỂU</button>
    </form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.screen) {
    if (pendingAction) return;
    lobbyError = null;
    render(button.dataset.screen);
  } else if (button.dataset.command) {
    if (pendingAction || !playerView.turn.isMyTurn) return;
    actionFlow = { status: "selected", selected: button.dataset.command, result: null };
    updateTargetDisplay();
    root.querySelector(`[data-command="${button.dataset.command}"]`)?.focus();
  } else if (button.dataset.action === "exit") {
    showExitDialog();
  } else if (button.dataset.action === "test-connection") {
    connectionNotice = "KẾT QUẢ THỬ: không gửi yêu cầu kết nối.";
    root.querySelector("#connection-notice").textContent = connectionNotice;
  } else if (button.dataset.action === "create-room") {
    beginCreateRoom();
  } else if (button.dataset.action === "copy-room") {
    copyRoomCode();
  } else if (button.dataset.action === "cancel-room" || button.dataset.action === "leave-room") {
    leaveMockRoom();
  } else if (button.dataset.action === "simulate-join") {
    simulateOpponentJoin();
  } else if (button.dataset.action === "simulate-link-loss") {
    simulateLinkLoss();
  } else if (button.dataset.action === "retry-lobby") {
    retryMockConnection();
  } else if (button.dataset.action === "result-fixture") {
    loadMatchResultFixture(button.dataset.outcome);
  } else if (button.dataset.action === "match-link-loss") {
    matchLinkLost = true;
    matchLinkNotice = "Kết nối trận thử bị mất. Chưa có kết quả xác thực nên chưa rõ người thắng và điểm số.";
    render("link-lost");
  } else if (button.dataset.action === "check-match-result") {
    checkMatchResultAfterDisconnect();
  } else if (button.dataset.action === "copy-match-summary") {
    copyMatchSummary();
  } else if (button.dataset.action === "reset-to-ship") {
    camera.x = playerView.player.position.x;
    camera.y = playerView.player.position.y;
    camera.zoom = 1;
    hoverCell = null;
    drawTacticalMap();
  } else if (button.dataset.action === "open-overview") {
    sectorOverviewOpen = true;
    render("game");
  } else if (button.dataset.action === "close-overview") {
    sectorOverviewOpen = false;
    root.querySelector("#sector-overview")?.close();
    render("game");
  } else if (button.dataset.action === "clear-target") {
    if (!pendingAction) {
      selectedCell = null;
      updateTargetDisplay();
      drawTacticalMap();
      root.querySelector("#tactical-canvas")?.focus();
    }
  } else if (button.dataset.action === "clear-command") {
    if (!pendingAction) {
      actionFlow = { status: "idle", selected: null, result: null };
      updateTargetDisplay();
    }
  } else if (button.dataset.action === "send-command") {
    sendMockCommand();
  } else if (button.dataset.action === "review-command") {
    if (!pendingAction && actionFlow.selected) {
      actionFlow.status = "confirming";
      render("game");
    }
  } else if (button.dataset.action === "confirm-command") {
    sendMockCommand();
  } else if (button.dataset.action === "cancel-confirmation") {
    actionFlow.status = "selected";
    render("game");
  } else if (button.dataset.action === "simulate-opponent-turn") {
    simulateMockOpponentTurn();
  } else if (button.dataset.action === "dismiss-toast") {
    dismissToast();
  } else if (button.dataset.action === "toggle-event-log") {
    eventLogExpanded = !eventLogExpanded;
    const log = root.querySelector(".event-log");
    const toggle = button;
    log?.classList.toggle("expanded", eventLogExpanded);
    toggle.textContent = `${eventLogExpanded ? "THU GỌN" : "XEM THÊM"} · ${playerView.recentEvents.length + localActionEvents.length}`;
    toggle.setAttribute("aria-expanded", String(eventLogExpanded));
  }
});

async function simulateMockOpponentTurn() {
  if (pendingAction || playerView.turn.isMyTurn) return;
  actionFlow.status = "pending";
  render("game");
  const response = await window.mockDemoAdapter.advanceOpponentTurn();
  if (response.ok) playerView = response.playerView;
  actionFlow = { status: response.ok ? "success" : "error", selected: null, result: response.ok ? { ok: true, actionReport: { message: "Đối thủ đã xong lượt." } } : response };
  if (response.ok) enqueueToast({ level: "info", title: "ĐẾN LƯỢT CỦA BẠN", message: "Đối thủ đã kết thúc lượt. AP đã được cập nhật theo trạng thái mới.", code: "TURN_STARTED" });
  render("game");
}

async function loadMatchResultFixture(outcome) {
  lobbyBusy = true;
  render("game");
  const response = await window.mockDemoAdapter.getResultFixture(outcome);
  lobbyBusy = false;
  if (!response.ok) return;
  matchResult = response.result;
    summaryNotice = "ĐÃ NHẬN KẾT QUẢ THỬ";
  render("match-result");
}

async function checkMatchResultAfterDisconnect() {
  lobbyBusy = true;
  render("link-lost");
  const response = await window.gameAdapter.getMatchResult();
  lobbyBusy = false;
  if (response.ok && response.data?.result) {
    matchResult = response.data.result;
    summaryNotice = "ĐÃ NHẬN PHẢN HỒI KẾT QUẢ TRẬN";
    render("match-result");
    return;
  }
  matchLinkNotice = response.error
    ? `${response.error.code}: ${localizeText(response.error.message)} Kết quả trận vẫn chưa rõ.`
    : "Phản hồi không có kết quả trận đã xác minh. Kết quả vẫn chưa rõ.";
  render("link-lost");
}

async function copyMatchSummary() {
  if (!matchResult) return;
  const summary = matchResultSummary(matchResult);
  try {
    await navigator.clipboard.writeText(summary);
    summaryNotice = "ĐÃ SAO CHÉP TÓM TẮT TRẬN.";
  } catch {
    const field = document.createElement("textarea");
    field.value = summary;
    field.setAttribute("aria-label", "Tóm tắt trận để sao chép");
    field.className = "summary-copy-fallback";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    if (copied) {
      field.remove();
      summaryNotice = "ĐÃ SAO CHÉP TÓM TẮT TRẬN.";
    } else {
      field.focus();
      summaryNotice = "Sao chép thất bại. Tóm tắt trận đã được chọn bên dưới để sao chép thủ công.";
    }
  }
  render("match-result");
}

root.addEventListener("submit", (event) => {
  if (event.target.id !== "join-form") return;
  event.preventDefault();
  submitJoinRoom();
});

async function copyRoomCode() {
  const notice = root.querySelector("#copy-notice");
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(lobbyState.roomCode);
    notice.textContent = "ĐÃ SAO CHÉP MÃ PHÒNG.";
    notice.classList.remove("copy-error");
  } catch {
    notice.textContent = "Sao chép thất bại. Hãy chọn mã phía trên và sao chép thủ công.";
    notice.classList.add("copy-error");
    const code = root.querySelector("#created-room-code");
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

async function leaveMockRoom() {
  if (lobbyBusy || !lobbyState) return;
  lobbyBusy = true;
  const returnScreen = currentScreen === "waiting-room" ? "waiting-room" : "game";
  render(returnScreen);
  const response = await window.gameAdapter.leaveRoom();
  lobbyBusy = false;
  if (!response.ok) return;
  lobbyState = null;
  render("lobby");
}

async function simulateOpponentJoin() {
  if (lobbyBusy || !lobbyState) return;
  lobbyBusy = true;
  render("waiting-room");
  const response = await window.mockDemoAdapter.simulateOpponentJoin(lobbyState.roomCode);

  lobbyBusy = false;
  if (response.ok && response.data.playersConnected) beginMatchTransition();
}

async function simulateLinkLoss() {
  if (lobbyBusy) return;
  lobbyBusy = true;
  render("waiting-room");
  await window.mockDemoAdapter.simulateLobbyLinkLoss();
  lobbyBusy = false;
  render("link-lost");
}

async function retryMockConnection() {
  if (lobbyBusy) return;
  lobbyBusy = true;
  render("link-lost");
  const response = await window.gameAdapter.reconnectRoom();
  lobbyBusy = false;
  if (response.ok && response.data.connection === "restored") render("waiting-room");
}

root.addEventListener("input", (event) => {
  const control = event.target;
  if (control.id === "font-size") {
    settings.fontSize = Number(control.value);
    root.querySelector("#font-size-output").value = `${settings.fontSize}px`;
    applySettings();
    saveSettings();
  } else if (control.id === "volume") {
    settings.volume = Number(control.value);
    root.querySelector("#volume-output").value = `${settings.volume}%`;
    saveSettings();
  } else if (control.id === "server-address") {
    settings.serverAddress = control.value;
    saveSettings();
  }
});

root.addEventListener("change", (event) => {
  const control = event.target;
  if (control.id === "recharge-resource") {
    rechargeSelection.resource = control.value;
    rechargeSelection.amount = 1;
    updateTargetDisplay();
    root.querySelector("#recharge-resource")?.focus();
  } else if (control.id === "recharge-amount") {
    rechargeSelection.amount = Number(control.value);
    updateTargetDisplay();
    root.querySelector("#recharge-amount")?.focus();
  } else if (control.id === "sound-toggle") {
    settings.sound = control.checked;
    control.nextElementSibling.nextElementSibling.textContent = settings.sound ? "BẬT" : "TẮT";
    saveSettings();
  } else if (control.id === "reduced-motion") {
    settings.reducedMotion = control.checked;
    control.nextElementSibling.nextElementSibling.textContent = settings.reducedMotion ? "BẬT" : "TẮT";
    applySettings();
    saveSettings();
  }
});

applySettings();
render("home");
window.gameAdapter.subscribeNotifications(showAdapterNotification);
window.gameAdapter.subscribePlayerViews((nextView) => {
  if (!nextView) return;
  playerView = nextView;
  if (currentScreen === "game") render("game");
});
window.gameAdapter.subscribeMatchResults((result) => {
  matchResult = result;
  summaryNotice = "ĐÃ NHẬN KẾT QUẢ TRẬN";
  render("match-result");
});

document.querySelector(".brand")?.addEventListener("click", (event) => {
  event.preventDefault();
  if (pendingAction) return;
  lobbyError = null;
  render("home");
});

window.addEventListener("resize", () => {
  if (currentScreen !== "game") return;
  drawTacticalMap();
  drawSectorOverview();
});
