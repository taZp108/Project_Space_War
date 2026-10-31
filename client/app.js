"use strict";

const root = document.querySelector("#main");
const preferenceKey = "space-war-ui-settings-v1";

const defaultSettings = {
  fontSize: 16,
  sound: false,
  volume: 35,
  reducedMotion: false,
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
let matchConnectStatus = "Đang kết nối với máy chủ…";
let mineSelection = "Iron";
let rpgTab = "Active";
let turnDeadlineMs = null;
let activeTurnToken = "";
let countdownTimer = null;
let augmentOffers = null;
let augmentDeadline = 0;
let augmentTimerInterval = null;
let lobbyBusy = false;
let matchViewInitialized = false;
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

// Khai báo nhạc nền
const menuBgm = new Audio("bgm-menu.mp3");
menuBgm.loop = true;

const gameBgmTracks = [
  "bgm-game-1.mp3",
  "bgm-game-2.mp3",
  "bgm-game-3.mp3"
];
let currentGameBgmIndex = 0;
const gameBgm = new Audio();

// Tự động chuyển bài khi nhạc trận đấu hết
gameBgm.addEventListener("ended", () => {
  currentGameBgmIndex = (currentGameBgmIndex + 1) % gameBgmTracks.length;
  gameBgm.src = gameBgmTracks[currentGameBgmIndex];
  if (settings.sound) gameBgm.play().catch(() => {});
});

let activeBgm = null; // Biến giữ bài nhạc đang phát

function saveSettings() {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(settings));
  } catch {
    // Preferences still work for this page session when local storage is unavailable.
  }
}

// Hàm chuyển đổi nhạc nền (Menu hoặc Game)
function updateBgm(isGameScreen) {
  const targetBgm = isGameScreen ? gameBgm : menuBgm;
  
  if (activeBgm && activeBgm !== targetBgm) {
    activeBgm.pause();
    activeBgm.currentTime = 0;
  }
  activeBgm = targetBgm;
  
  if (isGameScreen && !gameBgm.src) {
    gameBgm.src = gameBgmTracks[currentGameBgmIndex];
  }
  
  applySettings();
}

function applySettings() {
  document.documentElement.style.setProperty("--text-scale", String(settings.fontSize / 16));
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);

  if (activeBgm) {
    activeBgm.volume = settings.volume / 100;
    if (settings.sound) {
      activeBgm.play().catch(() => {}); 
    } else {
      activeBgm.pause();
    }
  }
}

const actionLabels = {
  MOVE: "DI CHUYỂN", OBSERVE: "QUAN SÁT", SCAN_AREA: "QUÉT KHU VỰC",
  SCAN_NEAREST: "TÌM HÀNH TINH GẦN NHẤT", SCAN_OPPONENT: "QUÉT ĐỐI THỦ",
  MINE: "KHAI THÁC", DEPOSIT: "NỘP TÀI NGUYÊN", RECHARGE: "SẠC PIN", END_TURN: "KẾT THÚC LƯỢT",
};
const resourceLabels = { Iron: "Sắt", Crystal: "Pha lê", EnergyCore: "Lõi năng lượng", RareOre: "Quặng hiếm", ExoticMatter: "Vật chất lạ" };

const planetEventLabels = {
  EV_LavaCore: "Lõi dung nham", EV_Radiation: "Bức xạ kỳ quặc",
  EV_GreedyPlanet: "Hành tinh tham lam", EV_SpaceAnchor: "Mỏ neo không gian",
  EV_Parasite: "Trứng ký sinh", EV_Mirage: "Ảo ảnh sa mạc",
  EV_CargoJam: "Khoang hàng bị kẹt", EV_Surge: "Dòng điện ngầm"
};
function planetEventLabel(value) { return planetEventLabels[value] || "Chưa xác định"; }

// Thêm dữ liệu chi tiết cho bảng Sự kiện
const eventData = {
  planet: [
    { id: "EV_LavaCore", name: "Lõi dung nham", desc: "Nạp đầy pin, nhưng hành tinh mất sạch tài nguyên." },
    { id: "EV_Radiation", name: "Bức xạ kỳ quặc", desc: "Trừ 20 pin, bù lại nhận 1 vật phẩm chủ động." },
    { id: "EV_GreedyPlanet", name: "Hành tinh tham lam", desc: "Lấy đi một nửa số tài nguyên vừa khai thác." },
    { id: "EV_SpaceAnchor", name: "Mỏ neo không gian", desc: "Bị kẹt, mất lượt ngay lập tức." },
    { id: "EV_Parasite", name: "Trứng ký sinh", desc: "Nhận 1 Kim cương hồng, giảm 1 ô chứa vật phẩm chủ động." },
    { id: "EV_Mirage", name: "Ảo ảnh sa mạc", desc: "Phát hiện thêm 3 hành tinh ảo (chứa Amethyst) quanh đây." },
    { id: "EV_CargoJam", name: "Khoang hàng bị kẹt", desc: "Giảm 5-10 dung tích khoang hàng." },
    { id: "EV_Surge", name: "Dòng điện ngầm", desc: "Được nạp thêm 10 pin." }
  ],
  canon: [
    { id: "CE_BlackHole", name: "Lỗ đen tạm thời", desc: "Dịch chuyển ngẫu nhiên vị trí của cả 2 tàu." },
    { id: "CE_Tax", name: "Thuế vũ trụ", desc: "Trừ 10% điểm Earth, biến thành Spinel rơi vào cargo." },
    { id: "CE_ReverseGravity", name: "Đảo ngược trọng lực", desc: "Chi phí pin di chuyển (Move) tăng gấp đôi vòng này." },
    { id: "CE_GalacticFair", name: "Hội chợ thiên hà", desc: "Mất 5 tài nguyên ngẫu nhiên, đổi lại 1 vật phẩm chủ động." },
    { id: "CE_SolarStorm", name: "Bão mặt trời", desc: "Trừ 30 pin. Nếu pin < 30, giảm 1 AP lượt tới." },
    { id: "CE_TwinPlanet", name: "Hành tinh sinh đôi", desc: "Nhân bản một hành tinh ngẫu nhiên." },
    { id: "CE_Homecoming", name: "Hồi hương", desc: "Kéo cả 2 tàu về Trái Đất." },
    { id: "CE_GiftItem", name: "Quà tặng vũ trụ", desc: "Tặng ngẫu nhiên 1 vật phẩm cho mỗi người." },
    { id: "CE_TheftItem", name: "Kẻ trộm không gian", desc: "Đánh cắp 1 vật phẩm chủ động của mỗi người." },
    { id: "CE_SupplyDrop", name: "Tiếp tế khẩn cấp", desc: "Tặng 3-5 tài nguyên ngẫu nhiên cho mỗi người." },
    { id: "CE_Plunder", name: "Cướp biển vũ trụ", desc: "Lấy 2-5 tài nguyên trong khoang hàng của mỗi người." }
  ]
};
let eventTab = "planet"; // Lưu trạng thái tab hiện tại

const cellStatusLabels = { EARTH: "TRÁI ĐẤT", "OWN SHIP": "TÀU CỦA BẠN", "KNOWN PLANET": "HÀNH TINH ĐÃ BIẾT", UNKNOWN: "CHƯA KHÁM PHÁ" };
const statusLabels = { connected: "ĐÃ KẾT NỐI", waiting: "ĐANG CHỜ", active: "ĐANG HOẠT ĐỘNG", lost: "MẤT KẾT NỐI", restored: "ĐÃ KẾT NỐI LẠI", unknown: "CHƯA RÕ" };
function actionLabel(value) { return actionLabels[value] || String(value || "LỆNH"); }
function resourceLabel(value) { return resourceLabels[value] || String(value || "TÀI NGUYÊN"); }
Object.assign(resourceLabels, { PinkDiamond: "Kim cương hồng", Spinel: "Spinel", HollyBlueAgate: "Agate xanh", Peridot: "Peridot", Topaz: "Topaz", Carnelian: "Carnelian", Jasper: "Jasper", Amethyst: "Amethyst" });
const resourceGlyphs = { PinkDiamond: "◆", Spinel: "●", HollyBlueAgate: "⬟", Peridot: "▲", Topaz: "✦", Carnelian: "■", Jasper: "⬢", Amethyst: "✧" };
function planetLabel(value) { return planetLabels[value] || String(value || "CHƯA RÕ"); }
function cellStatusLabel(value) { return cellStatusLabels[value] || cellStatusLabels.UNKNOWN; }
function resultLabel(value) { return resultLabels[value] || String(value || resultLabels["Outcome unavailable"]); }
function reasonLabel(value) { return reasonLabels[value] || String(value || "CHƯA RÕ"); }
function statusLabel(value) { return statusLabels[value] || statusLabels.unknown; }
const eventKindLabels = { INFO: "TIN", SCAN: "QUÉT", MOVE: "DI CHUYỂN", WARN: "CẢNH BÁO", ERROR: "LỖI" };
const resultLabels = { Victory: "CHIẾN THẮNG", Defeat: "THẤT BẠI", Draw: "HÒA", "Outcome unavailable": "CHƯA CÓ KẾT QUẢ", "Result unverified": "KẾT QUẢ CHƯA XÁC MINH" };
const reasonLabels = { reached_target: "ĐẠT ĐIỂM MỤC TIÊU", opponent_out_of_battery: "ĐỐI THỦ CẠN PIN", opponent_disconnected: "ĐỐI THỦ MẤT KẾT NỐI", higher_score_at_limit: "ĐIỂM CAO HƠN KHI HẾT VÒNG", REACHED_TARGET: "ĐẠT ĐIỂM MỤC TIÊU", EARTH_SCORE_TARGET_REACHED: "ĐẠT ĐIỂM TRÁI ĐẤT MỤC TIÊU", ReachedTarget: "ĐẠT ĐIỂM MỤC TIÊU", BATTERY_DEPLETED: "CẠN PIN", OpponentOutOfBattery: "ĐỐI THỦ CẠN PIN", ROUND_LIMIT_REACHED: "HẾT GIỚI HẠN VÒNG", HigherScoreAtLimit: "ĐIỂM CAO HƠN KHI HẾT VÒNG", OPPONENT_DISCONNECTED: "ĐỐI THỦ MẤT KẾT NỐI", OpponentDisconnected: "ĐỐI THỦ MẤT KẾT NỐI", RESULT_UNAVAILABLE: "CHƯA CÓ KẾT QUẢ" };
function localizeText(text) { return String(text ?? ""); }

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
        <h1 class="game-title">SPACE <span>War</span></h1>
      </div>
      <nav class="menu-panel panel" aria-label="Menu chính">
        <div class="panel-heading"><h2>Bảng điều khiển</h2></div>
        <div class="menu-list">
          <button class="menu-button menu-primary" data-screen="lobby"><span class="menu-label">NHIỀU NGƯỜI CHƠI</span></button>
          <button class="menu-button" data-screen="help"><span class="menu-label">HƯỚNG DẪN</span></button>
          <button class="menu-button" data-screen="settings"><span class="menu-label">CÀI ĐẶT</span></button>
          <button class="menu-button menu-exit" data-action="exit"><span class="menu-label">THOÁT</span></button>
        </div>
      </nav>
      <div class="home-orbit" aria-hidden="true"><span></span><i></i></div>
    </section>`;
}

function lobbyHomeScreen() {
  return `
    <section class="content-screen lobby-home-screen" aria-labelledby="screen-title">
      <div class="link-lost-card panel">
        <span class="eyebrow amber-eyebrow">SPACE WAR</span>
        <h1 id="screen-title">Sẵn sàng <span>vào trận?</span></h1>
        <p>Kết nối máy chủ để tự động ghép trận với người chơi tiếp theo.</p>
        <div class="link-lost-actions">
          <button class="primary-button" data-action="real-match">VÀO TRẬN</button>
          <button class="utility-button" data-action="mock-match">VÀO TRẬN GIẢ</button>
          <button class="utility-button" data-screen="home">VỀ MENU</button>
        </div>
      </div>
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
      </div>
      <p class="screen-footnote">TÙY CHỌN ĐƯỢC LƯU TRÊN TRÌNH DUYỆT NÀY.</p>
    </section>`;
}

function linkLostScreen() {
  return `
    <section class="content-screen link-lost-screen" aria-labelledby="screen-title">
      <div class="link-lost-card panel"><span class="eyebrow danger-eyebrow">MẤT KẾT NỐI</span><span class="link-lost-icon" aria-hidden="true">×</span><h1 id="screen-title">Kết nối <span>bị gián đoạn.</span></h1><p>${escapeHtml(matchLinkNotice)}</p><div class="link-lost-actions"><button class="primary-button" data-screen="home">VỀ MENU</button></div></div>
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
  return `<section class="content-screen result-screen" aria-labelledby="screen-title"><article class="match-result-card panel ${verified ? "result-verified" : "result-unverified"}"><span class="eyebrow ${verified ? "amber-eyebrow" : "danger-eyebrow"}">NHIỀU NGƯỜI CHƠI // ${verified ? "KẾT QUẢ MÁY CHỦ" : "TRẠNG THÁI KẾT QUẢ"}</span><span class="result-mark" aria-hidden="true">${verified ? "✦" : "?"}</span><h1 id="screen-title">${escapeHtml(outcome)}</h1><p>${verified ? "Máy chủ đã xác nhận kết quả trận đấu." : "Chưa xác minh được kết quả. Không suy đoán người thắng hoặc điểm số."}</p>${details ? `<dl class="match-result-details">${details}</dl>` : ""}<div class="link-lost-actions"><button class="primary-button" data-action="copy-match-summary">SAO CHÉP TÓM TẮT TRẬN</button><button class="utility-button" data-screen="home">VỀ MENU</button></div><p class="summary-notice" role="status" aria-live="polite">${escapeHtml(localizeText(summaryNotice || (verified ? "ĐÃ NHẬN KẾT QUẢ TRẬN" : "KẾT QUẢ TRẬN CHƯA RÕ")))}</p></article></section>`;
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
    <section class="content-screen initializing-screen" aria-live="polite"><div class="initializing-card panel"><span class="eyebrow amber-eyebrow">NHIỀU NGƯỜI CHƠI</span><span class="initializing-mark" aria-hidden="true">⊕</span><h1>Đang ghép <span>trận.</span></h1><p id="match-connect-status">${escapeHtml(matchConnectStatus)}</p></div></section>`;
}

function renderMapPreview(view) {
  return `
    <div class="map-canvas-wrap"><canvas id="tactical-canvas" class="tactical-canvas" tabindex="0" role="img" aria-label="Bản đồ chiến thuật. Nhấp ô để chọn; kéo để di chuyển bản đồ; dùng con lăn để thu phóng. Khi đặt tiêu điểm bàn phím, dùng phím mũi tên để dịch chuyển và Enter để chọn ô giữa."></canvas></div>`;
}
function getCellInfo(view, cell) {
  if (!cell) return null;
  if (cell.x === view.earth.x && cell.y === view.earth.y) return { status: "EARTH", object: null };
  const planet = view.knownPlanets.find((item) => item.position.x === cell.x && item.position.y === cell.y);
  if (planet) return { status: "KNOWN PLANET", object: planet };
  if (cell.x === view.player.position.x && cell.y === view.player.position.y) return { status: "OWN SHIP", object: null };
  return { status: "UNKNOWN", object: null };
}

function targetPreviewPanel(view) {
  if (!selectedCell) {
    return `<div class="target-empty"><span class="target-crosshair" aria-hidden="true">＋</span><strong>CHỌN MỘT Ô</strong><span>Chưa chọn mục tiêu</span></div>`;
  }
  const info = getCellInfo(view, selectedCell);
    

  if (info.status === "KNOWN PLANET") {
    const planet = info.object;
    const isHere = selectedCell.x === view.player.position.x && selectedCell.y === view.player.position.y;
    
    // Lấy dữ liệu từ KnownPlanet (do Observe tiết lộ) hoặc dựa vào vị trí hiện tại
    const stock = planet.stock || (isHere ? view.player.currentPlanetStock : null);
    const stockValue = stock
      ? (Object.entries(stock).filter(([, amount]) => amount > 0).map(([type, amount]) => `${resourceLabel(type)} ${amount}`).join(" · ") || "HẾT")
      : "CHƯA RÕ · cần dùng Quan Sát để xem";

    const ev = planet.eventType || (isHere ? view.player.currentPlanetEvent : null);
    let eventName = "CHƯA RÕ · cần dùng Quan Sát để xem";
    if (ev) {
      eventName = planetEventLabel(ev);
    } else if (isHere) {
      eventName = "Không có sự kiện";
    }

    return `<div class="target-state target-known"><span class="target-glyph" aria-hidden="true">◆</span><div><span class="field-label">TRẠNG THÁI Ô</span><strong>${cellStatusLabel(info.status)}</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y}) · ${planet.id}</span></div></div><dl class="target-details"><div><dt>SỰ KIỆN</dt><dd>${eventName}</dd></div><div><dt>TÀI NGUYÊN</dt><dd class="unknown-value">${stockValue}</dd></div></dl>`;
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


const rpgItems = [
  { id: "it_teleport", name: "Dịch chuyển", kind: "Active", icon: "⌖", recipe: { PinkDiamond: 1, Amethyst: 3 }, desc: "Đưa tàu về thẳng Trái Đất." },
  { id: "it_battery", name: "Pin dự phòng", kind: "Active", icon: "ϟ", recipe: { Peridot: 2, Amethyst: 2 }, desc: "Hồi 20 pin ở bất cứ đâu." },
  { id: "it_ap", name: "Điểm hành động", kind: "Active", icon: "+", recipe: { Jasper: 2, Amethyst: 2 }, desc: "Cộng thêm 2 AP vào lượt hiện tại." },
  { id: "it_cargo_up", name: "Khoang mở rộng", kind: "Passive", icon: "▣", recipe: { HollyBlueAgate: 5, Spinel: 5 }, desc: "Tăng thêm 20 dung tích khoang hàng." },
  { id: "it_battery_max", name: "Pin nâng cấp", kind: "Passive", icon: "▤", recipe: { Peridot: 4, HollyBlueAgate: 3 }, desc: "Tăng thêm 20 pin tối đa." },
  { id: "it_eco_engine", name: "Động cơ tiết kiệm", kind: "Passive", icon: "⌁", recipe: { Jasper: 3, Topaz: 1 }, desc: "Giảm 1 pin tiêu hao mỗi bước di chuyển." },
  { id: "it_luck_up", name: "Bùa may mắn", kind: "Passive", icon: "✦", recipe: { Carnelian: 2, PinkDiamond: 1 }, desc: "Tăng 10% lượng tài nguyên khai thác." },
  { id: "it_black_hole", name: "Hố đen", kind: "Active", icon: "◉", recipe: { PinkDiamond: 2, Topaz: 3 }, desc: "Xóa sổ hành tinh đang đứng, nhận 2 Carnelian." },
  { id: "it_swap_pos", name: "Hoán đổi vị trí", kind: "Active", icon: "⇄", recipe: { Jasper: 2, Topaz: 2 }, desc: "Tráo đổi vị trí tàu với đối thủ." },
  { id: "it_scarecrow", name: "Nhiễu đối thủ", kind: "Active", icon: "◇", recipe: { Carnelian: 2, Amethyst: 4 }, desc: "Làm đối thủ mất 1 AP." },
  { id: "it_steal", name: "Đánh cắp", kind: "Active", icon: "⤴", recipe: { PinkDiamond: 1, Jasper: 2 }, desc: "Lấy 1 vật phẩm chủ động từ túi đối thủ." },
  { id: "it_ap_boost", name: "Tăng AP", kind: "Active", icon: "↑", recipe: { Peridot: 2, Topaz: 1 }, desc: "Cộng thêm 2 AP vào lượt hiện tại." },
  { id: "it_magnet", name: "Nam châm", kind: "Active", icon: "⊕", recipe: { Spinel: 5, HollyBlueAgate: 2 }, desc: "Hút toàn bộ tài nguyên của hành tinh đang đứng." },
];

function rpgRecipe(recipe) { return Object.entries(recipe).map(([name, n]) => `${resourceLabel(name)} × ${n}`).join(" · "); }

function rpgDialogMarkup(view, mode) {
  // BẢNG NÂNG CẤP ĐÃ CHỌN
  if (mode === "augments") {
    const augments = view.player.augments || [];
    const listHtml = augments.length 
      ? augments.map(offer => {
          const info = getAugmentInfo(offer.type, offer.rarity);
          return `
            <article class="augment-card rarity-${offer.rarity}" style="cursor: default; transform: none; box-shadow: none;">
                <span class="augment-icon" style="font-size: 2.5rem; margin-bottom: 0.5rem;">${info.icon}</span>
                <h3 class="augment-name" style="font-size: 1rem;">${info.name}</h3>
                <span class="augment-rarity" style="font-size: 0.7rem; margin-bottom: 0.5rem;">${getRarityLabel(offer.rarity)}</span>
                <p class="augment-desc" style="font-size: 0.75rem;">${info.desc}</p>
            </article>
          `;
        }).join("")
      : '<p class="field-note" style="text-align:center;">Chưa có nâng cấp nào được chọn.</p>';

    return `<dialog class="terminal-dialog rpg-dialog" id="rpg-dialog" style="width: min(900px, 95vw);"><section class="dialog-card panel"><span class="eyebrow amber-eyebrow">TRANG BỊ</span><h2>NÂNG CẤP ĐÃ CHỌN</h2><div class="augment-cards" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); padding: 1rem 0;">${listHtml}</div><button class="utility-button" data-action="close-rpg">ĐÓNG</button></section></dialog>`;
  }

  // BẢNG SỰ KIỆN
  if (mode === "events") {
    const list = eventTab === "planet" ? eventData.planet : eventData.canon;
    return `<dialog class="terminal-dialog rpg-dialog" id="rpg-dialog"><section class="dialog-card panel"><span class="eyebrow amber-eyebrow">CƠ SỞ DỮ LIỆU</span><h2>DANH SÁCH SỰ KIỆN</h2><div class="rpg-tabs"><button data-event-tab="planet" class="${eventTab === "planet" ? "active" : ""}">HÀNH TINH</button><button data-event-tab="canon" class="${eventTab === "canon" ? "active" : ""}">TOÀN CẦU (CANON)</button></div><div class="rpg-items">${list.map((ev) => `<article class="rpg-item" style="grid-template-columns: 38px 1fr;"><span class="rpg-item-icon" style="color:var(--amber); border-color:rgba(255,180,94,0.4);">!</span><div class="rpg-item-copy"><strong>${ev.name}</strong><span>${ev.desc}</span></div></article>`).join("")}</div><button class="utility-button" data-action="close-rpg">ĐÓNG</button></section></dialog>`;
  }

  // BẢNG CHẾ TẠO
  if (mode === "craft") {
    const items = rpgItems.filter((item) => item.kind === rpgTab);
    const available = new Set(view.canCraft || []);
    return `<dialog class="terminal-dialog rpg-dialog" id="rpg-dialog"><section class="dialog-card panel"><span class="eyebrow amber-eyebrow">XƯỞNG CHẾ TẠO</span><h2>CHẾ TẠO VẬT PHẨM</h2><div class="rpg-tabs"><button data-rpg-tab="Active" class="${rpgTab === "Active" ? "active" : ""}">CHỦ ĐỘNG</button><button data-rpg-tab="Passive" class="${rpgTab === "Passive" ? "active" : ""}">BỊ ĐỘNG</button></div><div class="rpg-items">${items.map((item) => `<article class="rpg-item" data-tooltip="${item.desc}"><span class="rpg-item-icon">${item.icon}</span><div class="rpg-item-copy"><strong>${item.name}</strong><small>${item.kind === "Active" ? "VẬT PHẨM CHỦ ĐỘNG" : "VẬT PHẨM BỊ ĐỘNG"}</small><span>${rpgRecipe(item.recipe)}</span></div><button class="primary-button" data-rpg-action="craft" data-item="${item.id}" ${available.has(item.id) ? "" : "disabled"}>CHẾ TẠO</button></article>`).join("")}</div><button class="utility-button" data-action="close-rpg">ĐÓNG</button></section></dialog>`;
  }

  // BẢNG TÚI ĐỒ
  const inv = view.player.inventory || { passives: {}, actives: [] };
  const actives = (inv.actives || []).map((id) => { const key = String(id).toLowerCase(); const item = rpgItems.find((entry) => entry.id === key) || { name: key, icon: "◇", desc: "Vật phẩm không xác định." }; return `<article class="rpg-item" data-tooltip="${item.desc}"><span class="rpg-item-icon">${item.icon}</span><div class="rpg-item-copy"><strong>${item.name}</strong><small>CHỦ ĐỘNG · CÓ THỂ DÙNG</small></div><button class="primary-button" data-rpg-action="use" data-item="${item.id}">SỬ DỤNG</button></article>`; }).join("");
  const passives = Object.entries(inv.passives || {}).map(([id, n]) => { const item = rpgItems.find((entry) => entry.id === id.toLowerCase()) || { name: id, icon: "▣", desc: "Vật phẩm không xác định." }; return `<article class="rpg-item" data-tooltip="${item.desc}"><span class="rpg-item-icon">${item.icon}</span><div class="rpg-item-copy"><strong>${item.name}</strong><small>BỊ ĐỘNG · CỘNG DỒN</small></div><b>× ${n}</b></article>`; }).join("");
  return `<dialog class="terminal-dialog rpg-dialog" id="rpg-dialog"><section class="dialog-card panel"><span class="eyebrow amber-eyebrow">TRANG BỊ</span><h2>TÚI ĐỒ</h2><div class="rpg-items">${actives}${passives}${actives || passives ? "" : '<p class="field-note">Túi đồ đang trống.</p>'}</div><button class="utility-button" data-action="close-rpg">ĐÓNG</button></section></dialog>`;
}


function openRpgDialog(mode) {
  root.querySelector("#rpg-dialog")?.remove();
  root.insertAdjacentHTML("beforeend", rpgDialogMarkup(playerView, mode));
  root.querySelector("#rpg-dialog")?.showModal();
}
function renderRpgTools() {
  const heading = root.querySelector(".command-console .panel-heading");
  if (heading && !heading.querySelector(".rpg-tools")) heading.insertAdjacentHTML("beforeend", '<div class="rpg-tools"><button type="button" data-action="open-crafting">CHẾ TẠO</button><button type="button" data-action="open-inventory">TÚI ĐỒ</button><button type="button" data-action="open-events">SỰ KIỆN</button><button type="button" data-action="open-augments">NÂNG CẤP</button></div>');  const turnRight = root.querySelector(".game-turnbar .turn-right");
  if (turnRight && !turnRight.querySelector("#turn-countdown")) turnRight.insertAdjacentHTML("afterbegin", '<span id="turn-countdown" class="turn-countdown">01:30</span>');
  const turnStatus = root.querySelector(".game-turnbar .turn-status");
  const eventBadge = root.querySelector(".active-event-badge");
  if (eventBadge) eventBadge.remove();
  if (playerView?.activeEvent && turnStatus) {
    const label = String(playerView.activeEvent).replace(/^CE_/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
    turnStatus.insertAdjacentHTML("beforeend", `<span class="active-event-badge">CANON · ${escapeHtml(label)}</span>`);
  }
  updateTurnCountdown();
}

function updateTurnDeadline(view) {
  const token = `${view.turn.round}:${view.turn.activePlayer}`;
  if (view.turn.endTime) turnDeadlineMs = Number(view.turn.endTime) * 1000;
  else if (token !== activeTurnToken || turnDeadlineMs === null) turnDeadlineMs = Date.now() + 90000;
  activeTurnToken = token;
}

function updateTurnCountdown() {
  const node = root.querySelector("#turn-countdown");
  if (!node || turnDeadlineMs === null) return;
  const seconds = Math.max(0, Math.ceil((turnDeadlineMs - Date.now()) / 1000));
  node.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  node.classList.toggle("expired", seconds <= 10);
}
async function submitRpgAction(action, item) {
  if (pendingAction || !playerView?.turn.isMyTurn) return;
  root.querySelector("#rpg-dialog")?.close();
  pendingAction = true;
  const previous = playerView;
  const result = await window.gameAdapter.submitAction(action, { item });
  pendingAction = false;
  if (result.ok) { playerView = result.playerView; playActionFeedback(action, result, previous, playerView); }
  else enqueueToast({ level: "warning", title: "HÀNH ĐỘNG BỊ TỪ CHỐI", message: result.error?.message || result.error?.code || "Không thể hoàn tất.", code: result.error?.code || "RPG_ACTION_FAILED" });
  render("game");
}

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
  if (String(notice.code || "").startsWith("EVENT_")) {
    const old = root.querySelector("#event-modal");
    old?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "event-modal";
    dialog.className = `terminal-dialog event-modal ${String(notice.code).includes("CE_") ? "canon" : "planet"}`;
    dialog.innerHTML = `<section class="dialog-card panel"><span class="eyebrow amber-eyebrow">${escapeHtml(notice.title || "SỰ KIỆN")}</span><p>${escapeHtml(notice.message || "")}</p><button class="primary-button" data-action="close-event">ĐÃ HIỂU</button></section>`;
    root.append(dialog);
    dialog.showModal();
    window.setTimeout(() => { if (dialog.open) dialog.close(); dialog.remove(); }, 3000);
  }
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
  if (result.kind === "NearestPlanetSignal") return result.found ? `Hành tinh gần nhất: ${result.direction}, cách ${result.distance} ô.` : "Không còn hành tinh nào có tài nguyên.";
  if (result.kind === "OpponentSignal") return `Tín hiệu đối thủ: ${result.direction}.`;
  if (result.kind === "Mined") return `Đã thu được ${result.amount} ${resourceLabel(result.resource)}.`;
  if (result.kind === "MinedAll") {
    const parts = Object.entries(result.resources || {}).map(([k, v]) => `${v} ${resourceLabel(k)}`);
    return parts.length ? `Đã thu được ${parts.join(", ")}.` : "Không thu được tài nguyên.";
  }
  if (result.kind === "Deposited") return `Đã nộp hàng; +${result.scoreAdded} điểm Trái Đất.`;
  if (result.kind === "Recharged") return `Pin +${result.batteryAdded}.`;
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
    const moveSteps = selected === "MOVE" && selectedCell ? distanceBetween(view.player.position, selectedCell) : 0;
    const engineBonus = Number(view.player.inventory?.passives?.it_eco_engine || 0);
    const moveBattery = Math.max(0, moveSteps * 2 * (view.activeEvent === "CE_ReverseGravity" ? 2 : 1) - moveSteps * engineBonus);
    const cost = selected === "MOVE" && moveSteps ? `${moveSteps} AP · ${moveBattery} PIN`
      : selected === "DEPOSIT" && distanceBetween(view.player.position, view.earth) > 0 ? "1 AP · 2 PIN"
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
  return `<div class="recharge-controls"><label>TÀI NGUYÊN<select id="recharge-resource">${resources.map((type) => `<option value="${escapeHtml(type)}" ${type === rechargeSelection.resource ? "selected" : ""}>${escapeHtml(resourceLabel(type))} · ${storage[type]} đơn vị</option>`).join("")}</select></label><label>SỐ LƯỢNG<input id="recharge-amount" type="number" min="1" max="${amountAvailable}" step="1" value="${rechargeSelection.amount}" /></label><span class="recharge-preview">ƯỚC TÍNH +${points} PIN</span></div>`;
}

function mineControlsMarkup(view) {
  const stock = view.player.currentPlanetStock || {};
  const resources = Object.keys(stock).filter((type) => stock[type] > 0);
  if (!resources.length) return `<p class="field-note">Đứng trên hành tinh có tài nguyên để khai thác.</p>`;
  if (!resources.includes(mineSelection)) mineSelection = resources[0];
  return `<div class="recharge-controls"><label>TÀI NGUYÊN<select id="mine-resource">${resources.map((type) => `<option value="${escapeHtml(type)}" ${type === mineSelection ? "selected" : ""}>${escapeHtml(resourceLabel(type))} · ${stock[type]} đơn vị</option>`).join("")}</select></label></div>`;
}

function confirmationDialogMarkup(view) {
  if (actionFlow.status !== "confirming" || !actionFlow.selected) return "";
  const action = actionFlow.selected;
  const args = getActionArgs(action);
  const cost = action === "DEPOSIT" && distanceBetween(view.player.position, view.earth) > 0 ? "1 AP · 2 PIN" : commandDefinitions.find(([name]) => name === action)?.[1];
  
  // Rút gọn câu hỏi
  let summary = action === "DEPOSIT"
    ? `Nộp ${view.player.cargoUsed} đơn vị hàng về Trái Đất?`
    : action === "END_TURN" ? "Kết thúc lượt ngay?"
      : `Dùng ${args.amount} ${resourceLabel(args.resource)} để sạc pin?`;

  // Chỉ hiện chi phí nếu không phải là Kết thúc lượt
  const costMarkup = action !== "END_TURN" 
    ? `<div class="confirmation-cost">CHI PHÍ: <strong>${escapeHtml(cost || "—")}</strong></div>` 
    : "";

  return `
    <dialog id="action-confirm-dialog" class="terminal-dialog action-confirm-dialog" aria-labelledby="action-confirm-title">
      <div class="dialog-card panel">
        <h2 id="action-confirm-title" class="confirm-title">${escapeHtml(summary)}</h2>
        ${costMarkup}
        <div class="confirm-actions">
          <button class="primary-button" type="button" data-action="confirm-command">ĐỒNG Ý</button>
          <button class="utility-button" type="button" data-action="cancel-confirmation">HỦY</button>
        </div>
      </div>
    </dialog>`;
}

function getActionArgs(action) {
  if (action === "MOVE") return { target: selectedCell ? { ...selectedCell } : null };
  if (action === "MINE") return { resource: mineSelection };
  if (action === "RECHARGE") return { resource: rechargeSelection.resource, amount: Number(rechargeSelection.amount) };
  return {};
}

function gameScreen() {
  const view = playerView;
  const player = view.player;
  const cargoItems = Object.entries(player.cargo);
  const cargoRows = cargoItems.map(([name, amount]) => `<li><span><i class="resource-glyph resource-${String(name).toLowerCase()}" aria-hidden="true">${resourceGlyphs[name] || "◆"}</i>${resourceLabel(name)}</span><b>${amount}</b></li>`).join("");
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
        <div class="overview-header-actions">
          <button class="utility-button" data-action="close-overview" autofocus>ĐÓNG <span aria-hidden="true">×</span></button>
        </div>
        <div class="overview-canvas-wrap"><canvas id="overview-canvas" class="overview-canvas" role="img" aria-label="Bản đồ tổng quan chỉ hiển thị Trái Đất, tàu của bạn và hành tinh đã khám phá."></canvas></div>
      </div>
    </dialog>` : "";

  return `
    <section class="game-screen" aria-label="Giao diện trận đấu">
      <div class="game-turnbar panel"><div class="turn-readout"><span class="eyebrow">VÒNG</span><strong>${String(view.turn.round).padStart(2, "0")} <small>/ ${view.turn.roundMax}</small></strong></div><div class="turn-divider"></div><div class="turn-status"><span class="status-indicator"></span><div><strong>${view.turn.isMyTurn ? "LƯỢT CỦA BẠN" : "LƯỢT ĐỐI THỦ"}</strong><span>${view.turn.activePlayer === "Player 1" ? "NGƯỜI CHƠI 1" : "NGƯỜI CHƠI 2"}</span></div></div><div class="turn-right"><span class="field-label">PHIÊN</span><strong>TRẬN ĐẤU</strong><button class="utility-button game-leave-button" data-action="leave-room" ${lobbyBusy || pendingAction ? "disabled" : ""}>RỜI TRẬN</button></div></div>
      <div id="toast-region" class="toast-region" aria-live="polite" ${activeToast ? "" : "hidden"}>${toastMarkup()}</div>
      <div class="game-grid">
        <aside class="ship-hud panel" aria-labelledby="ship-hud-title">
          <div class="panel-heading"><h2 id="ship-hud-title">THÔNG TIN TÀU</h2></div>
          <div class="hud-content">
            <section class="hud-position"><span class="field-label">VỊ TRÍ TÀU</span><strong>(${player.position.x}, ${player.position.y})</strong></section>
            
            <div class="meter-block"><div class="meter-label"><span>AP</span><strong>${player.ap} <small>/ ${player.apMax}</small></strong></div><div class="meter-track meter-green" role="progressbar" aria-label="Điểm hành động" aria-valuemin="0" aria-valuemax="${player.apMax}" aria-valuenow="${player.ap}"><span style="width:${apWidth}%"></span></div></div>
            
            <div class="meter-block"><div class="meter-label"><span>BATTERY</span><strong>${player.battery} <small>/ ${player.batteryMax}</small></strong></div><div class="meter-track meter-amber" role="progressbar" aria-label="Pin" aria-valuemin="0" aria-valuemax="${player.batteryMax}" aria-valuenow="${player.battery}"><span style="width:${batteryWidth}%"></span></div></div>
            
            <div class="hud-section-title"><span>KHO CHỨA</span><span>${player.cargoUsed} / ${player.cargoCapacity}</span></div>
            <div class="meter-track cargo-meter" role="progressbar" aria-label="Sức chứa hàng hóa" aria-valuemin="0" aria-valuemax="${player.cargoCapacity}" aria-valuenow="${player.cargoUsed}"><span style="width:${cargoWidth}%"></span></div>
            <ul class="cargo-list">${cargoRows}</ul>
            
            <section class="score-block"><div class="meter-label"><span>SCORE</span><strong>${player.earthScore} <small>/ ${player.earthScoreTarget}</small></strong></div><div class="meter-track score-meter" role="progressbar" aria-label="Điểm Trái Đất đến mục tiêu chiến thắng" aria-valuemin="0" aria-valuemax="${player.earthScoreTarget}" aria-valuenow="${player.earthScore}"><span style="width:${scoreWidth}%"></span></div></section>
          </div>
        </aside>

        <section class="tactical-panel panel" aria-labelledby="map-title">
          <div class="panel-heading map-panel-heading"><h2 id="map-title">BẢN ĐỒ CHIẾN THUẬT</h2><div class="map-controls"><button class="map-control-button" data-action="reset-to-ship" title="Đưa bản đồ về vị trí tàu">VỀ VỊ TRÍ TÀU</button><button class="map-control-button" data-action="open-overview">TOÀN KHU VỰC</button><button class="map-control-button" data-action="clear-target" ${selectedCell ? "" : "hidden"}>BỎ CHỌN</button></div></div>
          <div class="map-preview">${renderMapPreview(view)}</div>
        </section>

        <aside class="target-panel panel" aria-labelledby="target-title">
          <div class="panel-heading"><h2 id="target-title">THÔNG TIN MỤC TIÊU</h2></div>
          <div class="target-content">${targetPreviewPanel(view)}</div>
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
      <div class="game-statusbar"><span><span class="live-mark"></span> ĐÃ KẾT NỐI MÁY CHỦ</span><span>${selectedCell ? `MỤC TIÊU: (${selectedCell.x}, ${selectedCell.y}) / ${cellStatusLabel(selectedInfo.status)}` : "CHỌN MỘT Ô / CHƯA CÓ MỤC TIÊU"}</span><span>${view.turn.isMyTurn ? "ĐẾN LƯỢT CỦA BẠN" : "ĐANG CHỜ LƯỢT ĐỐI THỦ"}</span></div>
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
  const statusbar = root.querySelector(".game-statusbar");
  if (!target || !statusbar) return;
  
  target.innerHTML = targetPreviewPanel(view);
  const info = getCellInfo(view, selectedCell);
  
  const clearBtn = root.querySelector('.map-controls [data-action="clear-target"]');
  if (clearBtn) clearBtn.hidden = !selectedCell;

  statusbar.children[1].textContent = selectedCell
    ? `MỤC TIÊU: (${selectedCell.x}, ${selectedCell.y}) / ${cellStatusLabel(info.status)}`
    : "CHỌN MỘT Ô / CHƯA CÓ MỤC TIÊU";
    
  const commandPanel = root.querySelector(".command-console");
  if (commandPanel) commandPanel.innerHTML = `<div class="panel-heading"><h2 id="command-title">BẢNG HÀNH ĐỘNG</h2></div>${commandSummaryMarkup(view)}`;
  renderRpgTools();
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
        drawTacticalMap();
        return;
      }
    }
    hoverCell = cellAtPoint(canvas, event.clientX, event.clientY);
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

async function beginMatchTransition() {
  if (lobbyBusy) return;
  lobbyBusy = true;
  matchViewInitialized = false;
  matchResult = null;
  matchLinkLost = false;
  matchConnectStatus = "Đang kết nối với máy chủ…";
  render("waiting-room");
  const matchResponse = await window.gameAdapter.startMatch();
  lobbyBusy = false;
  if (!matchResponse.ok) {
    matchLinkNotice = `${matchResponse.error.code}: ${matchResponse.error.message}`;
    matchLinkLost = true;
    render("link-lost");
    return;
  }
  // The adapter normally publishes this view through subscribePlayerViews.
  // Use the resolved startMatch view as a fallback so a missed event cannot
  // leave the player stuck on the waiting screen.
  if (!matchViewInitialized) beginMatchFromView(matchResponse.playerView);
}

function beginMatchFromView(view) {
  if (matchViewInitialized) return;
  if (!view?.player?.position || !view?.turn || !Array.isArray(view.knownPlanets)) {
    matchLinkLost = true;
    matchLinkNotice = "Máy chủ đã ghép trận nhưng dữ liệu bản đồ không hợp lệ.";
    render("link-lost");
    return;
  }
  playerView = view;
  updateTurnDeadline(view);
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
  try {
    render("game");
    matchViewInitialized = true;
  } catch (error) {
    console.error("Không thể dựng giao diện trận đấu:", error);
    matchLinkLost = true;
    matchLinkNotice = `Đã nhận trận từ máy chủ nhưng giao diện bị lỗi: ${error?.message || error}`;
    try { render("link-lost"); }
    catch (fallbackError) { console.error("Không thể dựng màn hình lỗi:", fallbackError); }
  }
}

function render(screen = currentScreen) {
  currentScreen = screen;
  pendingAction = actionFlow.status === "pending";
  
  updateBgm(screen === "game"); // <-- THÊM DÒNG NÀY ĐỂ TỰ ĐỘNG ĐỔI NHẠC
  
  root.innerHTML = screen === "help" ? helpScreen()
    : screen === "lobby" ? lobbyHomeScreen()
    : screen === "settings" ? settingsScreen()
      : screen === "link-lost" ? linkLostScreen()
        : screen === "match-result" ? matchResultScreen()
          : screen === "waiting-room" || screen === "initializing" ? initializingScreen()
            : screen === "game" ? gameScreen()
              : homeScreen();

  applySettings();
  if (screen === "game") renderRpgTools();
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

async function sendCommand() {
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
  if (currentScreen === "match-result" || currentScreen === "link-lost") return;
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

function showAugmentUI(offers) {
    augmentOffers = offers;
    augmentDeadline = Date.now() + 30000;
    renderAugmentOverlay();
    if (augmentTimerInterval) clearInterval(augmentTimerInterval);
    augmentTimerInterval = setInterval(updateAugmentCountdown, 100);
}

function hideAugmentUI() {
    augmentOffers = null;
    if (augmentTimerInterval) clearInterval(augmentTimerInterval);
    root.querySelector("#augment-overlay")?.remove();
}

function getRarityLabel(rarity) {
    if (rarity === "silver") return "BẠC";
    if (rarity === "gold") return "VÀNG";
    if (rarity === "diamond") return "KIM CƯƠNG";
    return String(rarity).toUpperCase();
}

function getAugmentInfo(type, rarity) {
    let icon = "❓", name = "Chưa xác định", baseDesc = "";
    if (type === "battery_max") {
        icon = "⚡"; name = "Tụ Điện Siêu Cấp";
        const amt = rarity === "silver" ? 20 : rarity === "gold" ? 35 : 50;
        baseDesc = `Tăng vĩnh viễn ${amt} Pin tối đa.`;
    } else if (type === "move_cost") {
        icon = "🚀"; name = "Động Cơ Phản Vật Chất";
        const amt = rarity === "silver" ? 1 : rarity === "gold" ? 2 : 3;
        baseDesc = `Giảm ${amt} Pin tiêu hao mỗi bước Di chuyển.`;
    } else if (type === "cargo_max") {
        icon = "🎒"; name = "Khoang Hàng Không Gian";
        const amt = rarity === "silver" ? 10 : rarity === "gold" ? 20 : 30;
        baseDesc = `Tăng vĩnh viễn ${amt} sức chứa hàng hóa.`;
    } else if (type === "ap_max") {
        icon = "⚙️"; name = "Lõi Năng Lượng";
        const amt = rarity === "silver" ? 1 : rarity === "gold" ? 2 : 3;
        baseDesc = `Tăng vĩnh viễn ${amt} AP tối đa.`;
    } else if (type === "midas") {
        icon = "💎"; name = "Bàn Tay Midas";
        const amt = rarity === "silver" ? 20 : rarity === "gold" ? 50 : 100;
        baseDesc = `${amt}% tỉ lệ nhận thêm 1 tài nguyên hiếm khi Khai thác.`;
    } else if (type === "luck") {
        icon = "🍀"; name = "Thần Tài Gõ Cửa";
        const amt = rarity === "silver" ? 10 : rarity === "gold" ? 20 : 30;
        baseDesc = `Tăng ${amt} Luck (tỉ lệ rớt nhiều tài nguyên hơn).`;
    } else if (type === "scan_radius") {
        icon = "👁️"; name = "Mắt Thần";
        const amt = rarity === "silver" ? 1 : rarity === "gold" ? 2 : 3;
        baseDesc = `Tăng ${amt} bán kính Quan sát và Quét khu vực.`;
    } else if (type === "craft_discount") {
        icon = "🛠️"; name = "Thợ Chế Tạo";
        const amt = rarity === "silver" ? 1 : rarity === "gold" ? 2 : 3;
        baseDesc = `Giảm ${amt} tài nguyên cần thiết khi Chế tạo vật phẩm (tối thiểu 1).`;
    }
    return { icon, name, desc: baseDesc };
}

function renderAugmentOverlay() {
    if (!augmentOffers) return;
    root.querySelector("#augment-overlay")?.remove();

    const offersHtml = augmentOffers.map((offer, index) => {
        const info = getAugmentInfo(offer.type, offer.rarity);
        return `
            <article class="augment-card rarity-${offer.rarity}" data-augment-index="${index}">
                <span class="augment-icon">${info.icon}</span>
                <h3 class="augment-name">${info.name}</h3>
                <span class="augment-rarity">${getRarityLabel(offer.rarity)}</span>
                <p class="augment-desc">${info.desc}</p>
            </article>
        `;
    }).join("");

    const overlay = document.createElement("div");
    overlay.id = "augment-overlay";
    overlay.className = "augment-overlay";
    overlay.innerHTML = `
        <div class="augment-container">
            <div class="augment-header">
                <h2>CHỌN NÂNG CẤP</h2>
                <div id="augment-timer" class="augment-timer">00:30</div>
            </div>
            <div class="augment-cards">${offersHtml}</div>
            <div id="augment-waiting" class="augment-waiting" hidden>
                <span class="wait-ring"></span> Đang chờ đối thủ chọn...
            </div>
        </div>
    `;
    root.append(overlay);
    updateAugmentCountdown();

    overlay.querySelectorAll(".augment-card").forEach(card => {
        card.addEventListener("click", () => {
            if (!augmentOffers) return;
            const index = Number(card.dataset.augmentIndex);
            pickAugment(index);
        });
    });
}

function updateAugmentCountdown() {
    if (!augmentOffers) return;
    const timerEl = root.querySelector("#augment-timer");
    if (!timerEl) return;
    const seconds = Math.max(0, Math.ceil((augmentDeadline - Date.now()) / 1000));
    timerEl.textContent = `00:${String(seconds).padStart(2, "0")}`;
}

function pickAugment(index) {
    if (!augmentOffers) return;
    augmentOffers = null;
    window.gameAdapter.submitAugment(index);
    const overlay = root.querySelector("#augment-overlay");
    if (overlay) {
        const cards = overlay.querySelector(".augment-cards");
        if (cards) cards.style.opacity = "0.3";
        const waiting = overlay.querySelector("#augment-waiting");
        if (waiting) waiting.hidden = false;
        const timerEl = overlay.querySelector("#augment-timer");
        if (timerEl) timerEl.style.opacity = "0.3";
    }
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (settings.sound && activeBgm && activeBgm.paused) activeBgm.play().catch(() => {});
  if (button.dataset.screen) {
    if (pendingAction) return;
    render(button.dataset.screen);
  } else if (button.dataset.command) {
    if (pendingAction || !playerView.turn.isMyTurn) return;
    actionFlow = { status: "selected", selected: button.dataset.command, result: null };
    updateTargetDisplay();
    root.querySelector(`[data-command="${button.dataset.command}"]`)?.focus();
  } else if (button.dataset.rpgTab) {
    rpgTab = button.dataset.rpgTab;
    openRpgDialog("craft");
  } else if (button.dataset.rpgAction === "craft") {
    submitRpgAction("CRAFT", button.dataset.item);
  } else if (button.dataset.rpgAction === "use") {
    submitRpgAction("USE_ITEM", button.dataset.item);
  } else if (button.dataset.action === "open-crafting") {
    rpgTab = "Active";
    openRpgDialog("craft");
  } else if (button.dataset.action === "open-inventory") {
    openRpgDialog("inventory");
  } else if (button.dataset.action === "open-events") {
    eventTab = "planet";
    openRpgDialog("events");
  } else if (button.dataset.action === "open-augments") {
    openRpgDialog("augments");
  } else if (button.dataset.eventTab) {
    eventTab = button.dataset.eventTab;
    openRpgDialog("events");
  } else if (button.dataset.action === "close-rpg" || button.dataset.action === "close-event") {
    button.closest("dialog")?.close();
    button.closest("dialog")?.remove();
  } else if (button.dataset.action === "exit") {
    showExitDialog();
  } else if (button.dataset.action === "connect-match") {
    beginMatchTransition();
  } else if (button.dataset.action === "real-match" || button.dataset.action === "mock-match") {
    const url = new URL(window.location.href);
    if (button.dataset.action === "mock-match") url.searchParams.set("mock", "1");
    else url.searchParams.delete("mock");
    url.searchParams.set("start", "1");
    window.location.assign(url);
  } else if (button.dataset.action === "leave-room") {
    leaveMatch();
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
    sendCommand();
  } else if (button.dataset.action === "review-command") {
    if (!pendingAction && actionFlow.selected) {
      actionFlow.status = "confirming";
      render("game");
    }
  } else if (button.dataset.action === "confirm-command") {
    sendCommand();
  } else if (button.dataset.action === "cancel-confirmation") {
    actionFlow.status = "selected";
    render("game");
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

async function leaveMatch() {
  if (lobbyBusy) return;
  lobbyBusy = true;
  await window.gameAdapter.leaveRoom();
  lobbyBusy = false;
  playerView = null;
  render("home");
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
    if (activeBgm) activeBgm.volume = settings.volume / 100;
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
  } else if (control.id === "mine-resource") {
    mineSelection = control.value;
  } else if (control.id === "sound-toggle") {
    settings.sound = control.checked;
    control.nextElementSibling.nextElementSibling.textContent = settings.sound ? "BẬT" : "TẮT";
    applySettings();
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
if (!countdownTimer) countdownTimer = window.setInterval(updateTurnCountdown, 250);
window.gameAdapter.subscribeNotifications(showAdapterNotification);
window.gameAdapter.subscribePlayerViews((nextView) => {
  if (!nextView) return;
  if (currentScreen === "waiting-room" || (currentScreen === "initializing" && !matchViewInitialized)) {
    lobbyBusy = false;
    beginMatchFromView(nextView);
    return;
  }
  playerView = nextView;
  updateTurnDeadline(nextView);
  if (currentScreen === "game") render("game");
});

window.gameAdapter.subscribeAugmentEvents((event) => {
    if (event.type === "offer") {
        showAugmentUI(event.offers);
    } else if (event.type === "result") {
        hideAugmentUI();
    }
});
window.gameAdapter.subscribeMatchResults((result) => {
  matchResult = result;
  summaryNotice = "ĐÃ NHẬN KẾT QUẢ TRẬN";
  render("match-result");
});

window.gameAdapter.subscribeConnectionStates?.(({ state, message }) => {
  if (state === "connecting" || state === "waiting") {
    matchConnectStatus = message;
    if (currentScreen === "waiting-room" || currentScreen === "initializing") {
      const status = root.querySelector("#match-connect-status");
      if (status) status.textContent = message;
    }
  } else if (state === "disconnected" && (currentScreen === "game" || (currentScreen === "initializing" && matchViewInitialized))) {
    matchLinkLost = true;
    matchLinkNotice = message || "Kết nối bị gián đoạn. Kết quả trận chưa được xác nhận.";
    render("link-lost");
  }
});

const launchParams = new URLSearchParams(window.location.search);
if (launchParams.get("start") === "1") {
  launchParams.delete("start");
  const cleanQuery = launchParams.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash}`);
  render("lobby");
  beginMatchTransition();
}

window.addEventListener("resize", () => {
  if (currentScreen !== "game") return;
  drawTacticalMap();
  drawSectorOverview();
});
