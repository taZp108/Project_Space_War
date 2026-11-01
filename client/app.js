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
let cameraAnimFrame = 0;
let lastGlyphDrawAt = 0;   // ← THÊM DÒNG NÀY
let activeToast = null;
// ═══ STATE CHO AUGMENT & CANON QUEUE ═══
let isAugmentPhaseActive = false;
let augmentResultReceived = false;
let isAugmentAnimPlaying = false;
let pendingCanonEvents = [];
let canonFlushTimer = null;
// ═══ STATE CHO TURN TRANSITION ═══
let lastTurnToken = null;
let pendingTurnStartAnim = false;
let toastQueue = [];
let toastTimer = null;
const recentToastKeys = new Map();
let audioContext = null;
const camera = { x: 50, y: 51, zoom: 1 };

// ═══ PERF: spatial cache & canvas preservation ═══
let cachedViewRef = null;
let cachedSpatial = null;
let cachedZonesRef = null;
let cachedZoneMap = null;
let canvasWithListeners = null;
let pendingHoverRedraw = 0;
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
  OPEN_CRATE: "MỞ HÒM",
  INTERACT_MONOLITH: "TƯƠNG TÁC BIA ĐÁ",
  ACTIVATE_BEACON: "KÍCH HOẠT HẢI ĐĂNG",
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
  
  const monolith = (view.monoliths || []).find(m => m.pos.x === cell.x && m.pos.y === cell.y);
  if (monolith) return { status: "MONOLITH", object: monolith };
  
  const beacon = (view.beacons || []).find(b => b.pos.x === cell.x && b.pos.y === cell.y);
  if (beacon) return { status: "BEACON", object: beacon };

  const crate = (view.crates || []).find(c => c.pos.x === cell.x && c.pos.y === cell.y);
  if (crate) return { status: "CRATE", object: crate };
  
  const wh = (view.knownWormholes || []).find(w => w.pos.x === cell.x && w.pos.y === cell.y);
  if (wh) return { status: "WORMHOLE", object: wh };

  const planet = view.knownPlanets.find((item) => item.position.x === cell.x && item.position.y === cell.y);
  if (planet) return { status: "KNOWN PLANET", object: planet };
  
  if (cell.x === view.player.position.x && cell.y === view.player.position.y) return { status: "OWN SHIP", object: null };
  
  const zone = (view.zones || []).find(z => {
    const dx = Math.abs(cell.x - z.pos.x), dy = Math.abs(cell.y - z.pos.y);
    if (z.shape === "circle") return dx + dy <= z.radius;
    if (z.shape === "rect") return dx <= z.width/2 && dy <= z.height/2;
    return false;
  });
  if (zone) return { status: "ZONE", object: zone };

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

  if (info.status === "MONOLITH") {
    return `<div class="target-state target-monolith"><span class="target-glyph" style="color:#d1a8ff; border-color:#d1a8ff; text-shadow:0 0 10px #d1a8ff;">⛧</span><div><span class="field-label">TRẠNG THÁI Ô</span><strong>BIA ĐÁ CỔ ĐẠI</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y})</span></div></div><p class="target-note">Tương tác để cầu nguyện (Mất 20 Pin). Có thể nhận thưởng lớn hoặc bị nguyền rủa.</p>`;
  }
  if (info.status === "BEACON") {
    const b = info.object;
    const statusText = b.active ? "ĐÃ KÍCH HOẠT" : "CHƯA KÍCH HOẠT";
    return `<div class="target-state target-beacon"><span class="target-glyph" style="color:#ffd700; border-color:#ffd700; text-shadow:0 0 10px #ffd700;">⍾</span><div><span class="field-label">TRẠNG THÁI Ô</span><strong>HẢI ĐĂNG KHÔNG GIAN</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y}) · ${statusText}</span></div></div>${!b.active ? '<p class="target-note">Kích hoạt để quét sạch sương mù khu vực (1 AP).</p>' : ''}`;
  }
  if (info.status === "CRATE") {
    return `<div class="target-state target-crate"><span class="target-glyph" style="color:var(--amber); border-color:var(--amber);">▣</span><div><span class="field-label">TRẠNG THÁI Ô</span><strong>HÒM TIẾP TẾ</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y})</span></div></div><p class="target-note">Đứng lên và bấm MỞ HÒM.</p>`;
  }  if (info.status === "WORMHOLE") {
    const partner = (view.knownWormholes || []).find(w => w.id === info.object.pairedWith);
    const dest = partner ? `(${partner.pos.x}, ${partner.pos.y})` : "CHƯA RÕ";
    return `<div class="target-state target-wormhole"><span class="target-glyph" style="color:#79d7ff; border-color:#79d7ff;">◉</span><div><span class="field-label">TRẠNG THÁI Ô</span><strong>CỔNG KHÔNG GIAN</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y})</span></div></div><dl class="target-details"><div><dt>DỊCH CHUYỂN ĐẾN</dt><dd>${dest}</dd></div></dl>`;
  }
  if (info.status === "ZONE") {
    const z = info.object;
    const names = { jamming: "NHIỄU SÓNG", radiation: "PHÓNG XẠ", zero_g: "KHÔNG TRỌNG LỰC", swamp: "ĐẦM LẦY", gold_rush: "KINH TẾ" };
    return `<div class="target-state target-zone zone-${z.type}"><span class="target-glyph">◈</span><div><span class="field-label">VÙNG</span><strong>${names[z.type] || z.type}</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y})</span></div></div>`;
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
  ["OPEN_CRATE", "0 AP · 0 PIN", ""], // ▼▼ MỚI ▼▼
  ["DEPOSIT", "1 AP · 0–2 PIN", ""],
  ["RECHARGE", "1 AP · 0 PIN", ""],
  ["INTERACT_MONOLITH", "0 AP · 20 PIN", ""],
  ["ACTIVATE_BEACON", "1 AP · 0 PIN", ""],
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

    // BẢNG NHIỆM VỤ
  if (mode === "objectives") {
    const list = view.objectives || [];
    return `<dialog class="terminal-dialog rpg-dialog" id="rpg-dialog"><section class="dialog-card panel"><span class="eyebrow amber-eyebrow">CƠ SỞ DỮ LIỆU</span><h2>NHIỆM VỤ</h2><div class="rpg-items">${list.map((o) => {
      
      // ── XỬ LÝ LOẠI NHIỆM VỤ ──
      // Lấy dữ liệu từ nhiều nguồn có thể có của Server
      let rawKind = (o.type?.kind || o.type?.tag || o.type || "").toString().toLowerCase();
      let n = o.type?.n || o.type?.contents || o.type?.amount || o.type?.value || 0;
      
      // Chuẩn hóa từ khóa (chống mọi kiểu viết của server)
      let kind = "unknown";
      if (rawKind.includes("move")) kind = "move_cells";
      else if (rawKind.includes("mine")) kind = "mine_times";
      else if (rawKind.includes("scan")) kind = "scan_times";
      else if (rawKind.includes("crate")) kind = "open_crates";
      else if (rawKind.includes("wormhole")) kind = "use_wormholes";

      // Tạo câu mô tả
      let desc = `Nhiệm vụ chưa xác định (Data: ${JSON.stringify(o.type)})`; // Hiện data thô nếu lỗi
      if (kind === "move_cells") desc = `Di chuyển ${n} ô trong 1 lượt`;
      else if (kind === "mine_times") desc = `Khai thác ${n} lần trong 1 lượt`;
      else if (kind === "scan_times") desc = `Quét ${n} lần trong 1 lượt`;
      else if (kind === "open_crates") desc = `Mở ${n} hòm tiếp tế`;
      else if (kind === "use_wormholes") desc = `Đi qua ${n} cổng không gian`;
      
      // ── XỬ LÝ PHẦN THƯỞNG ──
      let rewardHtml = "";
      if (o.reward) {
        let rewards = [];
        // Trường hợp 1: Phần thưởng là object resources { Iron: 5, Crystal: 2 }
        let resObj = o.reward.resources || o.reward;
        if (resObj && typeof resObj === 'object') {
          for (const [res, amt] of Object.entries(resObj)) {
            if (typeof amt === 'number' && amt > 0) {
              rewards.push(`<span class="reward-item">${resourceGlyphs[res] || "◆"} ${resourceLabel(res)} ×${amt}</span>`);
            }
          }
        }
        // Trường hợp 2: Phần thưởng là item (chủ động/bị động)
        if (o.reward.item || o.reward.active_item || o.reward.passive_item) {
          let itemId = o.reward.item || o.reward.active_item || o.reward.passive_item;
          let itemInfo = rpgItems.find(i => i.id === itemId);
          rewards.push(`<span class="reward-item" style="color:var(--green);">⚡ ${itemInfo ? itemInfo.name : itemId}</span>`);
        }
        // Trường hợp 3: Phần thưởng là augment
        if (o.reward.augment) {
           rewards.push(`<span class="reward-item" style="color:#00ffff;">💎 Nâng cấp ${getRarityLabel(o.reward.augment)}</span>`);
        }
        
        if (rewards.length > 0) {
          rewardHtml = `<div class="reward-box">🎁 THƯỞNG: ${rewards.join(" · ")}</div>`;
        }
      }
      
      const diffColors = { easy: "var(--green-soft)", medium: "var(--amber)", hard: "var(--danger)" };
      const diffNames = { easy: "DỄ", medium: "TRUNG BÌNH", hard: "KHÓ" };
      
      return `<article class="rpg-item" style="grid-template-columns: 1fr auto; border-color: ${diffColors[o.difficulty] || 'var(--border)'}">
        <div class="rpg-item-copy">
          <strong style="color:${diffColors[o.difficulty] || 'var(--text)'}">${diffNames[o.difficulty] || "KHÔNG RÕ"}</strong>
          <span style="margin-bottom: 0.25rem;">${desc}</span>
          ${rewardHtml}
        </div>
        <button class="primary-button" data-rpg-action="claim" data-id="${o.id}" ${(!o.completed || o.claimed || kind === "unknown") ? "disabled" : ""} style="${kind === "unknown" ? "border-color: var(--danger); color: var(--danger);" : ""}">
          ${kind === "unknown" ? "LỖI DATA" : o.claimed ? "ĐÃ NHẬN" : o.completed ? "NHẬN" : "CHƯA XONG"}
        </button>
      </article>`;
    }).join("")}</div><button class="utility-button" data-action="close-rpg">ĐÓNG</button></section></dialog>`;
  }

  // BẢNG TÚI ĐỒ
  const inv = view.player.inventory || { passives: {}, actives: [] };
  const actives = (inv.actives || []).map((id) => { const key = String(id).toLowerCase(); const item = rpgItems.find((entry) => entry.id === key) || { name: key, icon: "◇", desc: "Vật phẩm không xác định." }; return `<article class="rpg-item" data-tooltip="${item.desc}"><span class="rpg-item-icon">${item.icon}</span><div class="rpg-item-copy"><strong>${item.name}</strong><small>CHỦ ĐỘNG · CÓ THỂ DÙNG</small></div><button class="primary-button" data-rpg-action="use" data-item="${item.id}">SỬ DỤNG</button></article>`; }).join("");
  const passives = Object.entries(inv.passives || {}).map(([id, n]) => { const item = rpgItems.find((entry) => entry.id === id.toLowerCase()) || { name: id, icon: "▣", desc: "Vật phẩm không xác định." }; return `<article class="rpg-item" data-tooltip="${item.desc}"><span class="rpg-item-icon">${item.icon}</span><div class="rpg-item-copy"><strong>${item.name}</strong><small>BỊ ĐỘNG · CỘNG DỒN</small></div><b>× ${n}</b></article>`; }).join("");
  return `<dialog class="terminal-dialog rpg-dialog" id="rpg-dialog"><section class="dialog-card panel"><span class="eyebrow amber-eyebrow">TRANG BỊ</span><h2>TÚI ĐỒ</h2><div class="rpg-items">${actives}${passives}${actives || passives ? "" : '<p class="field-note">Túi đồ đang trống.</p>'}</div><button class="utility-button" data-action="close-rpg">ĐÓNG</button></section></dialog>`;
}


function openRpgDialog(mode) {
  document.querySelector("#rpg-dialog")?.remove();
  document.body.insertAdjacentHTML("beforeend", rpgDialogMarkup(playerView, mode));
  
  const dialog = document.querySelector("#rpg-dialog");
  if (!dialog) return;
  dialog.showModal();

  // Fix: Gắn sự kiện click trực tiếp vào dialog vì nó nằm ngoài root
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.action === "close-rpg") {
      dialog.close();
      dialog.remove();
    } else if (button.dataset.rpgAction === "use") {
      submitRpgAction("USE_ITEM", button.dataset.item);
    } else if (button.dataset.rpgAction === "craft") {
      submitRpgAction("CRAFT", button.dataset.item);
    } else if (button.dataset.rpgAction === "claim") {
      submitRpgAction("CLAIM_OBJECTIVE", { id: Number(button.dataset.id) });
    } else if (button.dataset.rpgTab) {
      rpgTab = button.dataset.rpgTab;
      openRpgDialog("craft");
    } else if (button.dataset.eventTab) {
      eventTab = button.dataset.eventTab;
      openRpgDialog("events");
    }
  });
}
function renderRpgTools() {
  const heading = root.querySelector(".command-console .panel-heading");
  if (heading && !heading.querySelector(".rpg-tools")) {
    heading.insertAdjacentHTML("beforeend", '<div class="rpg-tools"><button type="button" data-action="open-crafting">CHẾ TẠO</button><button type="button" data-action="open-inventory">TÚI ĐỒ</button><button type="button" data-action="open-events">SỰ KIỆN</button><button type="button" data-action="open-augments">NÂNG CẤP</button><button type="button" data-action="open-objectives" id="btn-objectives">NHIỆM VỤ<span id="obj-badge" style="color:var(--amber); font-weight:bold;"></span></button></div>');
  }
  
  const badge = root.querySelector("#obj-badge");
  if (badge && playerView?.objectives) {
    const unclaimed = playerView.objectives.filter(o => o.completed && !o.claimed).length;
    badge.textContent = unclaimed > 0 ? ` (${unclaimed})` : "";
  }

  const turnRight = root.querySelector(".game-turnbar .turn-right");
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


async function submitRpgAction(action, item) {
  if (pendingAction || !playerView?.turn.isMyTurn) return;
  
  const dialog = document.querySelector("#rpg-dialog");
  if (dialog) {
    dialog.close();
    dialog.remove();
  }

  pendingAction = true;
  const previous = playerView;

  try {
    const result = await window.gameAdapter.submitAction(action, { item });

    // XỬ LÝ SỬ DỤNG VẬT PHẨM
    if (action === "USE_ITEM" && result.ok && result.playerView) {
      playerView = result.playerView;
      if (playerView.player?.position) {
        camera.x = playerView.player.position.x;
        camera.y = playerView.player.position.y;
      }
      playItemUseAnimation(item, result, previous, result.playerView, () => {
        playActionFeedback(action, result, previous, playerView);
        render("game");
      });
      return;
    }

    // XỬ LÝ CHẾ TẠO
    if (action === "CRAFT" && result.ok && result.playerView) {
      playerView = result.playerView;
      const itemInfo = rpgItems.find(i => i.id === item) || {};
      const isPassive = itemInfo.kind === "Passive";
      
      playCraftingAnimation(item, isPassive, () => {
        playActionFeedback(action, result, previous, playerView);
        render("game");
      });
      return;
    }

    // XỬ LÝ NHẬN NHIỆM VỤ
    if (action === "CLAIM_OBJECTIVE" && result.ok && result.playerView) {
       playerView = result.playerView;
       playActionFeedback(action, result, previous, playerView);
       enqueueToast({ level: "success", title: "HOÀN THÀNH NHIỆM VỤ", message: "Đã nhận thưởng thành công!", code: "OBJECTIVE_CLAIMED" });
       return;
    }

    if (result.ok) { 
      playerView = result.playerView; 
      playActionFeedback(action, result, previous, playerView); 
    } else {
      enqueueToast({ 
        level: "warning", 
        title: "HÀNH ĐỘNG BỊ TỪ CHỐI", 
        message: result.error?.message || result.error?.code || "Không thể hoàn tất.", 
        code: result.error?.code || "RPG_ACTION_FAILED" 
      });
    }
  } catch (err) {
    console.error("Lỗi khi gửi lệnh RPG:", err);
    enqueueToast({ 
      level: "error", 
      title: "LỖI HỆ THỐNG", 
      message: "Không thể kết nối tới máy chủ.", 
      code: "CLIENT_ERROR" 
    });
  } finally {
    pendingAction = false;
    render("game");
  }
}

function updateTurnCountdown() {
  const node = root.querySelector("#turn-countdown");
  if (!node || turnDeadlineMs === null) return;
  const seconds = Math.max(0, Math.ceil((turnDeadlineMs - Date.now()) / 1000));
  node.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  node.classList.toggle("expired", seconds <= 10);
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
  const code = String(notice.code || "");

  // ═══ CANON EVENT: Đưa vào hàng đợi ═══
  if (code.startsWith("EVENT_CE_")) {
    pendingCanonEvents.push(notice);
    if (canonFlushTimer) clearTimeout(canonFlushTimer);
    // Đợi 150ms cho chắc chắn gói augment_offer đã đến
    canonFlushTimer = setTimeout(flushCanonEvents, 150);
    return;
  }

  // Planet Event
  if (code.startsWith("EVENT_EV_")) {
    playPlanetEventAnimation(code, () => {
      showEventDialog(notice);
    });
    return;
  }

  // Thông báo khác
  if (code.startsWith("EVENT_")) {
    showEventDialog(notice);
    return;
  }

  enqueueToast({ level: notice.level || "info", title: notice.title || "SERVER NOTICE", message: notice.message || "", code: notice.code || "SERVER_NOTIFICATION" });
}

async function flushCanonEvents() {
  canonFlushTimer = null;
  
  if (isAugmentPhaseActive) return;
  if (pendingCanonEvents.length === 0) {
    checkPendingTurnStart();
    return;
  }
  
  const eventsToProcess = [...pendingCanonEvents];
  pendingCanonEvents = [];
  
  const processNext = async (idx) => {
    if (idx >= eventsToProcess.length) {
      checkPendingTurnStart(); // Xong hết event thì check xem có cần bung Turn Start không
      return;
    }
    const notice = eventsToProcess[idx];
    const code = String(notice.code || "");
    
    playCanonEventAnimation(code, async () => {
      await showEventDialog(notice); // Đợi người chơi bấm ĐÃ HIỂU
      processNext(idx + 1); // Sau đó mới chạy event tiếp theo (nếu có)
    });
  };
  processNext(0);
} 

function showEventDialog(notice) {
  return new Promise((resolve) => {
    const old = document.querySelector("#event-modal");
    old?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "event-modal";
    dialog.className = `terminal-dialog event-modal ${String(notice.code).includes("CE_") ? "canon" : "planet"}`;
    dialog.innerHTML = `<section class="dialog-card panel"><span class="eyebrow amber-eyebrow">${escapeHtml(notice.title || "SỰ KIỆN")}</span><p>${escapeHtml(notice.message || "")}</p><button class="primary-button" data-action="close-event">ĐÃ HIỂU</button></section>`;
    document.body.append(dialog);
    dialog.showModal();

    // ═══ GẮN SỰ KIỆN CLICK TRỰC TIẾP CHO NÚT ĐÃ HIỂU ═══
    const closeBtn = dialog.querySelector('[data-action="close-event"]');
    if (closeBtn) {
      closeBtn.addEventListener("click", () => dialog.close());
    }

    // Cho phép đóng bằng Escape
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      dialog.close();
    });

    // Fallback: tự đóng sau 30s nếu người chơi không bấm
    const autoCloseTimer = setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 30000);

    dialog.addEventListener("close", () => {
      clearTimeout(autoCloseTimer);
      dialog.remove();
      resolve();
    }, { once: true });

    enqueueToast({ level: notice.level || "info", title: notice.title || "SERVER NOTICE", message: notice.message || "", code: notice.code || "SERVER_NOTIFICATION" });
  });
}

function playPlanetEventAnimation(eventCode, onComplete) {
  const eventName = eventCode.replace("EVENT_", "");

  // Xoá overlay cũ nếu còn sót
  document.querySelector("#event-animation-overlay")?.remove();

  // Tạo overlay che toàn màn hình, chặn click
  const overlay = document.createElement("div");
  overlay.id = "event-animation-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    pointer-events: auto; cursor: wait;
    background: rgba(0, 0, 0, 0);
  `;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%;";
  overlay.append(canvas);
  document.body.append(overlay);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  let w = window.innerWidth;
  let h = window.innerHeight;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const cx = w / 2;
  const cy = h / 2;
  const startTime = performance.now();
  const DURATION = 3000; // 3 giây cho animation

  const particles = [];
  for (let i = 0; i < 100; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      speed: Math.random() * 10 + 5,
      size: Math.random() * 4 + 2,
      offset: Math.random() * 100
    });
  }

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / DURATION);

    ctx.clearRect(0, 0, w, h);

    // Screen shake cho các event mạnh
    const hasShake = ["EV_LavaCore", "EV_SpaceAnchor", "EV_CargoJam"].includes(eventName);
    if (hasShake) {
      const shakeAmount = Math.sin(t * Math.PI * 10) * (1 - t) * 20;
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount);
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. EV_LavaCore: Núi lửa phun trào, dung nham, lửa
    // ═══════════════════════════════════════════════════════════════
    if (eventName === "EV_LavaCore") {
      for (let i = 0; i < 3; i++) {
        const ringT = Math.max(0, t - i * 0.15);
        if (ringT > 0) {
          const r = ringT * w * 0.8;
          const alpha = (1 - ringT) * 0.8;
          ctx.strokeStyle = `rgba(255, ${100 + i * 50}, 0, ${alpha})`;
          ctx.lineWidth = 20 * (1 - ringT) + 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      particles.forEach(p => {
        const pT = (t + p.offset) % 1;
        const dist = pT * w * 0.6;
        const px = cx + Math.cos(p.angle) * dist;
        const py = cy + Math.sin(p.angle) * dist - Math.sin(pT * Math.PI) * 100;
        ctx.fillStyle = `rgba(255, ${150 + Math.random() * 100}, 50, ${1 - pT})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size * (1 - pT), 0, Math.PI * 2);
        ctx.fill();
      });
      if (t < 0.3) {
        const flashAlpha = 1 - (t / 0.3);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
        grad.addColorStop(0, `rgba(255, 255, 200, ${flashAlpha})`);
        grad.addColorStop(0.5, `rgba(255, 100, 0, ${flashAlpha * 0.8})`);
        grad.addColorStop(1, `rgba(255, 0, 0, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. EV_Radiation: Sóng phóng xạ xanh, biểu tượng phóng xạ xoay
    // ═══════════════════════════════════════════════════════════════
    else if (eventName === "EV_Radiation") {
      const vigGrad = ctx.createRadialGradient(cx, cy, w * 0.2, cx, cy, w * 0.8);
      vigGrad.addColorStop(0, `rgba(0, 0, 0, 0)`);
      vigGrad.addColorStop(1, `rgba(50, 255, 50, ${t * 0.3})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 4; i++) {
        const ringT = (t * 2 + i * 0.25) % 1;
        const r = ringT * w * 0.5;
        ctx.strokeStyle = `rgba(100, 255, 100, ${(1 - ringT) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * Math.PI * 2);
      const scale = Math.min(1, t * 3) * (1 - Math.max(0, (t - 0.7) / 0.3));
      ctx.scale(scale, scale);

      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(0, 0, 100, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#00ff00";
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#00ff00";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i * 2 * Math.PI) / 3);
        const innerR = 25;
        const outerR = 90;
        const start = -Math.PI / 6;
        const end = Math.PI / 6;
        ctx.beginPath();
        ctx.arc(0, 0, outerR, start, end);
        ctx.lineTo(innerR * Math.cos(end), innerR * Math.sin(end));
        ctx.arc(0, 0, innerR, end, start, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. EV_GreedyPlanet: Hố xoáy tím hút tài nguyên
    // ═══════════════════════════════════════════════════════════════
    else if (eventName === "EV_GreedyPlanet") {
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 10; i++) {
        const rot = t * 5 + i * Math.PI / 5;
        const dist = (1 - t) * 300 + i * 10;
        ctx.strokeStyle = `rgba(200, 100, 255, ${0.5 - i * 0.05})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, dist, rot, rot + Math.PI * 0.5);
        ctx.stroke();
      }
      particles.forEach(p => {
        const pT = Math.max(0, 1 - ((t + p.offset) % 1));
        const dist = pT * w * 0.6;
        const px = Math.cos(p.angle + t * 5) * dist;
        const py = Math.sin(p.angle + t * 5) * dist;
        ctx.fillStyle = `rgba(255, 215, 0, ${1 - pT})`;
        ctx.beginPath();
        ctx.moveTo(px, py - p.size);
        ctx.lineTo(px + p.size, py);
        ctx.lineTo(px, py + p.size);
        ctx.lineTo(px - p.size, py);
        ctx.fill();
      });
      ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. EV_SpaceAnchor: Mỏ neo khổng lồ rơi xuống, xích không gian
    // ═══════════════════════════════════════════════════════════════
    else if (eventName === "EV_SpaceAnchor") {
      ctx.save();
      if (t < 0.5) {
        const fallT = t / 0.5;
        const easeT = fallT * fallT;
        const anchorY = cy - h * 0.5 + easeT * (h * 0.5);
        ctx.strokeStyle = "#79d7ff";
        ctx.lineWidth = 8;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#79d7ff";
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, anchorY);
        ctx.stroke();
        ctx.fillStyle = "#1a5a99";
        ctx.beginPath();
        ctx.moveTo(cx - 40, anchorY);
        ctx.lineTo(cx + 40, anchorY);
        ctx.lineTo(cx + 40, anchorY + 30);
        ctx.lineTo(cx + 60, anchorY + 30);
        ctx.arc(cx, anchorY + 80, 60, 0, Math.PI);
        ctx.lineTo(cx - 40, anchorY + 30);
        ctx.lineTo(cx - 40, anchorY);
        ctx.fill();
        ctx.stroke();
      } else {
        const impactT = (t - 0.5) / 0.5;
        const r = impactT * w * 0.8;
        ctx.strokeStyle = `rgba(121, 215, 255, ${1 - impactT})`;
        ctx.lineWidth = 15 * (1 - impactT);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. EV_Parasite: Trứng hồng rung lắc, nở ra chất nhờn
    // ═══════════════════════════════════════════════════════════════
    else if (eventName === "EV_Parasite") {
      ctx.save();
      ctx.translate(cx, cy);
      if (t < 0.4) {
        const wobble = Math.sin(t * 50) * 10 * t;
        ctx.rotate(wobble * Math.PI / 180);
        const eggGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 100);
        eggGrad.addColorStop(0, "#ff76dc");
        eggGrad.addColorStop(1, "#8a0050");
        ctx.fillStyle = eggGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 80, 110, 0, 0, Math.PI * 2);
        ctx.fill();
        if (t > 0.2) {
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-20, -80); ctx.lineTo(0, -40); ctx.lineTo(20, -60); ctx.lineTo(40, -10);
          ctx.stroke();
        }
      } else {
        const splatT = (t - 0.4) / 0.6;
        for (let i = 0; i < 20; i++) {
          const ang = (i / 20) * Math.PI * 2;
          const dist = splatT * 200;
          const px = Math.cos(ang) * dist;
          const py = Math.sin(ang) * dist;
          ctx.fillStyle = `rgba(200, 50, 150, ${1 - splatT})`;
          ctx.beginPath();
          ctx.arc(px, py, 20 * (1 - splatT), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. EV_Mirage: Sóng nhiệt, ảo ảnh sa mạc
    // ═══════════════════════════════════════════════════════════════
    else if (eventName === "EV_Mirage") {
      ctx.strokeStyle = `rgba(255, 200, 100, ${0.5 * (1 - t)})`;
      ctx.lineWidth = 3;
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        for (let x = 0; x < w; x += 20) {
          const offset = Math.sin(x * 0.02 + y * 0.05 + t * 10) * 20 * (1 - t);
          if (x === 0) ctx.moveTo(x, y + offset);
          else ctx.lineTo(x, y + offset);
        }
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${0.2 * Math.sin(t * Math.PI)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // ═══════════════════════════════════════════════════════════════
    // 7. EV_CargoJam: Cảnh báo đỏ, thanh sắt kẹp vào
    // ═══════════════════════════════════════════════════════════════
    else if (eventName === "EV_CargoJam") {
      const flash = Math.sin(t * Math.PI * 8) > 0 ? 0.4 * (1 - t) : 0;
      ctx.fillStyle = `rgba(255, 0, 0, ${flash})`;
      ctx.fillRect(0, 0, w, h);
      const barT = Math.min(1, t * 2);
      const barWidth = w * 0.4 * barT;
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, barWidth, h);
      ctx.fillRect(w - barWidth, 0, barWidth, h);
      if (t > 0.2 && t < 0.8) {
        ctx.fillStyle = "#ffaa00";
        for (let i = 0; i < 10; i++) {
          const sx = barWidth + Math.random() * 20;
          const sy = Math.random() * h;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. EV_Surge: Sét đánh loạn xạ, năng lượng vàng
    // ═══════════════════════════════════════════════════════════════
    else if (eventName === "EV_Surge") {
      ctx.fillStyle = `rgba(255, 255, 100, ${0.2 * Math.sin(t * Math.PI)})`;
      ctx.fillRect(0, 0, w, h);
      if (Math.random() < 0.3) {
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#ffff00";
        ctx.beginPath();
        let lx = Math.random() * w;
        let ly = 0;
        ctx.moveTo(lx, ly);
        while (ly < h) {
          lx += (Math.random() - 0.5) * 100;
          ly += Math.random() * 50;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      }
    }
    if (hasShake) ctx.restore();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      finishAnimation();
    }
  }

  let isFinished = false;
  function finishAnimation() {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(fallbackTimer);
    overlay.style.transition = "opacity 0.4s ease";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      if (onComplete) onComplete();
    }, 400);
  }

  const fallbackTimer = setTimeout(finishAnimation, 5000);
  requestAnimationFrame(animate);
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

// ═══ ÂM THANH RIÊNG CHO TỪNG VẬT PHẨM KHI SỬ DỤNG ═══
function playItemUseSound(itemId) {
  if (!settings.sound || settings.volume <= 0) return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  try {
    audioContext ||= new AudioContextType();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const ac = audioContext;
    const now = ac.currentTime;
    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime((settings.volume / 100) * 0.05, now);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    masterGain.connect(ac.destination);

    const playTone = (freqStart, freqEnd, type, duration, delay = 0) => {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + delay + duration);
      osc.connect(masterGain);
      osc.start(now + delay);
      osc.stop(now + delay + duration + 0.05);
    };

    switch (itemId) {
      case "it_teleport":
        playTone(180, 1400, "sine", 0.6);
        playTone(1400, 240, "sine", 0.9, 0.4);
        break;
      case "it_battery":
        playTone(520, 1040, "square", 0.35);
        playTone(880, 1320, "square", 0.25, 0.15);
        break;
      case "it_ap":
      case "it_ap_boost":
        playTone(660, 990, "triangle", 0.35);
        playTone(990, 1320, "triangle", 0.35, 0.2);
        break;
      case "it_black_hole":
        playTone(120, 22, "sawtooth", 1.4);
        break;
      case "it_swap_pos":
        playTone(880, 220, "triangle", 0.5);
        playTone(220, 880, "triangle", 0.5, 0.4);
        break;
      case "it_scarecrow":
        playTone(1400, 180, "square", 0.3);
        playTone(400, 200, "sawtooth", 0.7, 0.25);
        break;
      case "it_steal":
        playTone(660, 880, "sine", 0.2);
        playTone(880, 330, "sine", 0.6, 0.2);
        break;
      case "it_magnet":
        playTone(180, 380, "triangle", 0.9);
        playTone(380, 720, "triangle", 0.7, 0.3);
        break;
    }
  } catch {
    // Âm thanh là tùy chọn; hiệu ứng hình ảnh vẫn đủ để truyền đạt.
  }
}

function playCanonEventAnimation(eventCode, onComplete) {
  const eventName = eventCode.replace("EVENT_", "");

  const overlay = document.createElement("div");
  overlay.id = "event-animation-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    pointer-events: auto; cursor: wait;
    background: rgba(0, 0, 0, 0);
  `;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%;";
  overlay.append(canvas);
  document.body.append(overlay);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  let w = window.innerWidth;
  let h = window.innerHeight;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const cx = w / 2;
  const cy = h / 2;
  const startTime = performance.now();
  const DURATION = 4200; // 4.2s cho canon events — hoành tráng, lâu hơn planet

  // Particle pool chung
  const particles = [];
  for (let i = 0; i < 150; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      speed: Math.random() * 15 + 8,
      size: Math.random() * 5 + 2,
      offset: Math.random(),
      drift: (Math.random() - 0.5) * 0.8,
    });
  }

  // Helper: ánh sáng radial
  function drawRadialGlow(x, y, radius, colorInner, colorOuter, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, colorInner.replace("ALPHA", alpha));
    g.addColorStop(1, colorOuter.replace("ALPHA", 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Helper: vẽ tàu nhỏ (dùng cho scene có tàu)
  function drawShip(x, y, size, color, angle = -Math.PI / 2) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, size * 0.6);
    ctx.lineTo(0, size * 0.3);
    ctx.lineTo(-size * 0.7, size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / DURATION);

    ctx.clearRect(0, 0, w, h);

    // ═════════════════════════════════════════════════════════════════
    // 1. CE_BlackHole — Lỗ đen tạm thời (dịch chuyển tàu)
    // ═════════════════════════════════════════════════════════════════
    if (eventName === "CE_BlackHole") {
      // Vũ trụ tối sầm
      ctx.fillStyle = `rgba(0, 0, 0, ${t * 0.7})`;
      ctx.fillRect(0, 0, w, h);

      // Lỗ đen trung tâm lớn dần
      const bhSize = Math.min(t * 2.5, 1) * 180;
      const pulse = Math.sin(now / 100) * 8;

      // Accretion disk (đĩa bồi tụ) xoay
      for (let layer = 0; layer < 5; layer++) {
        const layerR = bhSize + layer * 25 + pulse * (1 - layer * 0.15);
        const rotOffset = now / (300 + layer * 100);
        const alpha = 1 - layer * 0.15;
        ctx.strokeStyle = layer % 2 === 0
          ? `rgba(180, 100, 255, ${alpha})`
          : `rgba(100, 180, 255, ${alpha})`;
        ctx.lineWidth = 6 - layer * 0.8;
        ctx.shadowBlur = 25;
        ctx.shadowColor = layer % 2 === 0 ? "#b464ff" : "#64b4ff";
        ctx.beginPath();
        ctx.arc(cx, cy, layerR, rotOffset, rotOffset + Math.PI * 1.6);
        ctx.stroke();
      }

      // Lõi lỗ đen đen tuyền
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx, cy, bhSize, 0, Math.PI * 2);
      ctx.fill();

      // Sự kiện chân trời (event horizon)
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * Math.sin(now / 200 + Math.PI)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, bhSize * 1.05, 0, Math.PI * 2);
      ctx.stroke();

      // 2 tàu bị hút vào
      const shipDist = Math.max(0, (1 - t * 1.5)) * 400;
      drawShip(cx - shipDist, cy - shipDist * 0.5, 14, "#71ff91", Math.PI / 4);
      drawShip(cx + shipDist, cy + shipDist * 0.5, 14, "#ff6565", -Math.PI * 0.75);

      // Space warp (màn hình méo)
      if (t > 0.3 && t < 0.7) {
        const warpAlpha = Math.sin((t - 0.3) / 0.4 * Math.PI) * 0.3;
        ctx.fillStyle = `rgba(100, 50, 200, ${warpAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 2. CE_Tax — Thuế vũ trụ (trừ 10% điểm → Spinel)
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_Tax") {
      // Ám đỏ vàng
      ctx.fillStyle = `rgba(180, 50, 20, ${0.3 * Math.sin(t * Math.PI)})`;
      ctx.fillRect(0, 0, w, h);

      // Con dấu "TAX" stamp xuống
      if (t < 0.5) {
        const stampT = Math.min(1, t / 0.35);
        const ease = 1 - Math.pow(1 - stampT, 4);
        const scale = 1 + (1 - ease) * 3;
        const alpha = Math.min(1, stampT * 2);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.rotate(-0.15);
        ctx.strokeStyle = `rgba(255, 60, 30, ${alpha})`;
        ctx.lineWidth = 12;
        ctx.strokeRect(-200, -100, 400, 200);
        ctx.lineWidth = 3;
        ctx.strokeRect(-215, -115, 430, 230);

        ctx.fillStyle = `rgba(255, 60, 30, ${alpha})`;
        ctx.font = "bold 140px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 30;
        ctx.shadowColor = "#ff3c1e";
        ctx.fillText("TAX", 0, 0);
        ctx.restore();
      }

      // Tài nguyên rơi
      if (t > 0.35) {
        const dropT = (t - 0.35) / 0.65;
        particles.forEach(p => {
          const pT = (dropT + p.offset) % 1;
          const px = p.angle / (Math.PI * 2) * w;
          const py = pT * h * 1.3 - h * 0.15;
          const size = p.size * 1.5;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(pT * 8);
          ctx.fillStyle = `rgba(255, 220, 100, ${1 - pT})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = "#ffdc64";
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.8, 0);
          ctx.lineTo(0, size);
          ctx.lineTo(-size * 0.8, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
      }

      // Đồng xu khổng lồ quay
      if (t > 0.5 && t < 0.95) {
        const coinT = (t - 0.5) / 0.45;
        const coinAlpha = Math.sin(coinT * Math.PI);
        const coinSize = 120 * Math.min(1, coinT * 2);
        ctx.save();
        ctx.translate(cx, cy + 250);
        ctx.scale(Math.cos(now / 200) * 0.3 + 0.7, 1);
        ctx.fillStyle = `rgba(255, 200, 50, ${coinAlpha})`;
        ctx.strokeStyle = `rgba(180, 130, 0, ${coinAlpha})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 25;
        ctx.shadowColor = "#ffc832";
        ctx.beginPath();
        ctx.arc(0, 0, coinSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 3. CE_ReverseGravity — Đảo ngược trọng lực
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_ReverseGravity") {
      // Màn hình xoay 180° trong 0.6s đầu
      if (t < 0.5) {
        const rotT = Math.min(1, t / 0.5);
        const ease = rotT * rotT;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ease * Math.PI);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = `rgba(80, 200, 255, ${0.15 * ease})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // Mũi tên chỉ lên
      const arrowT = Math.min(1, t / 0.4);
      const arrowAlpha = Math.min(1, arrowT * 2) * (1 - Math.max(0, (t - 0.85) / 0.15));

      for (let i = 0; i < 6; i++) {
        const ax = (i + 1) * w / 7;
        const offset = (now / 400 + i * 0.2) % 1;
        const ay = h * (1 - offset);

        ctx.save();
        ctx.globalAlpha = arrowAlpha * (1 - offset * 0.5);
        ctx.strokeStyle = "#50c8ff";
        ctx.fillStyle = "#50c8ff";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#50c8ff";
        ctx.lineWidth = 6;

        // Thân mũi tên
        ctx.beginPath();
        ctx.moveTo(ax, ay + 40);
        ctx.lineTo(ax, ay - 40);
        ctx.stroke();

        // Đầu mũi tên
        ctx.beginPath();
        ctx.moveTo(ax, ay - 60);
        ctx.lineTo(ax - 18, ay - 30);
        ctx.lineTo(ax + 18, ay - 30);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // Hạt "bay lên" thay vì rơi xuống
      if (t > 0.4) {
        const upT = (t - 0.4) / 0.6;
        particles.slice(0, 60).forEach(p => {
          const pT = (upT + p.offset) % 1;
          const px = p.angle / (Math.PI * 2) * w;
          const py = h - pT * h * 1.2;
          ctx.fillStyle = `rgba(100, 220, 255, ${1 - pT})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#50c8ff";
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 4. CE_GalacticFair — Hội chợ thiên hà (đổi tài nguyên lấy item)
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_GalacticFair") {
      // Nền gradient màu mè
      const fairGrad = ctx.createLinearGradient(0, 0, w, h);
      fairGrad.addColorStop(0, `rgba(255, 100, 200, ${0.15 * Math.sin(t * Math.PI)})`);
      fairGrad.addColorStop(0.5, `rgba(100, 200, 255, ${0.15 * Math.sin(t * Math.PI)})`);
      fairGrad.addColorStop(1, `rgba(255, 200, 100, ${0.15 * Math.sin(t * Math.PI)})`);
      ctx.fillStyle = fairGrad;
      ctx.fillRect(0, 0, w, h);

      // Vòng xoay vật phẩm quanh tâm
      const itemEmojis = ["⚡", "🚀", "💎", "🎁", "✨", "🔮", "⚔", "🛡", "⬢", "◆"];
      const rotSpeed = now / 800;
      const itemRadius = 180 + Math.sin(now / 300) * 30;

      for (let i = 0; i < 10; i++) {
        const ang = rotSpeed + i * Math.PI * 2 / 10;
        const ix = cx + Math.cos(ang) * itemRadius;
        const iy = cy + Math.sin(ang) * itemRadius;
        const itemT = Math.min(1, t * 2) * (1 - Math.max(0, (t - 0.9) / 0.1));

        ctx.save();
        ctx.globalAlpha = itemT;
        ctx.translate(ix, iy);
        ctx.rotate(ang + Math.PI / 2);
        ctx.font = "bold 48px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 20;
        ctx.shadowColor = ["#ff64c8", "#64c8ff", "#ffc864"][i % 3];
        ctx.fillStyle = "#fff";
        ctx.fillText(itemEmojis[i], 0, 0);
        ctx.restore();
      }

      // Tâm xoay
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rotSpeed * 2);
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 * (1 - t * 0.5)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(60, 0);
        ctx.stroke();
      }
      ctx.restore();

      // Sparkles ngẫu nhiên
      particles.forEach((p, i) => {
        if (i > 80) return;
        const pT = (t + p.offset) % 1;
        const px = (p.angle / (Math.PI * 2)) * w;
        const py = pT * h;
        ctx.fillStyle = `rgba(255, 255, 200, ${1 - pT})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ffff00";
        ctx.beginPath();
        ctx.arc(px, py, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // ═════════════════════════════════════════════════════════════════
    // 5. CE_SolarStorm — Bão mặt trời
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_SolarStorm") {
      // Nền đỏ rực
      ctx.fillStyle = `rgba(60, 0, 0, ${t * 0.5})`;
      ctx.fillRect(0, 0, w, h);

      // Mặt trời phình to từ bên trái
      const sunX = -200 + Math.min(1, t * 3) * 400;
      const sunY = cy;
      const sunR = 200 * Math.min(1, t * 2);
      const sunPulse = Math.sin(now / 80) * 10;

      drawRadialGlow(sunX, sunY, sunR * 2.5, "rgba(255, 200, 100, ALPHA)", "rgba(255, 60, 0, ALPHA)", 0.9);
      drawRadialGlow(sunX, sunY, sunR * 1.3, "rgba(255, 255, 200, ALPHA)", "rgba(255, 150, 0, ALPHA)", 1);

      ctx.fillStyle = "#ffe580";
      ctx.shadowBlur = 40;
      ctx.shadowColor = "#ff8000";
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR + sunPulse, 0, Math.PI * 2);
      ctx.fill();

      // Plasma/flare bắn ra
      particles.forEach(p => {
        const pT = t;
        const dist = p.speed * pT * 40;
        const px = sunX + Math.cos(p.angle) * dist;
        const py = sunY + Math.sin(p.angle) * dist;
        if (px < 0 || px > w || py < 0 || py > h) return;

        ctx.strokeStyle = `rgba(255, ${100 + p.speed * 10}, 0, ${(1 - pT) * 0.8})`;
        ctx.lineWidth = p.size * (1 - pT * 0.7);
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#ff8000";
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(p.angle) * dist * 0.8, sunY + Math.sin(p.angle) * dist * 0.8);
        ctx.lineTo(px, py);
        ctx.stroke();
      });

      // Glitch effect (nhiễu điện từ)
      if (t > 0.4 && t < 0.8) {
        const glitchCount = 8;
        for (let i = 0; i < glitchCount; i++) {
          if (Math.random() < 0.4) {
            const gy = Math.random() * h;
            const gh = Math.random() * 20 + 5;
            ctx.fillStyle = `rgba(255, 100, 0, ${Math.random() * 0.4})`;
            ctx.fillRect(0, gy, w, gh);
          }
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 6. CE_TwinPlanet — Hành tinh sinh đôi (nhân bản)
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_TwinPlanet") {
      // Hành tinh gốc ở giữa, lớn dần
      const baseR = Math.min(1, t * 2.5) * 120;
      const baseRot = t * Math.PI * 2;

      // Hành tinh gốc
      drawRadialGlow(cx, cy, baseR * 1.5, "rgba(150, 100, 255, ALPHA)", "rgba(50, 0, 150, ALPHA)", 0.5);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(baseRot);
      const grad = ctx.createRadialGradient(-baseR * 0.3, -baseR * 0.3, 0, 0, 0, baseR);
      grad.addColorStop(0, "#b8a0ff");
      grad.addColorStop(0.5, "#8866dd");
      grad.addColorStop(1, "#3320aa");
      ctx.fillStyle = grad;
      ctx.shadowBlur = 30;
      ctx.shadowColor = "#8866dd";
      ctx.beginPath();
      ctx.arc(0, 0, baseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Hành tinh tách đôi — 2 bản sao bay ra 2 bên
      if (t > 0.35) {
        const splitT = (t - 0.35) / 0.65;
        const offset = Math.min(1, splitT * 1.5) * w * 0.3;
        const cloneR = baseR * 0.95;

        for (let sign of [-1, 1]) {
          const tx = cx + sign * offset;
          const ty = cy;
          const cloneAlpha = Math.min(1, splitT * 2);

          ctx.save();
          ctx.globalAlpha = cloneAlpha;
          ctx.translate(tx, ty);
          ctx.rotate(baseRot * 1.2);

          drawRadialGlow(0, 0, cloneR * 1.5, "rgba(255, 200, 100, ALPHA)", "rgba(255, 100, 0, ALPHA)", cloneAlpha * 0.5);

          const cgrad = ctx.createRadialGradient(-cloneR * 0.3, -cloneR * 0.3, 0, 0, 0, cloneR);
          cgrad.addColorStop(0, "#ffddbb");
          cgrad.addColorStop(0.5, "#dd8866");
          cgrad.addColorStop(1, "#aa3320");
          ctx.fillStyle = cgrad;
          ctx.shadowBlur = 30;
          ctx.shadowColor = "#dd8866";
          ctx.beginPath();
          ctx.arc(0, 0, cloneR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Tia sáng kết nối
        if (splitT > 0.2 && splitT < 0.8) {
          const lineAlpha = Math.sin(splitT / 0.6 * Math.PI);
          ctx.strokeStyle = `rgba(255, 255, 200, ${lineAlpha})`;
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 10]);
          ctx.shadowBlur = 15;
          ctx.shadowColor = "#ffff00";
          ctx.beginPath();
          ctx.moveTo(cx - offset, cy);
          ctx.lineTo(cx + offset, cy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 7. CE_Homecoming — Hồi hương (kéo 2 tàu về Earth)
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_Homecoming") {
      // Nền tối
      ctx.fillStyle = `rgba(0, 20, 40, ${t * 0.4})`;
      ctx.fillRect(0, 0, w, h);

      // Earth khổng lồ xuất hiện ở giữa
      const earthT = Math.min(1, t * 2);
      const earthR = 200 * earthT;

      drawRadialGlow(cx, cy, earthR * 2, "rgba(100, 200, 255, ALPHA)", "rgba(0, 100, 200, ALPHA)", 0.6);

      // Hành tinh earth
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * Math.PI * 0.5);
      const eGrad = ctx.createRadialGradient(-earthR * 0.3, -earthR * 0.3, 0, 0, 0, earthR);
      eGrad.addColorStop(0, "#5fc9ff");
      eGrad.addColorStop(0.6, "#1a5a99");
      eGrad.addColorStop(1, "#0a2a5a");
      ctx.fillStyle = eGrad;
      ctx.shadowBlur = 40;
      ctx.shadowColor = "#4fafff";
      ctx.beginPath();
      ctx.arc(0, 0, earthR, 0, Math.PI * 2);
      ctx.fill();

      // Lục địa
      ctx.fillStyle = "rgba(113, 255, 145, 0.6)";
      ctx.beginPath();
      ctx.ellipse(-earthR * 0.2, -earthR * 0.1, earthR * 0.3, earthR * 0.2, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(earthR * 0.25, earthR * 0.15, earthR * 0.22, earthR * 0.15, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2 tàu bị hút về Earth với trail dài
      if (t > 0.3) {
        const suckT = Math.min(1, (t - 0.3) / 0.65);
        const startDist = 500;
        const endDist = earthR * 0.95;

        for (let sign of [-1, 1]) {
          const dist = startDist - (startDist - endDist) * suckT;
          const sx = cx + sign * dist * 0.7;
          const sy = cy + sign * dist * 0.4;
          const shipColor = sign === -1 ? "#71ff91" : "#ff6565";

          // Trail dài
          const trailGrad = ctx.createLinearGradient(sx - sign * 100, sy - sign * 60, sx, sy);
          trailGrad.addColorStop(0, `${shipColor}00`);
          trailGrad.addColorStop(1, shipColor);
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.shadowBlur = 20;
          ctx.shadowColor = shipColor;
          ctx.beginPath();
          ctx.moveTo(sx - sign * 100, sy - sign * 60);
          ctx.lineTo(sx, sy);
          ctx.stroke();

          // Tàu
          const angle = Math.atan2(cy - sy, cx - sx);
          drawShip(sx, sy, 16, shipColor, angle + Math.PI / 2);
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 8. CE_GiftItem — Quà tặng vũ trụ
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_GiftItem") {
      // Nền vàng ấm
      ctx.fillStyle = `rgba(60, 40, 0, ${t * 0.3})`;
      ctx.fillRect(0, 0, w, h);

      // Hộp quà xuất hiện, rung lắc
      if (t < 0.4) {
        const boxT = Math.min(1, t / 0.2);
        const shake = Math.sin(now / 30) * 8 * boxT;
        const boxSize = 180 * boxT;

        ctx.save();
        ctx.translate(cx + shake, cy);
        drawRadialGlow(0, 0, boxSize * 1.5, "rgba(255, 220, 100, ALPHA)", "rgba(255, 150, 0, ALPHA)", 0.6);

        // Hộp quà
        ctx.fillStyle = "#d4285a";
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#ff6496";
        ctx.fillRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);

        // Nơ dọc
        ctx.fillStyle = "#ffdc64";
        ctx.fillRect(-15, -boxSize / 2, 30, boxSize);

        // Nơ ngang
        ctx.fillRect(-boxSize / 2, -15, boxSize, 30);

        // Nơ trên đỉnh
        ctx.beginPath();
        ctx.arc(-30, -boxSize / 2 - 20, 30, 0, Math.PI * 2);
        ctx.arc(30, -boxSize / 2 - 20, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Nắp bung ra + ánh sáng bắn lên
      if (t > 0.35) {
        const burstT = (t - 0.35) / 0.65;
        const burstAlpha = Math.min(1, burstT * 3) * (1 - Math.max(0, (t - 0.9) / 0.1));

        // Tia sáng từ tâm
        const rays = 16;
        for (let i = 0; i < rays; i++) {
          const ang = i / rays * Math.PI * 2 + now / 500;
          const len = 400 * burstT;
          const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          grad.addColorStop(0, `rgba(255, 220, 100, ${burstAlpha})`);
          grad.addColorStop(1, "rgba(255, 220, 100, 0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 6;
          ctx.shadowBlur = 20;
          ctx.shadowColor = "#ffdc64";
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          ctx.stroke();
        }

        // Confetti
        particles.forEach(p => {
          const pT = (burstT + p.offset * 0.5) % 1;
          const px = cx + Math.cos(p.angle) * pT * 400 + p.drift * pT * 100;
          const py = cy + Math.sin(p.angle) * pT * 400 + pT * pT * 200;
          ctx.fillStyle = ["#ff6496", "#ffdc64", "#64ff96", "#64c8ff"][Math.floor(p.offset * 4)];
          ctx.globalAlpha = 1 - pT;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 0.7, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 9. CE_TheftItem — Kẻ trộm không gian
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_TheftItem") {
      // Màn hình tối sầm
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, t * 2) * 0.85})`;
      ctx.fillRect(0, 0, w, h);

      // Bóng đen lướt qua
      if (t > 0.15 && t < 0.55) {
        const shadowT = (t - 0.15) / 0.4;
        const shadowX = -300 + shadowT * (w + 600);
        const shadowY = cy + Math.sin(shadowT * Math.PI * 2) * 100;

        ctx.save();
        ctx.fillStyle = `rgba(20, 0, 40, ${0.9 * Math.sin(shadowT * Math.PI)})`;
        ctx.shadowBlur = 40;
        ctx.shadowColor = "#8000ff";
        ctx.beginPath();
        ctx.ellipse(shadowX, shadowY, 200, 80, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2 đôi mắt đỏ xuất hiện
      if (t > 0.2) {
        const eyeAlpha = Math.sin(Math.min(1, (t - 0.2) / 0.2) * Math.PI / 2) * (1 - Math.max(0, (t - 0.85) / 0.15));
        const eyeY = cy - 30;
        const eyeGap = 40;

        ctx.shadowBlur = 25;
        ctx.shadowColor = "#ff0000";
        ctx.fillStyle = `rgba(255, 40, 40, ${eyeAlpha})`;

        for (let sign of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(cx + sign * eyeGap, eyeY, 20, 12, sign * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Đồng tử
        ctx.fillStyle = `rgba(0, 0, 0, ${eyeAlpha})`;
        for (let sign of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + sign * eyeGap, eyeY, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Item bị đánh cắp (vật phẩm bay đi)
      if (t > 0.45 && t < 0.9) {
        const stealT = (t - 0.45) / 0.45;
        const itemAlpha = Math.sin(stealT * Math.PI);
        const ix = cx + stealT * w * 0.4;
        const iy = cy - stealT * 200;

        ctx.save();
        ctx.globalAlpha = itemAlpha;
        ctx.translate(ix, iy);
        ctx.rotate(stealT * Math.PI * 4);
        ctx.font = "bold 80px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 30;
        ctx.shadowColor = "#8000ff";
        ctx.fillStyle = "#ffdc64";
        ctx.fillText("💎", 0, 0);
        ctx.restore();
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 10. CE_SupplyDrop — Tiếp tế khẩn cấp
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_SupplyDrop") {
      // Nền xanh
      ctx.fillStyle = `rgba(0, 30, 60, ${t * 0.4})`;
      ctx.fillRect(0, 0, w, h);

      // Nhiều container rơi từ trên trời
      const numDrops = 12;
      for (let i = 0; i < numDrops; i++) {
        const dropDelay = (i / numDrops) * 0.6;
        if (t < dropDelay) continue;
        const dropT = Math.min(1, (t - dropDelay) / 0.35);
        const ease = dropT * dropT;

        const dx = (i % 4 + 1) * w / 5 + (Math.sin(i) * 50);
        const dy = -100 + ease * (h * 0.6);
        const size = 60;
        const rot = ease * Math.PI * 2 + i;

        // Trail
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.5 * (1 - dropT)})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#64c8ff";
        ctx.beginPath();
        ctx.moveTo(dx, dy - 200);
        ctx.lineTo(dx, dy);
        ctx.stroke();

        // Hộp tiếp tế
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(rot * 0.3);

        ctx.fillStyle = "#4a90d9";
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#64c8ff";
        ctx.fillRect(-size / 2, -size / 2, size, size);

        // Dấu thập trắng
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-8, -size / 2 + 8, 16, size - 16);
        ctx.fillRect(-size / 2 + 8, -8, size - 16, 16);
        ctx.restore();

        // Chớp sáng khi chạm đất
        if (dropT > 0.9) {
          const impactT = (dropT - 0.9) / 0.1;
          ctx.strokeStyle = `rgba(100, 200, 255, ${1 - impactT})`;
          ctx.lineWidth = 4 * (1 - impactT);
          ctx.beginPath();
          ctx.arc(dx, dy, 30 + impactT * 80, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Sóng xung kích lan rộng khi kết thúc
      if (t > 0.7) {
        const waveT = (t - 0.7) / 0.3;
        ctx.strokeStyle = `rgba(100, 200, 255, ${1 - waveT})`;
        ctx.lineWidth = 8 * (1 - waveT);
        ctx.beginPath();
        ctx.arc(cx, cy + h * 0.15, waveT * w * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // 11. CE_Plunder — Cướp biển vũ trụ
    // ═════════════════════════════════════════════════════════════════
    else if (eventName === "CE_Plunder") {
      // Nền đỏ tối
      ctx.fillStyle = `rgba(40, 0, 0, ${t * 0.6})`;
      ctx.fillRect(0, 0, w, h);

      // Đầu lâu xương chéo hiện lên mờ rồi đậm
      const skullAlpha = Math.min(1, t * 3) * (1 - Math.max(0, (t - 0.9) / 0.1));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = skullAlpha * 0.4;
      ctx.shadowBlur = 40;
      ctx.shadowColor = "#ff0000";

      // Đầu lâu
      ctx.fillStyle = "#ff2020";
      ctx.beginPath();
      ctx.arc(0, -50, 100, 0, Math.PI * 2);
      ctx.fill();
      // Hàm dưới
      ctx.fillRect(-70, 20, 140, 60);
      // Mắt
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(-40, -50, 25, 0, Math.PI * 2);
      ctx.arc(40, -50, 25, 0, Math.PI * 2);
      ctx.fill();
      // Răng
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(i * 20 - 5, 30, 10, 30);
      }
      ctx.restore();

      // 2 thanh kiếm chéo (X)
      if (t > 0.3 && t < 0.9) {
        const swordT = (t - 0.3) / 0.6;
        const swordAlpha = Math.sin(swordT * Math.PI);

        for (let sign of [-1, 1]) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(sign * Math.PI / 4);
          ctx.globalAlpha = swordAlpha;

          ctx.strokeStyle = "#ff4040";
          ctx.lineWidth = 12;
          ctx.shadowBlur = 30;
          ctx.shadowColor = "#ff0000";
          ctx.beginPath();
          ctx.moveTo(-250, 0);
          ctx.lineTo(250, 0);
          ctx.stroke();

          // Mũi kiếm
          ctx.fillStyle = "#ff4040";
          ctx.beginPath();
          ctx.moveTo(250, 0);
          ctx.lineTo(220, -15);
          ctx.lineTo(220, 15);
          ctx.closePath();
          ctx.fill();

          ctx.restore();
        }
      }

      // Tài nguyên rơi vãi
      if (t > 0.5) {
        const dropT = (t - 0.5) / 0.5;
        particles.slice(0, 40).forEach(p => {
          const pT = (dropT + p.offset) % 1;
          const px = cx + (p.angle / (Math.PI * 2) - 0.5) * w * 0.9;
          const py = cy - 100 + pT * h * 0.7 + pT * pT * 100;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(pT * 6);
          ctx.fillStyle = `rgba(255, 200, 100, ${1 - pT})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#ffc864";
          const size = p.size * 1.2;
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.7, 0);
          ctx.lineTo(0, size);
          ctx.lineTo(-size * 0.7, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
      }

      // Viền đỏ nhấp nháy
      const vigAlpha = Math.sin(t * Math.PI * 4) * 0.15 + 0.15;
      const vig = ctx.createRadialGradient(cx, cy, w * 0.3, cx, cy, w * 0.8);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, `rgba(255, 30, 30, ${vigAlpha})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }

    // Fade out ở cuối
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      finishAnimation();
    }
  }

  let isFinished = false;
  function finishAnimation() {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(fallbackTimer);
    overlay.style.transition = "opacity 0.5s ease";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      if (onComplete) onComplete();
    }, 500);
  }

  const fallbackTimer = setTimeout(finishAnimation, 6000);
  requestAnimationFrame(animate);
}


// ═══════════════════════════════════════════════════════════════════════════
// ITEM USE ANIMATIONS — 9 vật phẩm chủ động, mỗi cái có 4 phase đặc trưng
// ═══════════════════════════════════════════════════════════════════════════
function playItemUseAnimation(itemId, response, previousView, nextView, onComplete) {
  if (settings.reducedMotion) {
    if (onComplete) onComplete();
    return;
  }

  const itemInfo = rpgItems.find(i => i.id === itemId) || { name: itemId, icon: "◇", desc: "" };

  const overlay = document.createElement("div");
  overlay.id = "item-anim-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9998;pointer-events:auto;cursor:wait;background:rgba(0,0,0,0);";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  overlay.append(canvas);
  document.body.append(overlay);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  let w = window.innerWidth;
  let h = window.innerHeight;
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const cx = w / 2;
  const cy = h / 2;
  const startTime = performance.now();
  const DURATION = 3600;

  playItemUseSound(itemId);

  // ═══ Helpers ═══
  function drawGlow(x, y, radius, innerColor, outerColor, alpha = 1) {
    if (radius <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, innerColor.replace("ALPHA", alpha));
    g.addColorStop(1, outerColor.replace("ALPHA", 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  function drawShipShape(x, y, size, color, angle = -Math.PI / 2) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = color; ctx.shadowBlur = 18; ctx.shadowColor = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, size * 0.6);
    ctx.lineTo(0, size * 0.3);
    ctx.lineTo(-size * 0.7, size * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.restore();
  }
  function drawEarthShape(x, y, r, rotate = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotate);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, "#5fc9ff"); g.addColorStop(0.6, "#1a5a99"); g.addColorStop(1, "#0a2a5a");
    ctx.fillStyle = g; ctx.shadowBlur = 40; ctx.shadowColor = "#4fafff";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(113, 255, 145, 0.6)";
    ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.1, r * 0.3, r * 0.2, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.15, r * 0.22, r * 0.15, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawStarfield(intensity = 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.6 * intensity})`;
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137.5 + startTime * 0.02) % w;
      const sy = (i * 71.3) % h;
      ctx.beginPath(); ctx.arc(sx, sy, 0.5 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ═══ Main loop ═══
  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / DURATION);
    ctx.clearRect(0, 0, w, h);

    // Nền tối fade-in
    const dimAlpha = Math.min(0.75, t * 6);
    ctx.fillStyle = `rgba(0, 0, 0, ${dimAlpha})`;
    ctx.fillRect(0, 0, w, h);

    // ═══════════════════════════════════════════════════════════════════
    // 1. it_teleport — Cổng không gian, warp tunnel, xuất hiện tại Earth
    // ═══════════════════════════════════════════════════════════════════
    if (itemId === "it_teleport") {
      if (t < 0.35) {
        const p1 = t / 0.35;
        drawStarfield(0.4);
        for (let i = 0; i < 4; i++) {
          const rp = Math.max(0, p1 - i * 0.15);
          if (rp <= 0 || rp >= 1) continue;
          const r = 40 + rp * 200;
          ctx.strokeStyle = `rgba(121, 215, 255, ${Math.sin(rp * Math.PI)})`;
          ctx.lineWidth = 4 * (1 - rp);
          ctx.shadowBlur = 25; ctx.shadowColor = "#79d7ff";
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        drawShipShape(cx, cy, 30, "#71ff91", p1 * Math.PI * 4);
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2 + p1 * Math.PI * 4;
          const r = 60 + p1 * 160;
          ctx.fillStyle = `rgba(200,240,255,${1 - p1})`;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 0, Math.PI * 2); ctx.fill();
        }
      } else if (t < 0.55) {
        const p2 = (t - 0.35) / 0.2;
        const fa = 1 - Math.abs(p2 - 0.5) * 2;
        ctx.fillStyle = `rgba(255,255,255,${fa})`;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 80; i++) {
          const ang = (i / 80) * Math.PI * 2;
          const startR = 100 + p2 * 200;
          const endR = 600 + p2 * 400;
          ctx.strokeStyle = `rgba(255,255,255,${fa * 0.6})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * startR, cy + Math.sin(ang) * startR);
          ctx.lineTo(cx + Math.cos(ang) * endR, cy + Math.sin(ang) * endR);
          ctx.stroke();
        }
      } else {
        const p3 = Math.min(1, (t - 0.55) / 0.2);
        const p4 = Math.max(0, (t - 0.75) / 0.25);
        drawStarfield(0.6);
        const earthR = Math.min(180, p3 * 220);
        drawGlow(cx, cy, earthR * 2, "rgba(100,200,255,ALPHA)", "rgba(0,100,200,ALPHA)", 0.6 * (1 - p4 * 0.6));
        drawEarthShape(cx, cy, earthR, p3 * Math.PI);
        if (p4 > 0) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, p4 * 2);
          drawShipShape(cx, cy + earthR + 40 - p4 * 25, 30 * Math.min(1, p4 * 3), "#71ff91", -Math.PI / 2);
          ctx.restore();
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. it_battery — Sạc pin, tia điện, ô pin đầy dần
    // ═══════════════════════════════════════════════════════════════════
    else if (itemId === "it_battery") {
      ctx.fillStyle = `rgba(0,10,5,${Math.min(0.6, t * 1.5)})`;
      ctx.fillRect(0, 0, w, h);
      // Tia điện xoay quanh
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + now / 300;
        const r = 130 + Math.sin(now / 180 + i) * 25;
        ctx.strokeStyle = `rgba(255,215,0,${(0.9 - t * 0.7) * (0.6 + Math.random() * 0.4)})`;
        ctx.lineWidth = 2; ctx.shadowBlur = 15; ctx.shadowColor = "#ffd700";
        ctx.beginPath(); ctx.moveTo(cx, cy);
        let lx = cx, ly = cy;
        for (let s = 1; s <= 4; s++) {
          const nx = cx + (Math.cos(ang) * r) * s / 4 + (Math.random() - 0.5) * 25;
          const ny = cy + (Math.sin(ang) * r) * s / 4 + (Math.random() - 0.5) * 25;
          ctx.lineTo(nx, ny); lx = nx; ly = ny;
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // 20 ô pin
      const cellCount = 20, cellW = 22, cellH = 55, gap = 5;
      const totalW = cellCount * (cellW + gap) - gap;
      const startX = cx - totalW / 2, startY = cy - cellH / 2;
      const fillProgress = Math.min(1, t * 1.2);
      const cellsFilled = Math.floor(fillProgress * cellCount);
      for (let i = 0; i < cellCount; i++) {
        const x = startX + i * (cellW + gap);
        ctx.strokeStyle = "rgba(255,215,0,0.5)"; ctx.lineWidth = 2;
        ctx.strokeRect(x, startY, cellW, cellH);
        if (i < cellsFilled) {
          const fp = Math.min(1, fillProgress * cellCount - i);
          const fillH = cellH * fp;
          const grad = ctx.createLinearGradient(x, startY + cellH - fillH, x, startY + cellH);
          grad.addColorStop(0, "#ffd700"); grad.addColorStop(1, "#ff8c00");
          ctx.fillStyle = grad; ctx.shadowBlur = 12; ctx.shadowColor = "#ffd700";
          ctx.fillRect(x + 2, startY + cellH - fillH + 2, cellW - 4, Math.max(0, fillH - 4));
          ctx.shadowBlur = 0;
        }
      }
      // "+20" bay lên
      if (t > 0.4) {
        const tp = (t - 0.4) / 0.6;
        const ta = Math.sin(tp * Math.PI);
        ctx.fillStyle = `rgba(255,240,100,${ta})`;
        ctx.font = "bold 72px Consolas, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowBlur = 30; ctx.shadowColor = "#ffd700";
        ctx.fillText("+20", cx, cy - 130 - tp * 80);
        ctx.shadowBlur = 0;
      }
      drawShipShape(cx, cy, 28, "#71ff91", -Math.PI / 2);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. it_ap / it_ap_boost — Bánh răng thời gian, cột năng lượng, "+2 AP"
    // ═══════════════════════════════════════════════════════════════════
    else if (itemId === "it_ap" || itemId === "it_ap_boost") {
      ctx.fillStyle = `rgba(20,60,30,${Math.min(0.5, t * 1.5)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(now / 1000);
      for (let layer = 0; layer < 3; layer++) {
        const r = 110 + layer * 45;
        const teeth = 14 + layer * 3;
        ctx.strokeStyle = `rgba(113,255,145,${0.5 - layer * 0.12})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const inner = r - 15, outer = r + 15;
          const a1 = a - 0.1, a2 = a + 0.1;
          ctx.moveTo(cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner);
          ctx.lineTo(cx + Math.cos(a1) * outer, cy + Math.sin(a1) * outer);
          ctx.lineTo(cx + Math.cos(a2) * outer, cy + Math.sin(a2) * outer);
          ctx.lineTo(cx + Math.cos(a2) * inner, cy + Math.sin(a2) * inner);
        }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r - 22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + now / 500;
        const x = cx + Math.cos(ang) * 230;
        const pillarAlpha = Math.sin(t * Math.PI) * 0.4;
        const grad = ctx.createLinearGradient(x, cy + 350, x, cy - 350);
        grad.addColorStop(0, "rgba(113,255,145,0)");
        grad.addColorStop(0.5, `rgba(113,255,145,${pillarAlpha})`);
        grad.addColorStop(1, "rgba(113,255,145,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x - 4, cy - 350, 8, 700);
      }
      if (t > 0.3) {
        const tp = (t - 0.3) / 0.7;
        const ta = Math.sin(tp * Math.PI);
        ctx.fillStyle = `rgba(113,255,145,${ta})`;
        ctx.font = "bold 84px Consolas, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowBlur = 40; ctx.shadowColor = "#71ff91";
        ctx.fillText("+2 AP", cx, cy - tp * 70);
        ctx.shadowBlur = 0;
      }
      drawShipShape(cx, cy, 28, "#71ff91", -Math.PI / 2);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. it_black_hole — Hành tinh bị hút, lỗ đen, mảnh vỡ, Carnelian bay ra
    // ═══════════════════════════════════════════════════════════════════
    else if (itemId === "it_black_hole") {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.9, t * 2)})`;
      ctx.fillRect(0, 0, w, h);
      if (t < 0.5) {
        const pr = 130 * (1 - t / 0.5);
        const pa = 1 - t / 0.5;
        if (pr > 0) {
          ctx.save(); ctx.globalAlpha = pa;
          ctx.translate(cx, cy); ctx.rotate(t * 4);
          const pg = ctx.createRadialGradient(-pr * 0.3, -pr * 0.3, 0, 0, 0, pr);
          pg.addColorStop(0, "#ffb45e"); pg.addColorStop(1, "#5a3a1a");
          ctx.fillStyle = pg; ctx.fillRect(-pr, -pr * 0.6, pr * 2, pr * 1.2);
          ctx.restore();
        }
      }
      if (t > 0.1) {
        const bhSize = Math.min(1, t * 2) * (t < 0.6 ? 80 + t * 130 : 160 + Math.sin(now / 200) * 15);
        for (let layer = 0; layer < 4; layer++) {
          const r = bhSize + layer * 30;
          const rot = now / (300 + layer * 100) + layer * 0.5;
          const fadeOut = t > 0.9 ? (1 - (t - 0.9) / 0.1) : 1;
          ctx.strokeStyle = `rgba(255,${100 + layer * 30},0,${(1 - layer * 0.2) * fadeOut})`;
          ctx.lineWidth = 5 - layer * 0.8;
          ctx.shadowBlur = 20; ctx.shadowColor = "#ff6600";
          ctx.beginPath(); ctx.arc(cx, cy, r, rot, rot + Math.PI * 1.6); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(cx, cy, bhSize, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.6 + Math.sin(now / 100) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, bhSize + 2, 0, Math.PI * 2); ctx.stroke();
      }
      if (t > 0.3 && t < 0.7) {
        const fragT = (t - 0.3) / 0.4;
        for (let i = 0; i < 40; i++) {
          const startAngle = (i / 40) * Math.PI * 2;
          const r = 300 * (1 - fragT);
          const angle = startAngle + fragT * 3;
          const size = 15 * (1 - fragT);
          ctx.fillStyle = `rgba(255,${150 + Math.random() * 100},50,${1 - fragT})`;
          ctx.beginPath();
          const px = cx + Math.cos(angle) * r, py = cy + Math.sin(angle) * r;
          ctx.moveTo(px, py - size); ctx.lineTo(px + size * 0.6, py);
          ctx.lineTo(px, py + size); ctx.lineTo(px - size * 0.6, py);
          ctx.closePath(); ctx.fill();
        }
      }
      if (t > 0.7) {
        const gemT = (t - 0.7) / 0.3;
        for (let i = 0; i < 2; i++) {
          const gemAngle = i === 0 ? -Math.PI / 4 : Math.PI / 4;
          const dist = gemT * 260;
          const px = cx + Math.cos(gemAngle) * dist;
          const py = cy + Math.sin(gemAngle) * dist;
          ctx.save();
          ctx.globalAlpha = Math.sin(gemT * Math.PI);
          ctx.translate(px, py); ctx.rotate(gemT * 8);
          ctx.shadowBlur = 25; ctx.shadowColor = "#f28b55";
          ctx.fillStyle = "#f28b55";
          const s = 30;
          ctx.beginPath();
          ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0);
          ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0);
          ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath();
          ctx.moveTo(0, -s); ctx.lineTo(s * 0.3, 0); ctx.lineTo(0, -s * 0.3);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. it_swap_pos — Hai tàu lao vào nhau, xoáy, tách ra đổi bên
    // ═══════════════════════════════════════════════════════════════════
    else if (itemId === "it_swap_pos") {
      ctx.fillStyle = `rgba(0,0,20,${Math.min(0.7, t * 1.5)})`;
      ctx.fillRect(0, 0, w, h);
      if (t < 0.3) {
        const p1 = t / 0.3;
        const d = 320 * (1 - p1);
        drawShipShape(cx - d, cy, 30, "#71ff91", Math.PI / 2);
        drawShipShape(cx + d, cy, 30, "#ff6565", -Math.PI / 2);
        ctx.strokeStyle = `rgba(113,255,145,${0.6 * p1})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 450, cy); ctx.lineTo(cx - d - 25, cy); ctx.stroke();
        ctx.strokeStyle = `rgba(255,101,101,${0.6 * p1})`;
        ctx.beginPath(); ctx.moveTo(cx + 450, cy); ctx.lineTo(cx + d + 25, cy); ctx.stroke();
      } else if (t < 0.55) {
        const p2 = (t - 0.3) / 0.25;
        const r = 45;
        const a = p2 * Math.PI * 2;
        drawShipShape(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 30, "#71ff91", a + Math.PI / 2);
        drawShipShape(cx - Math.cos(a) * r, cy - Math.sin(a) * r, 30, "#ff6565", a - Math.PI / 2);
        drawGlow(cx, cy, 120 * Math.sin(p2 * Math.PI), "rgba(200,150,255,ALPHA)", "rgba(100,50,200,ALPHA)", 0.9);
      } else {
        const p3 = (t - 0.55) / 0.45;
        const d = 320 * p3;
        drawShipShape(cx + d, cy, 30, "#71ff91", -Math.PI / 2);
        drawShipShape(cx - d, cy, 30, "#ff6565", Math.PI / 2);
        ctx.strokeStyle = `rgba(113,255,145,${0.6 * (1 - p3)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + d, cy); ctx.stroke();
        ctx.strokeStyle = `rgba(255,101,101,${0.6 * (1 - p3)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - d, cy); ctx.stroke();
      }
      if (t > 0.15 && t < 0.85) {
        const aa = Math.sin((t - 0.15) / 0.7 * Math.PI);
        ctx.fillStyle = `rgba(255,255,255,${aa * 0.9})`;
        ctx.font = "bold 90px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowBlur = 30; ctx.shadowColor = "#c8a0ff";
        ctx.fillText("⇄", cx, cy - 190);
        ctx.shadowBlur = 0;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6. it_scarecrow — Reticle đỏ, nhiễu loạn, "-1 AP" rơi xuống
    // ═══════════════════════════════════════════════════════════════════
    else if (itemId === "it_scarecrow") {
      ctx.fillStyle = `rgba(60,0,0,${Math.min(0.6, t * 1.5)})`;
      ctx.fillRect(0, 0, w, h);
      if (t < 0.7) {
        const rT = Math.min(1, t / 0.3);
        const reticleR = 160 * rT;
        ctx.strokeStyle = "rgba(255,60,60,0.9)";
        ctx.lineWidth = 3; ctx.shadowBlur = 20; ctx.shadowColor = "#ff0000";
        for (let c = 0; c < 4; c++) {
          const a = c * Math.PI / 2 + Math.PI / 4;
          ctx.beginPath(); ctx.arc(cx, cy, reticleR, a - 0.3, a + 0.3); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(cx, cy, reticleR * 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - reticleR * 1.15, cy); ctx.lineTo(cx - reticleR * 0.4, cy);
        ctx.moveTo(cx + reticleR * 0.4, cy); ctx.lineTo(cx + reticleR * 1.15, cy);
        ctx.moveTo(cx, cy - reticleR * 1.15); ctx.lineTo(cx, cy - reticleR * 0.4);
        ctx.moveTo(cx, cy + reticleR * 0.4); ctx.lineTo(cx, cy + reticleR * 1.15);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      if (t > 0.3 && t < 0.9) {
        const sa = Math.sin((t - 0.3) / 0.6 * Math.PI) * 0.5;
        for (let i = 0; i < 80; i++) {
          const sx = Math.random() * w, sy = Math.random() * h;
          const ss = Math.random() * 10 + 2;
          ctx.fillStyle = `rgba(255,60,60,${sa * Math.random()})`;
          ctx.fillRect(sx, sy, ss, ss * Math.random());
        }
      }
      if (t > 0.4) {
        const tp = (t - 0.4) / 0.6;
        const ta = Math.sin(tp * Math.PI);
        ctx.fillStyle = `rgba(255,60,60,${ta})`;
        ctx.font = "bold 100px Consolas, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowBlur = 40; ctx.shadowColor = "#ff0000";
        ctx.fillText("-1 AP", cx, cy - 100 + tp * 220);
        ctx.shadowBlur = 0;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 7. it_steal — Bàn tay ma vươn tới, item phát sáng, bị kéo đi
    // ═══════════════════════════════════════════════════════════════════
    else if (itemId === "it_steal") {
      ctx.fillStyle = `rgba(20,0,40,${Math.min(0.8, t * 2)})`;
      ctx.fillRect(0, 0, w, h);
      if (t > 0.1 && t < 0.7) {
        const handT = (t - 0.1) / 0.6;
        const handX = -220 + handT * (cx + 220);
        const handAlpha = Math.sin(handT * Math.PI) * 0.9;
        ctx.save();
        ctx.globalAlpha = handAlpha;
        ctx.fillStyle = "rgba(150,50,200,0.7)";
        ctx.shadowBlur = 40; ctx.shadowColor = "#8000ff";
        ctx.beginPath(); ctx.ellipse(handX, cy, 85, 55, 0, 0, Math.PI * 2); ctx.fill();
        for (let f = 0; f < 4; f++) {
          const fx = handX + 65 + f * 16;
          const fy = cy - 42 + f * 26;
          const fw = 16 + Math.sin(now / 100 + f) * 5;
          ctx.beginPath(); ctx.ellipse(fx, fy, fw, 32, 0.3 + f * 0.1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      if (t > 0.3) {
        const itemAlpha = t < 0.7 ? Math.min(1, (t - 0.3) * 5) : Math.max(0, 1 - (t - 0.7) * 5);
        const pull = t > 0.6 ? (t - 0.6) * 3 : 0;
        const itemX = cx - pull * 320;
        ctx.save();
        ctx.globalAlpha = itemAlpha;
        ctx.translate(itemX, cy); ctx.rotate(now / 300);
        ctx.shadowBlur = 30; ctx.shadowColor = "#ffdc64";
        ctx.fillStyle = "#ffdc64";
        ctx.font = "bold 110px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("💎", 0, 0);
        ctx.restore();
      }
      if (t > 0.7) {
        const vT = (t - 0.7) / 0.3;
        ctx.fillStyle = `rgba(128,0,255,${Math.sin(vT * Math.PI) * 0.5})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8. it_magnet — Từ trường, tài nguyên bay vào, tàu phát sáng
    // ═══════════════════════════════════════════════════════════════════
    else if (itemId === "it_magnet") {
      ctx.fillStyle = `rgba(10,0,30,${Math.min(0.7, t * 1.5)})`;
      ctx.fillRect(0, 0, w, h);
      const fieldPulse = Math.sin(now / 200) * 0.3 + 0.7;
      for (let i = 0; i < 5; i++) {
        const r = 90 + i * 65 + fieldPulse * 25;
        ctx.strokeStyle = `rgba(121,215,255,${0.55 - i * 0.09})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      const numRes = 70;
      const colors = ["#71ff91", "#ffb45e", "#79d7ff", "#ff76dc", "#d1a8ff", "#ffcc5f"];
      for (let i = 0; i < numRes; i++) {
        const spawnT = 0.08 + (i / numRes) * 0.72;
        if (t < spawnT) continue;
        const p = (t - spawnT) / (1 - spawnT);
        const startAngle = (i * 137.5) * Math.PI / 180;
        const r = 520 + (45 - 520) * p;
        const angle = startAngle + p * 2.2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        const size = 13 * (1 - p * 0.7);
        const col = colors[i % colors.length];
        ctx.fillStyle = col; ctx.shadowBlur = 15; ctx.shadowColor = col;
        ctx.save(); ctx.translate(px, py); ctx.rotate(p * 8);
        ctx.beginPath();
        ctx.moveTo(0, -size); ctx.lineTo(size * 0.7, 0);
        ctx.lineTo(0, size); ctx.lineTo(-size * 0.7, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      drawShipShape(cx, cy, 35, "#71ff91", -Math.PI / 2);
      if (t > 0.6) {
        const gp = Math.sin(now / 100) * 0.5 + 0.5;
        drawGlow(cx, cy, 110 + gp * 60, "rgba(113,255,145,ALPHA)", "rgba(113,255,145,ALPHA)", 0.5 * (1 - t));
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 9. Fallback — vật phẩm chưa có animation riêng
    // ═══════════════════════════════════════════════════════════════════
    else {
      drawGlow(cx, cy, 200 * Math.sin(t * Math.PI), "rgba(255,180,94,ALPHA)", "rgba(255,180,94,ALPHA)", 0.9);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 100px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(itemInfo.icon, cx, cy);
    }

    // ═══ Badge tên + mô tả item (common cho mọi item) ═══
    if (t > 0.08 && t < 0.95) {
      const badgeAlpha = Math.min(1, (t - 0.08) * 8) * Math.min(1, (0.95 - t) * 8);
      ctx.save();
      ctx.globalAlpha = badgeAlpha;
      const badgeW = 380, badgeH = 84;
      const badgeX = cx - badgeW / 2, badgeY = h - 165;
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.strokeStyle = "#ffb45e"; ctx.lineWidth = 2;
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
      ctx.fillStyle = "#ffb45e";
      ctx.font = "bold 12px Consolas, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("▶ SỬ DỤNG VẬT PHẨM", cx, badgeY + 16);
      ctx.font = "bold 22px Consolas, monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText(`${itemInfo.icon}  ${itemInfo.name.toUpperCase()}`, cx, badgeY + 40);
      ctx.fillStyle = "#a8ffba";
      ctx.font = "13px Consolas, monospace";
      ctx.fillText(itemInfo.desc, cx, badgeY + 64);
      ctx.restore();
    }

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      finishAnimation();
    }
  }

  let isFinished = false;
  function finishAnimation() {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(fallbackTimer);
    overlay.style.transition = "opacity 0.5s ease";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      if (onComplete) onComplete();
    }, 500);
  }

  const fallbackTimer = setTimeout(finishAnimation, 5000);
  requestAnimationFrame(animate);
}


function isMotionReduced() {
  // CHỈ tôn trọng toggle "Giảm chuyển động" trong Settings game.
  // BỎ QUA OS preference (prefers-reduced-motion) vì game cần animation làm feedback chính.
  return settings.reducedMotion === true;
}

function startActionEffects(action, previousView, nextView, actionReport) {
  // Chỉ tắt nếu người chơi chủ động bật trong Settings của game
  if (settings.reducedMotion) { activeEffects = []; return; }
  const startedAt = performance.now();
  if (action === "MOVE") {
    activeEffects = activeEffects.filter((effect) => effect.type !== "move" && effect.type !== "teleport");
    const wh = actionReport?.result?.kind === "WormholeEntered" ? actionReport.result : null;
    if (wh) {
      activeEffects.push({ type: "teleport", from: { ...wh.from }, to: { ...wh.to }, startedAt, duration: 800 });
    } else {
      activeEffects.push({ type: "move", from: { ...previousView.player.position }, to: { ...nextView.player.position }, startedAt, duration: 620 });
    }
  }
  if (["OBSERVE", "SCAN_AREA", "SCAN_NEAREST", "SCAN_OPPONENT"].includes(action)) {
    // Tăng duration lên 1400ms để người chơi kịp thưởng thức hiệu ứng
    activeEffects.push({ 
      type: "scan", 
      subType: action, 
      center: { ...previousView.player.position }, 
      startedAt, 
      duration: 1400 
    });
  }

  // ═══ MŨI TÊN CHỈ HƯỚNG (chạy song song với scan effect) ═══
  if (action === "SCAN_NEAREST"
      && actionReport?.result?.kind === "NearestPlanetSignal"
      && actionReport.result.found
      && actionReport.result.direction) {
    activeEffects.push({
      type: "direction_pulse",
      center: { ...previousView.player.position },
      direction: actionReport.result.direction,
      distance: actionReport.result.distance,
      hostile: false,
      startedAt,
      duration: 2600
    });
  }
  if (action === "SCAN_OPPONENT"
      && actionReport?.result?.kind === "OpponentSignal"
      && actionReport.result.direction) {
    activeEffects.push({
      type: "direction_pulse",
      center: { ...previousView.player.position },
      direction: actionReport.result.direction,
      hostile: true,
      startedAt,
      duration: 2600
    });
  }
  if (action === "MINE") {
    activeEffects.push({ 
      type: "mine", 
      center: { ...previousView.player.position }, 
      startedAt, 
      duration: 1400 
    });
  }
  if (action === "DEPOSIT") {
    activeEffects.push({ 
      type: "deposit", 
      from: { ...previousView.player.position }, 
      to: { ...previousView.earth }, 
      startedAt, 
      duration: 1600 
    });
  }
  if (action === "RECHARGE") {
    activeEffects.push({ 
      type: "recharge", 
      center: { ...previousView.player.position }, 
      startedAt, 
      duration: 1600 
    });
  }
  if (action === "OPEN_CRATE") {
    activeEffects.push({ type: "crate", center: { ...previousView.player.position }, startedAt, duration: 1200 });
  }
  if (action === "INTERACT_MONOLITH") {
    const isGood = actionReport?.result?.message?.includes("Nhan");
    activeEffects.push({ 
      type: "monolith_act", 
      center: { ...previousView.player.position }, 
      isGood: isGood,
      startedAt, 
      duration: 1500 
    });
  }
  if (action === "ACTIVATE_BEACON") {
    activeEffects.push({ 
      type: "beacon_act", 
      center: { ...previousView.player.position }, 
      startedAt, 
      duration: 2000 
    });
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
  if (result.kind === "WormholeEntered") return `DỊCH CHUYỂN KHÔNG GIAN: (${result.from.x}, ${result.from.y}) → (${result.to.x}, ${result.to.y}).`;
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
  const wormholed = response.ok && report.result?.kind === "WormholeEntered" ? report.result : null;
  if (response.ok) {
    
    // ▼▼ THÊM DÒNG NÀY ĐỂ KÍCH HOẠT MEME ▼▼
    if (action === "END_TURN") playEndTurnMeme();
    
    startActionEffects(action, previousView, nextView, report);
    const discovered = found.length > 0;
    if (wormholed) {
      enqueueToast({
        level: "success",
        title: "DỊCH CHUYỂN KHÔNG GIAN",
        message: `(${wormholed.from.x}, ${wormholed.from.y}) → (${wormholed.to.x}, ${wormholed.to.y})`,
        code: "WORMHOLE_ENTERED",
      });
    } else {
      enqueueToast({
        level: discovered ? "success" : "info",
        title: discovered ? "ĐÃ PHÁT HIỆN HÀNH TINH" : `${actionLabel(action)} ĐÃ XÁC NHẬN`,
        message: discovered ? `Đã thêm ${found.length} hành tinh mới vào bản đồ.` : localizeText(report.message),
        code: discovered ? "PLANET_DISCOVERED" : report.code,
      });
    }
    // Xử lý event đi kèm trong action report (nếu server không gửi event_triggered riêng)
    if (report.event && report.event.kind === "planet") {
      showAdapterNotification({
        code: `EVENT_${report.event.name}`,
        level: "warning",
        title: report.event.name,
        message: report.message || "Sự kiện hành tinh đã xảy ra."
      });
    }
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
  const commands = commandDefinitions.map(([name, cost]) => {
    let disabled = locked;
    if (name === "OPEN_CRATE" && !view.crateHere) disabled = true;
    if (name === "INTERACT_MONOLITH" && (!view.monolithHere || view.player.battery < 20)) disabled = true;
    if (name === "ACTIVATE_BEACON" && (!view.beaconHere || view.beaconHere.active)) disabled = true;
    return `
    <button class="command-option ${actionFlow.selected === name ? 'active-command' : ''}" type="button" data-command="${name}" ${disabled ? "disabled" : ""} aria-pressed="${actionFlow.selected === name}">
      <strong>${actionLabel(name)}</strong><span>${cost}</span>
    </button>`;
  }).join("");
  
  const selected = actionFlow.selected;
  // Mặc định không chọn gì thì hiện dòng chữ mờ
  let detail = `<div class="empty-terminal-vibe">// AWAITING COMMAND SELECTION...</div>`;
  
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
    
    const recharge = selected === "RECHARGE" ? rechargeControlsMarkup(view) : "";
    
    // CẤU TRÚC LẠI TOÀN BỘ KHỐI TÓM TẮT
    detail = `
      <div class="action-summary dark-vibe">
        
        <!-- Tiêu đề tên lệnh -->
        <div class="action-summary-title">
          <strong class="cyber-title">${actionLabel(selected)}</strong>
        </div>
        
        <!-- Thông tin mục tiêu & chi phí căn giữa -->
        <div class="action-summary-details">
          <div><span>MỤC TIÊU:</span> <strong>${escapeHtml(target)}</strong></div>
          <div><span>CHI PHÍ:</span> <strong>${escapeHtml(cost || "—")}</strong></div>
        </div>
        
        ${recharge}
        
        <!-- Nút Gửi Lệnh -->
        <div class="alien-button-container">
          <button class="alien-execute-btn" type="button" data-action="send-command" ${locked ? "disabled" : ""}>
            <span class="btn-text">GỬI LỆNH</span>
            <div class="scanline"></div>
          </button>
        </div>
      </div>`;
  }
  
  return `<div class="command-list">${commands}</div><div class="command-interaction">${detail}</div>`;
}

function distanceBetween(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function rechargeControlsMarkup(view) {
  const storage = view.player.earthStorage || {};
  const resources = Object.keys(storage).filter((type) => storage[type] > 0);
  if (!resources.length) return "";
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

// Cache bounds — chỉ recalc khi resize hoặc lần đầu
let cachedCanvasSize = null;
let cachedCanvasElement = null;

function canvasContext(canvas) {
  // Chỉ đo lại khi canvas element đổi hoặc lần đầu
  if (canvas !== cachedCanvasElement || !cachedCanvasSize) {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    cachedCanvasSize = {
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
      pixelRatio,
      canvasWidth: Math.round(bounds.width * pixelRatio),
      canvasHeight: Math.round(bounds.height * pixelRatio),
    };
    cachedCanvasElement = canvas;
    if (canvas.width !== cachedCanvasSize.canvasWidth || canvas.height !== cachedCanvasSize.canvasHeight) {
      canvas.width = cachedCanvasSize.canvasWidth;
      canvas.height = cachedCanvasSize.canvasHeight;
    }
  }
  const { width, height, pixelRatio } = cachedCanvasSize;
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

// ═══ Reset cache khi resize ═══
window.addEventListener("resize", () => { cachedCanvasSize = null; });

function drawFeedbackEffects(ctx, width, height, cellSize, screenX, screenY, now) {
  for (const effect of activeEffects) {
    const progress = Math.max(0, Math.min(1, (now - effect.startedAt) / effect.duration));
    if (effect.type === "move") {
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const curX = effect.from.x + (effect.to.x - effect.from.x) * eased;
      const curY = effect.from.y + (effect.to.y - effect.from.y) * eased;
      
      const fromX = screenX(effect.from.x), fromY = screenY(effect.from.y);
      const toX = screenX(effect.to.x), toY = screenY(effect.to.y);
      const shipX = screenX(curX), shipY = screenY(curY);
      
      const dx = effect.to.x - effect.from.x;
      const dy = effect.to.y - effect.from.y;
      // Tính góc xoay: Tàu mặc định hướng lên (trục -Y), nên cộng thêm PI/2
      const angle = (dx !== 0 || dy !== 0) ? Math.atan2(dy, dx) + Math.PI / 2 : 0;
      
      ctx.save();
      
      // 1. Vệt sáng đuôi (Warp Trail)
      const tailLength = Math.min(1, progress * 4); // Vệt đuôi dài dần
      const tailX = shipX - (shipX - fromX) * tailLength;
      const tailY = shipY - (shipY - fromY) * tailLength;
      
      const trailGrad = ctx.createLinearGradient(tailX, tailY, shipX, shipY);
      trailGrad.addColorStop(0, "rgba(113, 255, 145, 0)");
      trailGrad.addColorStop(1, "rgba(113, 255, 145, 0.8)");
      
      ctx.strokeStyle = trailGrad;
      ctx.lineWidth = Math.max(4, cellSize * 0.2); // Vệt đuôi to
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(shipX, shipY);
      ctx.stroke();

      // Lõi vệt sáng (trắng)
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - progress * 0.5)})`;
      ctx.lineWidth = Math.max(1, cellSize * 0.05);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(shipX, shipY);
      ctx.stroke();

      // 2. Target Reticle (4 góc ngoặc tại điểm đích)
      const reticleAlpha = Math.max(0, 1 - progress * 1.5);
      if (reticleAlpha > 0) {
        ctx.strokeStyle = `rgba(255, 240, 166, ${reticleAlpha})`;
        ctx.lineWidth = 2;
        const size = cellSize * 0.4;
        const len = cellSize * 0.15;
        ctx.beginPath();
        // Góc trên trái
        ctx.moveTo(toX - size, toY - size + len); ctx.lineTo(toX - size, toY - size); ctx.lineTo(toX - size + len, toY - size);
        // Góc trên phải
        ctx.moveTo(toX + size - len, toY - size); ctx.lineTo(toX + size, toY - size); ctx.lineTo(toX + size, toY - size + len);
        // Góc dưới trái
        ctx.moveTo(toX - size, toY + size - len); ctx.lineTo(toX - size, toY + size); ctx.lineTo(toX - size + len, toY + size);
        // Góc dưới phải
        ctx.moveTo(toX + size - len, toY + size); ctx.lineTo(toX + size, toY + size); ctx.lineTo(toX + size, toY + size - len);
        ctx.stroke();
        
        // Vòng tròn nhắm mục tiêu thu nhỏ
        ctx.strokeStyle = `rgba(113, 255, 145, ${reticleAlpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(toX, toY, cellSize * (0.8 - progress * 0.3), 0, Math.PI * 2);
        ctx.stroke();
      }

      // 3. Particle Burst tại điểm xuất phát (0.2s đầu)
      if (progress < 0.2) {
        const burstProgress = progress / 0.2;
        ctx.fillStyle = `rgba(113, 255, 145, ${1 - burstProgress})`;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + (now / 100);
          const r = cellSize * 0.5 * burstProgress;
          ctx.beginPath();
          ctx.arc(fromX + Math.cos(a) * r, fromY + Math.sin(a) * r, Math.max(1, cellSize * 0.08 * (1 - burstProgress)), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Tàu di chuyển & Xoay góc
      ctx.translate(shipX, shipY);
      ctx.rotate(angle);
      
      // Hiệu ứng lửa phụt đuôi tàu (vẽ đè lên lửa tĩnh của drawMapGlyph)
      const thrust = Math.sin(now / 40) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255, 180, 94, ${0.8 * thrust * (1 - progress * 0.5)})`;
      ctx.beginPath();
      ctx.moveTo(-cellSize * 0.1, cellSize * 0.25);
      ctx.lineTo(0, cellSize * 0.6 * thrust);
      ctx.lineTo(cellSize * 0.1, cellSize * 0.25);
      ctx.fill();

      // Vẽ thân tàu tại tâm (0,0) do đã translate
      drawMapGlyph(ctx, "ship", 0, 0, cellSize, now);
      
      ctx.restore();
    } else if (effect.type === "crate") {
      // ── HIỆU ỨNG MỞ HÒM: TREASURE BURST ──
      const cx = screenX(effect.center.x), cy = screenY(effect.center.y);
      ctx.save();
      
      // Sóng xung kích vòng tròn (Shockwaves)
      for (let i = 0; i < 3; i++) {
        const p = Math.max(0, progress - i * 0.15);
        if (p > 0 && p < 1) {
          const r = cellSize * 2.5 * p;
          ctx.strokeStyle = `rgba(255, 215, 0, ${1 - p})`;
          ctx.lineWidth = Math.max(1, cellSize * 0.15 * (1 - p));
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        }
      }
      
      // Tia sáng pháo hoa (Particle Burst)
      if (progress < 0.8) {
        const pAlpha = 1 - (progress / 0.8);
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
          const speed = cellSize * (1 + Math.random() * 2) * progress;
          const px = cx + Math.cos(angle) * speed;
          const py = cy + Math.sin(angle) * speed;
          
          ctx.fillStyle = `rgba(255, 240, 166, ${pAlpha})`;
          ctx.shadowBlur = 8; ctx.shadowColor = "#ffd700";
          // Hạt hình thoi (Kim cương)
          ctx.beginPath();
          ctx.moveTo(px, py - cellSize * 0.06);
          ctx.lineTo(px + cellSize * 0.04, py);
          ctx.lineTo(px, py + cellSize * 0.06);
          ctx.lineTo(px - cellSize * 0.04, py);
          ctx.closePath();
          ctx.fill();
        }
      }
      
      // Ánh sáng trung tâm lóe lên
      if (progress < 0.3) {
        const flashP = progress / 0.3;
        ctx.fillStyle = `rgba(255, 255, 255, ${1 - flashP})`;
        ctx.beginPath(); ctx.arc(cx, cy, cellSize * 1.5 * (1 - flashP), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (effect.type === "monolith_act") {
      const cx = screenX(effect.center.x), cy = screenY(effect.center.y);
      ctx.save();
      
      // Vòng xoáy hút vào (Vortex)
      if (progress < 0.6) {
        const p1 = progress / 0.6;
        ctx.strokeStyle = effect.isGood ? `rgba(255, 215, 0, ${1 - p1})` : `rgba(255, 101, 101, ${1 - p1})`;
        ctx.lineWidth = Math.max(1, cellSize * 0.1 * (1 - p1));
        ctx.shadowBlur = 15; ctx.shadowColor = effect.isGood ? "#ffd700" : "#ff6565";
        for (let i = 0; i < 4; i++) {
          const r = cellSize * (1.5 - p1) * (1 + i * 0.5);
          const rot = -p1 * Math.PI * 4 + (i * Math.PI / 2);
          ctx.beginPath(); ctx.arc(cx, cy, r, rot, rot + Math.PI * 1.5); ctx.stroke();
        }
      }
      
      // Chớp sáng
      if (progress >= 0.5 && progress < 0.8) {
        const flashP = (progress - 0.5) / 0.3;
        ctx.fillStyle = effect.isGood ? `rgba(255, 255, 255, ${1 - flashP})` : `rgba(255, 100, 100, ${1 - flashP})`;
        ctx.beginPath(); ctx.arc(cx, cy, cellSize * 3 * flashP, 0, Math.PI * 2); ctx.fill();
      }
      
      // Tàn tro (Particles)
      if (progress > 0.4) {
        const p2 = (progress - 0.4) / 0.6;
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI / 4;
          const dist = cellSize * 3 * p2;
          const px = cx + Math.cos(ang) * dist;
          const py = cy + Math.sin(ang) * dist;
          ctx.fillStyle = effect.isGood ? `rgba(255, 215, 0, ${1 - p2})` : `rgba(209, 168, 255, ${1 - p2})`; // Tím nếu xui
          ctx.beginPath(); ctx.arc(px, py, Math.max(1, cellSize * 0.1 * (1 - p2)), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    } else if (effect.type === "beacon_act") {
      const cx = screenX(effect.center.x), cy = screenY(effect.center.y);
      ctx.save();
      
      // Sóng xung kích vàng lan rộng (Radius 15 cells)
      const maxR = cellSize * 15;
      const waveP = progress < 0.5 ? progress / 0.5 : 1; // 0->1
      
      // Vẽ 3 vòng sóng nối tiếp
      for (let i = 0; i < 3; i++) {
        const p = Math.max(0, waveP - i * 0.15);
        if (p > 0 && p < 1) {
          ctx.strokeStyle = `rgba(255, 215, 0, ${1 - p})`;
          ctx.lineWidth = Math.max(2, cellSize * 0.2 * (1 - p));
          ctx.shadowBlur = 20; ctx.shadowColor = "#ffd700";
          ctx.beginPath(); ctx.arc(cx, cy, maxR * p, 0, Math.PI * 2); ctx.stroke();
        }
      }
      
      // Tia sáng bắn lên trời
      if (progress < 0.8) {
        const beamP = progress / 0.8;
        const beamGrad = ctx.createLinearGradient(cx, cy, cx, cy - cellSize * 10);
        beamGrad.addColorStop(0, `rgba(255, 255, 255, ${1 - beamP})`);
        beamGrad.addColorStop(1, `rgba(255, 215, 0, 0)`);
        ctx.fillStyle = beamGrad;
        ctx.fillRect(cx - cellSize * 0.5, cy - cellSize * 10, cellSize * 1, cellSize * 10);
      }
      
      ctx.restore();
    } else if (effect.type === "teleport") {      // ── HIỆU ỨNG CỔNG KHÔNG GIAN: EVENT HORIZON ──
      const fromX = screenX(effect.from.x), fromY = screenY(effect.from.y);
      const toX = screenX(effect.to.x), toY = screenY(effect.to.y);
      ctx.save();

      if (progress < 0.45) {
        // GIAI ĐOẠN 1: HÚT VÀO HỐ ĐEN (0 -> 0.45)
        const p1 = progress / 0.45; // 0 -> 1
        
        // Vẽ tàu bị xoáy và thu nhỏ
        ctx.save();
        ctx.translate(fromX, fromY);
        ctx.rotate(p1 * Math.PI * 4); // Xoay 2 vòng
        ctx.scale(1 - p1, 1 - p1); // Thu nhỏ về 0
        ctx.globalAlpha = 1 - p1;
        drawMapGlyph(ctx, "ship", 0, 0, cellSize, now);
        ctx.restore();

        // Xoáy không gian (Vortex)
        ctx.strokeStyle = `rgba(180, 80, 220, ${1 - p1})`; // Tím
        ctx.shadowBlur = 15; ctx.shadowColor = "#d1a8ff";
        ctx.lineWidth = Math.max(1, cellSize * 0.1 * (1 - p1));
        for (let i = 0; i < 4; i++) {
          const r = cellSize * (0.5 + i * 0.3) * (1 - p1); // Co lại vào tâm
          const rot = -p1 * Math.PI * 3 + (i * Math.PI / 2);
          ctx.beginPath();
          ctx.arc(fromX, fromY, r, rot, rot + Math.PI * 1.5);
          ctx.stroke();
        }
        // Lõi hố đen
        ctx.fillStyle = `rgba(0, 0, 0, ${p1})`;
        ctx.beginPath(); ctx.arc(fromX, fromY, cellSize * 0.4 * p1, 0, Math.PI * 2); ctx.fill();

      } else if (progress < 0.55) {
        // GIAI ĐOẠN 2: CHỚP SÁNG (0.45 -> 0.55)
        const flashAlpha = 1 - Math.abs((progress - 0.5) / 0.05);
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.beginPath(); ctx.arc(fromX, fromY, cellSize * 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(toX, toY, cellSize * 2, 0, Math.PI * 2); ctx.fill();

      } else {
        // GIAI ĐOẠN 3: TÁI SINH TẠI ĐÍCH (0.55 -> 1.0)
        const p3 = (progress - 0.55) / 0.45; // 0 -> 1
        
        // Vẽ tàu bung ra
        ctx.save();
        ctx.translate(toX, toY);
        ctx.rotate((1 - p3) * -Math.PI * 2); // Xoay ngược chiều lúc ra
        const scale = p3 < 0.8 ? p3 / 0.8 * 1.2 : 1.2 - (p3 - 0.8) * 1; // Bung to lố rồi thu về 1
        ctx.scale(scale, scale);
        ctx.globalAlpha = p3;
        drawMapGlyph(ctx, "ship", 0, 0, cellSize, now);
        ctx.restore();

        // Sóng xung kích (Shockwave) đẩy ra
        if (p3 > 0.3) {
          const waveP = (p3 - 0.3) / 0.7;
          ctx.strokeStyle = `rgba(121, 215, 255, ${1 - waveP})`; // Xanh lam
          ctx.lineWidth = Math.max(1, cellSize * 0.15 * (1 - waveP));
          ctx.shadowBlur = 15; ctx.shadowColor = "#79d7ff";
          ctx.beginPath(); ctx.arc(toX, toY, cellSize * 2.5 * waveP, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    } else if (effect.type === "scan") {
      const centerX = screenX(effect.center.x), centerY = screenY(effect.center.y);
      ctx.save();

      if (effect.subType === "OBSERVE") {
        // 1. SONAR PING (Quan sát - Xanh lá)
        const maxR = cellSize * 3.5;
        // 3 vòng sóng lan ra
        for (let i = 0; i < 3; i++) {
          const p = Math.max(0, progress - i * 0.15);
          if (p > 0 && p < 1) {
            const r = maxR * p;
            ctx.strokeStyle = `rgba(113, 255, 145, ${1 - p})`;
            ctx.lineWidth = Math.max(1.5, cellSize * 0.1 * (1 - p));
            ctx.beginPath(); ctx.arc(centerX, centerY, r, 0, Math.PI * 2); ctx.stroke();
          }
        }
        // Mặt nạ quét (Crosshair) quét chéo qua tâm
        if (progress < 1) {
          ctx.strokeStyle = `rgba(113, 255, 145, ${0.6 * (1 - progress)})`;
          ctx.lineWidth = 1;
          const offset = (progress - 0.5) * maxR * 2;
          ctx.beginPath();
          ctx.moveTo(centerX - maxR, centerY + offset);
          ctx.lineTo(centerX + maxR, centerY + offset);
          ctx.stroke();
        }

      } else if (effect.subType === "SCAN_AREA") {
        // 2. RADAR SWEEP (Quét khu vực - Hổ phách)
        const maxR = cellSize * 8.5;
        // Quạt quét xoay 360 độ
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + progress * Math.PI * 2;
        
        ctx.fillStyle = "rgba(255, 180, 94, 0.15)";
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, maxR, endAngle - 0.5, endAngle);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 180, 94, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(endAngle) * maxR, centerY + Math.sin(endAngle) * maxR);
        ctx.stroke();
        
        // Vòng tròn bao quanh viền radar
        ctx.strokeStyle = `rgba(255, 180, 94, ${0.3 * (1 - progress)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(centerX, centerY, maxR, 0, Math.PI * 2); ctx.stroke();

      } else if (effect.subType === "SCAN_NEAREST") {
        // 3. LIDAR TRACKING (Tìm gần nhất - Xanh lam)
        const maxR = cellSize * 6;
        const rot = progress * Math.PI * 2;
        ctx.strokeStyle = `rgba(121, 215, 255, ${1 - progress})`;
        ctx.lineWidth = 1.5;
        
        // 4 tia laze chéo nhau
        for (let i = 0; i < 4; i++) {
          const a = rot + i * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(centerX + Math.cos(a) * cellSize, centerY + Math.sin(a) * cellSize);
          ctx.lineTo(centerX + Math.cos(a) * maxR, centerY + Math.sin(a) * maxR);
          ctx.stroke();
        }
        
        // Lưới tọa độ chớp nháy
        if (Math.floor(progress * 10) % 2 === 0) {
          ctx.strokeStyle = `rgba(121, 215, 255, 0.3)`;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(centerX, centerY, maxR * 0.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

      } else if (effect.subType === "SCAN_OPPONENT") {
        // 4. HOSTILE LOCK (Quét đối thủ - Đỏ rực)
        const maxR = cellSize * 5;
        const r = maxR * Math.sin(progress * Math.PI); // Phóng to rồi thu nhỏ lại
        
        // Vòng tròn đỏ giật lag
        ctx.strokeStyle = `rgba(255, 101, 101, ${1 - progress})`;
        ctx.lineWidth = 2;
        const glitchX = (Math.random() - 0.5) * 4;
        const glitchY = (Math.random() - 0.5) * 4;
        
        ctx.beginPath();
        ctx.arc(centerX + glitchX, centerY + glitchY, r, 0, Math.PI * 2);
        ctx.stroke();
        
        // 4 góc ngoặc nhắm mục tiêu (Targeting Brackets)
        const bSize = r * 0.8;
        const bLen = r * 0.3;
        ctx.beginPath();
        // Trên trái
        ctx.moveTo(centerX - bSize, centerY - bSize + bLen); ctx.lineTo(centerX - bSize, centerY - bSize); ctx.lineTo(centerX - bSize + bLen, centerY - bSize);
        // Trên phải
        ctx.moveTo(centerX + bSize - bLen, centerY - bSize); ctx.lineTo(centerX + bSize, centerY - bSize); ctx.lineTo(centerX + bSize, centerY - bSize + bLen);
        // Dưới trái
        ctx.moveTo(centerX - bSize, centerY + bSize - bLen); ctx.lineTo(centerX - bSize, centerY + bSize); ctx.lineTo(centerX - bSize + bLen, centerY + bSize);
        // Dưới phải
        ctx.moveTo(centerX + bSize - bLen, centerY + bSize); ctx.lineTo(centerX + bSize, centerY + bSize); ctx.lineTo(centerX + bSize, centerY + bSize - bLen);
        ctx.stroke();
      }

      ctx.restore();
    } else if (effect.type === "discovery") {
      const x = screenX(effect.position.x), y = screenY(effect.position.y);
      const radius = cellSize * (0.35 + progress * 0.85);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 220, 140, ${1 - progress})`;
      ctx.lineWidth = Math.max(1, cellSize * 0.04);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (effect.type === "mine") {
      // ── HIỆU ỨNG KHAI THÁC: ARCANE TRACTOR BEAM ──
      const cx = screenX(effect.center.x);
      const cy = screenY(effect.center.y);
      ctx.save();

      // 1. Vòng tròn công nghệ dưới chân hành tinh (Tech Ring)
      const ringProgress = Math.min(1, progress * 2); // Hiện ra nhanh
      const maxRingR = cellSize * 0.9;
      
      ctx.strokeStyle = `rgba(255, 180, 94, ${1 - ringProgress})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy + cellSize * 0.2, maxRingR * ringProgress, 0, Math.PI * 2);
      ctx.stroke();

      // Các điểm sáng xoay quanh vòng tròn
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI / 2) + (progress * Math.PI * 4); // Xoay 2 vòng
        const px = cx + Math.cos(angle) * maxRingR * ringProgress;
        const py = cy + cellSize * 0.2 + Math.sin(angle) * maxRingR * ringProgress;
        ctx.fillStyle = `rgba(255, 240, 166, ${1 - ringProgress})`;
        ctx.shadowBlur = 8; ctx.shadowColor = "#ffb45e";
        ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, cellSize * 0.05), 0, Math.PI * 2); ctx.fill();
      }

      // 2. Tia kéo năng lượng (Tractor Beam)
      if (progress > 0.1 && progress < 0.85) {
        const beamProgress = (progress - 0.1) / 0.75;
        const beamAlpha = Math.sin(beamProgress * Math.PI); // Mờ dần ở 2 đầu

        ctx.shadowBlur = 0; // Tắt shadow để beam sắc nét
        const grad = ctx.createLinearGradient(cx, cy - cellSize * 0.5, cx, cy + cellSize * 0.2);
        grad.addColorStop(0, `rgba(113, 255, 145, 0)`); // Xanh lá trên đỉnh
        grad.addColorStop(0.5, `rgba(113, 255, 145, ${beamAlpha})`);
        grad.addColorStop(1, `rgba(255, 180, 94, ${beamAlpha})`); // Cam dưới đáy

        ctx.fillStyle = grad;
        // Vẽ hình thang (Trapezoid)
        ctx.beginPath();
        ctx.moveTo(cx - cellSize * 0.1, cy - cellSize * 0.4);
        ctx.lineTo(cx + cellSize * 0.1, cy - cellSize * 0.4);
        ctx.lineTo(cx + cellSize * 0.5, cy + cellSize * 0.2);
        ctx.lineTo(cx - cellSize * 0.5, cy + cellSize * 0.2);
        ctx.closePath();
        ctx.fill();

        // Lõi tia sáng trắng rung lắc
        const jitter = (Math.random() - 0.5) * 2;
        ctx.fillStyle = `rgba(255, 255, 255, ${beamAlpha * 0.8})`;
        ctx.fillRect(cx - 1 + jitter, cy - cellSize * 0.4, 2, cellSize * 0.6);

        // 3. Tinh thể bay lên theo đường xoắn ốc (Spiral Crystals)
        for (let i = 0; i < 8; i++) {
          const spawnTime = 0.1 + (i / 8) * 0.7;
          if (progress > spawnTime) {
            const p = (progress - spawnTime) / (1 - spawnTime); // 0 -> 1
            const startX = cx + (Math.random() - 0.5) * cellSize * 0.8;
            const startY = cy + cellSize * 0.2;
            const endX = cx;
            const endY = cy - cellSize * 0.3;

            // Đường xoắn ốc
            const dir = i % 2 === 0 ? 1 : -1;
            const angle = p * Math.PI * 3 * dir;
            const radius = cellSize * 0.4 * (1 - p); // Bán kính thu nhỏ dần khi lên đỉnh

            const px = startX + (endX - startX) * p + Math.cos(angle) * radius;
            const py = startY + (endY - startY) * p + Math.sin(angle) * radius;

            // Vẽ mảnh tinh thể (hình thoi nhỏ)
            ctx.fillStyle = `rgba(255, 180, 94, ${1 - p})`;
            ctx.shadowBlur = 10; ctx.shadowColor = "#ffb45e";
            ctx.beginPath();
            ctx.moveTo(px, py - cellSize * 0.06);
            ctx.lineTo(px + cellSize * 0.04, py);
            ctx.lineTo(px, py + cellSize * 0.06);
            ctx.lineTo(px - cellSize * 0.04, py);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // 4. Chớp sáng kết thúc (Flash) ở 0.85 -> 1.0
      if (progress > 0.85) {
        const flashAlpha = 1 - (progress - 0.85) / 0.15;
        ctx.fillStyle = `rgba(113, 255, 145, ${flashAlpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 1.5 * (1 - flashAlpha), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (effect.type === "deposit") {
      // ── HIỆU ỨNG NỘP TÀI NGUYÊN: DATA STREAM UPLINK ──
      const fromX = screenX(effect.from.x), fromY = screenY(effect.from.y);
      const toX = screenX(effect.to.x), toY = screenY(effect.to.y);
      ctx.save();

      const beamAlpha = Math.sin(progress * Math.PI); // Mờ dần ở 2 đầu

      // 1. Luồng sáng kết nối
      ctx.strokeStyle = `rgba(121, 215, 255, ${beamAlpha * 0.6})`;
      ctx.lineWidth = Math.max(2, cellSize * 0.1);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      // Lõi sáng trắng
      ctx.strokeStyle = `rgba(255, 255, 255, ${beamAlpha})`;
      ctx.lineWidth = Math.max(1, cellSize * 0.03);
      ctx.stroke();

      // 2. Data Packets bay vào Trái Đất
      if (progress > 0.1 && progress < 0.9) {
        for (let i = 0; i < 6; i++) {
          const p = (progress + i * 0.15) % 1; 
          if (p > progress) continue; // Chỉ hiện những hạt đã đi qua
          const px = fromX + (toX - fromX) * p;
          const py = fromY + (toY - fromY) * p;
          
          ctx.fillStyle = `rgba(113, 255, 145, ${beamAlpha})`;
          ctx.shadowBlur = 8; ctx.shadowColor = "#71ff91";
          // Vẽ ô vuông nhỏ
          ctx.fillRect(px - cellSize * 0.06, py - cellSize * 0.06, cellSize * 0.12, cellSize * 0.12);
        }
      }

      // 3. Sóng xung kích tại Trái Đất (Uplink Rings)
      if (progress > 0.4) {
        const ringProgress = (progress - 0.4) / 0.6;
        for (let i = 0; i < 3; i++) {
          const r = cellSize * (0.5 + i * 0.4) * ringProgress;
          ctx.strokeStyle = `rgba(121, 215, 255, ${(1 - ringProgress) * 0.8})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(toX, toY, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if (effect.type === "recharge") {
      // ── HIỆU ỨNG SẠC PIN: OVERCHARGE SURGE ──
      const cx = screenX(effect.center.x);
      const cy = screenY(effect.center.y);
      ctx.save();

      // 1. Cột sáng năng lượng (Vertical Beam)
      if (progress < 0.8) {
        const pillarAlpha = Math.sin((progress / 0.8) * Math.PI);
        const pillarGrad = ctx.createLinearGradient(cx, cy, cx, cy - cellSize * 2);
        pillarGrad.addColorStop(0, `rgba(255, 215, 0, ${pillarAlpha})`);
        pillarGrad.addColorStop(0.5, `rgba(255, 180, 94, ${pillarAlpha * 0.8})`);
        pillarGrad.addColorStop(1, `rgba(255, 215, 0, 0)`);

        ctx.fillStyle = pillarGrad;
        ctx.beginPath();
        ctx.moveTo(cx - cellSize * 0.3, cy);
        ctx.lineTo(cx + cellSize * 0.3, cy);
        ctx.lineTo(cx + cellSize * 0.1, cy - cellSize * 2);
        ctx.lineTo(cx - cellSize * 0.1, cy - cellSize * 2);
        ctx.closePath();
        ctx.fill();
      }

      // 2. Khiên năng lượng (Pulse Shield) phồng lên/thu nhỏ
      if (progress > 0.2 && progress < 0.9) {
        const shieldP = (progress - 0.2) / 0.7; // 0 -> 1
        const pulseSize = cellSize * (0.8 + Math.sin(shieldP * Math.PI * 4) * 0.2); // Đập nhịp 2 lần
        const shieldAlpha = 1 - shieldP;

        ctx.strokeStyle = `rgba(255, 215, 0, ${shieldAlpha})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 15; ctx.shadowColor = "#ffd700";
        ctx.beginPath();
        ctx.arc(cx, cy, pulseSize, 0, Math.PI * 2);
        ctx.stroke();
        
        // Lớp khiên thứ 2
        ctx.strokeStyle = `rgba(255, 180, 94, ${shieldAlpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseSize * 1.1, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 3. Tia điện (Lightning Arcs) giật xung quanh tàu
      if (progress > 0.1 && progress < 0.85) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10; ctx.shadowColor = "#ffb45e";
        for (let i = 0; i < 4; i++) {
          if (Math.random() > 0.3) continue; // Giật ngẫu nhiên
          const angle = Math.random() * Math.PI * 2;
          const dist = cellSize * (0.4 + Math.random() * 0.4);
          const px = cx + Math.cos(angle) * dist;
          const py = cy + Math.sin(angle) * dist;
          
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          // Vẽ đường ziczac
          ctx.lineTo((cx + px) / 2 + (Math.random() - 0.5) * 10, (cy + py) / 2 + (Math.random() - 0.5) * 10);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
      }

      // 4. Hạt sáng bay lên (Upward Sparks)
      if (progress > 0.2) {
        const sparkP = (progress - 0.2) / 0.8;
        ctx.fillStyle = `rgba(255, 240, 166, ${1 - sparkP})`;
        for (let i = 0; i < 8; i++) {
          const sx = cx + (Math.random() - 0.5) * cellSize * 1.5;
          const sy = cy - sparkP * cellSize * 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1, cellSize * 0.04), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    } else if (effect.type === "direction_pulse") {
      // ═══════════════════════════════════════════════════════════════════
      // MŨI TÊN CHỈ HƯỚNG HOÀNH TRÁNG
      // ═══════════════════════════════════════════════════════════════════
      const cx = screenX(effect.center.x);
      const cy = screenY(effect.center.y);
      const dir = effect.direction;
      const isHostile = effect.hostile;
      const distance = effect.distance;

      // Map 8 hướng -> góc radian (canvas: y tăng xuống)
      const dirAngles = {
        "north":      -Math.PI / 2,
        "north_east": -Math.PI / 4,
        "east":       0,
        "south_east": Math.PI / 4,
        "south":      Math.PI / 2,
        "south_west": 3 * Math.PI / 4,
        "west":       Math.PI,
        "north_west": -3 * Math.PI / 4,
      };

      const primaryColor   = isHostile ? "#ff6565" : "#ffb45e";
      const secondaryColor = isHostile ? "#ffdddd" : "#fff5d0";
      const glowColor      = isHostile ? "#ff2a2a" : "#ffd700";

      ctx.save();

      // ═══ TRƯỜNG HỢP "HERE" (cùng ô) ═══
      if (dir === "here") {
        const baseRgb = isHostile ? "255, 100, 100" : "121, 215, 255";

        // Vòng tròn lan tỏa
        for (let i = 0; i < 3; i++) {
          const ringP = ((progress * 1.6) + i * 0.33) % 1;
          const ringR = cellSize * (0.35 + ringP * 1.6);
          const ringAlpha = (1 - ringP) * (1 - progress * 0.6);
          if (ringAlpha <= 0) continue;

          ctx.strokeStyle = `rgba(${baseRgb}, ${ringAlpha})`;
          ctx.lineWidth = Math.max(1.5, cellSize * 0.09 * (1 - ringP));
          ctx.shadowBlur = 15;
          ctx.shadowColor = isHostile ? "#ff6565" : "#79d7ff";
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Crosshair xoay
        ctx.shadowBlur = 12;
        ctx.shadowColor = isHostile ? "#ff6565" : "#79d7ff";
        ctx.strokeStyle = `rgba(${baseRgb}, 0.9)`;
        ctx.lineWidth = 2.5;
        const crossSize = cellSize * (0.7 + Math.sin(progress * Math.PI) * 0.4);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + progress * Math.PI * 1.2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * crossSize * 0.55, cy + Math.sin(a) * crossSize * 0.55);
          ctx.lineTo(cx + Math.cos(a) * crossSize, cy + Math.sin(a) * crossSize);
          ctx.stroke();
        }

        // Chữ "HERE" nổi lên
        if (progress > 0.25 && progress < 0.92) {
          const tp = (progress - 0.25) / 0.67;
          const textAlpha = Math.sin(tp * Math.PI);
          ctx.shadowBlur = 20;
          ctx.shadowColor = isHostile ? "#ff6565" : "#79d7ff";
          ctx.fillStyle = `rgba(${baseRgb}, ${textAlpha})`;
          ctx.font = `bold ${Math.max(16, cellSize * 0.42)}px Consolas, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("HERE", cx, cy - cellSize * 1.9);
        }

        ctx.restore();
        return;
      }

      // Nếu hướng không xác định → bỏ qua
      if (!dirAngles.hasOwnProperty(dir)) { ctx.restore(); return; }

      const angle     = dirAngles[dir];
      const perpAngle = angle + Math.PI / 2;

      // ═══ PHA 1 (0 → 30%): Tia sáng hội tụ + vòng đồng tâm co lại ═══
      if (progress < 0.32) {
        const p1 = progress / 0.32;

        // Vòng co lại
        for (let i = 0; i < 3; i++) {
          const ringP = Math.max(0, p1 - i * 0.15);
          if (ringP <= 0 || ringP >= 1) continue;
          const r = cellSize * 4.5 * (1 - ringP);
          const alpha = ringP * 0.7;
          ctx.strokeStyle = isHostile
            ? `rgba(255, 101, 101, ${alpha})`
            : `rgba(255, 180, 94, ${alpha})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Tia sáng xiên từ mọi góc hội tụ về hướng
        const spread = Math.PI / 4.5 * (1 - p1);
        for (let i = -3; i <= 3; i++) {
          const a = angle + i * spread;
          const dist = cellSize * 4.5 * (1 - p1);
          const ex = cx + Math.cos(a) * dist;
          const ey = cy + Math.sin(a) * dist;
          const alpha = p1 * 0.85;
          ctx.strokeStyle = isHostile
            ? `rgba(255, 160, 160, ${alpha})`
            : `rgba(255, 230, 160, ${alpha})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(cx + Math.cos(a) * cellSize * 0.4, cy + Math.sin(a) * cellSize * 0.4);
          ctx.stroke();
        }
      }

      // ═══ PHA 2 (15% → 55%): Mũi tên mọc dài ═══
      if (progress > 0.15) {
        const growthP  = Math.min(1, (progress - 0.15) / 0.4);
        const easeP    = 1 - Math.pow(1 - growthP, 3); // easeOutCubic

        const arrowLength = cellSize * 3.4 * easeP;
        const shaftWidth  = cellSize * 0.15;
        const headLength  = cellSize * 0.9 * easeP;
        const headWidth   = cellSize * 0.62 * easeP;

        const startX = cx + Math.cos(angle) * cellSize * 0.4;
        const startY = cy + Math.sin(angle) * cellSize * 0.4;
        const tipX   = startX + Math.cos(angle) * arrowLength;
        const tipY   = startY + Math.sin(angle) * arrowLength;
        const baseX  = tipX - Math.cos(angle) * headLength;
        const baseY  = tipY - Math.sin(angle) * headLength;

        // ── Thân mũi tên (glow ngoài) ──
        ctx.shadowBlur = 28;
        ctx.shadowColor = glowColor;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = shaftWidth * 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(baseX, baseY);
        ctx.stroke();

        // ── Thân mũi tên (lõi sáng) ──
        ctx.shadowBlur = 18;
        ctx.shadowColor = secondaryColor;
        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = shaftWidth * 0.55;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(baseX, baseY);
        ctx.stroke();

        // ── Đầu mũi tên (glow ngoài) ──
        ctx.shadowBlur = 32;
        ctx.shadowColor = glowColor;
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX + Math.cos(perpAngle) * headWidth, baseY + Math.sin(perpAngle) * headWidth);
        ctx.lineTo(baseX - Math.cos(perpAngle) * headWidth, baseY - Math.sin(perpAngle) * headWidth);
        ctx.closePath();
        ctx.fill();

        // ── Đầu mũi tên (lõi sáng) ──
        ctx.shadowBlur = 22;
        ctx.shadowColor = secondaryColor;
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.moveTo(
          tipX - Math.cos(angle) * headLength * 0.18,
          tipY - Math.sin(angle) * headLength * 0.18
        );
        ctx.lineTo(baseX + Math.cos(perpAngle) * headWidth * 0.45, baseY + Math.sin(perpAngle) * headWidth * 0.45);
        ctx.lineTo(baseX - Math.cos(perpAngle) * headWidth * 0.45, baseY - Math.sin(perpAngle) * headWidth * 0.45);
        ctx.closePath();
        ctx.fill();

        // ═══ PHA 3 (40% → 62%): Chớp sáng tại đầu mũi tên ═══
        if (progress > 0.4 && progress < 0.62) {
          const flashP = (progress - 0.4) / 0.22;
          const flashAlpha = Math.sin(flashP * Math.PI);
          const flashR = cellSize * (0.4 + flashP * 1.1);

          ctx.shadowBlur = 45;
          ctx.shadowColor = secondaryColor;
          const flashGrad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, flashR);
          flashGrad.addColorStop(0, isHostile
            ? `rgba(255, 220, 220, ${flashAlpha})`
            : `rgba(255, 255, 230, ${flashAlpha})`);
          flashGrad.addColorStop(1, isHostile
            ? "rgba(255, 100, 100, 0)"
            : "rgba(255, 180, 94, 0)");
          ctx.fillStyle = flashGrad;
          ctx.beginPath();
          ctx.arc(tipX, tipY, flashR, 0, Math.PI * 2);
          ctx.fill();
        }

        // ═══ Hạt particle bay ngược về đuôi ═══
        if (progress > 0.35 && progress < 0.95) {
          const trailProgress = (progress - 0.35) / 0.6;
          const numParticles = 14;
          for (let i = 0; i < numParticles; i++) {
            const spawnOffset = i / numParticles;
            const pp = Math.max(0, trailProgress - spawnOffset * 0.5);
            if (pp <= 0) continue;

            const distAlongArrow = arrowLength * (1 - pp * 0.85);
            const px = startX + Math.cos(angle) * distAlongArrow;
            const py = startY + Math.sin(angle) * distAlongArrow;

            // Dao động vuông góc
            const drift = Math.sin(pp * Math.PI * 3 + i * 1.7) * cellSize * 0.28 * pp;
            const driftX = Math.cos(perpAngle) * drift;
            const driftY = Math.sin(perpAngle) * drift;

            const size = Math.max(1, cellSize * 0.09 * (1 - pp));
            const alpha = (1 - pp) * (1 - Math.max(0, (progress - 0.9) / 0.1));

            ctx.fillStyle = isHostile
              ? `rgba(255, 160, 160, ${alpha})`
              : `rgba(255, 230, 160, ${alpha})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = glowColor;
            ctx.beginPath();
            ctx.arc(px + driftX, py + driftY, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // ═══ PHA 4 (50% → 95%): Nhãn hướng + khoảng cách ═══
        if (progress > 0.5 && progress < 0.95) {
          const tp = (progress - 0.5) / 0.45;
          const textAlpha = Math.sin(tp * Math.PI);

          const dirLabels = {
            "north": "N", "north_east": "NE", "east": "E", "south_east": "SE",
            "south": "S", "south_west": "SW", "west": "W", "north_west": "NW"
          };
          const label = dirLabels[dir] || "?";

          const textX = tipX + Math.cos(angle) * cellSize * 0.75;
          const textY = tipY + Math.sin(angle) * cellSize * 0.75;

          ctx.shadowBlur = 18;
          ctx.shadowColor = glowColor;
          ctx.fillStyle = isHostile
            ? `rgba(255, 225, 225, ${textAlpha})`
            : `rgba(255, 255, 235, ${textAlpha})`;
          ctx.font = `bold ${Math.max(14, cellSize * 0.48)}px Consolas, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, textX, textY);

          // Số khoảng cách (chỉ cho scan_nearest)
          if (!isHostile && distance !== undefined && distance !== null) {
            const distX = tipX + Math.cos(angle) * cellSize * 1.55;
            const distY = tipY + Math.sin(angle) * cellSize * 1.55;

            ctx.shadowBlur = 12;
            ctx.shadowColor = glowColor;
            ctx.fillStyle = `rgba(255, 255, 235, ${textAlpha})`;
            ctx.font = `bold ${Math.max(10, cellSize * 0.3)}px Consolas, monospace`;
            ctx.fillText(`${distance}`, distX, distY);
          }
        }

        // ═══ Cung tròn tại gốc (định vị hướng) ═══
        if (progress > 0.25) {
          const arcP = Math.min(1, (progress - 0.25) / 0.4);
          const arcAlpha = (1 - arcP) * 0.75;

          ctx.shadowBlur = 16;
          ctx.shadowColor = glowColor;
          ctx.strokeStyle = isHostile
            ? `rgba(255, 160, 160, ${arcAlpha})`
            : `rgba(255, 230, 160, ${arcAlpha})`;
          ctx.lineWidth = 2.2;

          for (let i = 0; i < 2; i++) {
            const spread = Math.PI / 5.5;
            const arcStart = angle - spread - i * 0.18;
            const arcEnd   = angle + spread + i * 0.18;
            const arcR = cellSize * (1.0 + i * 0.55) * arcP;
            ctx.beginPath();
            ctx.arc(cx, cy, arcR, arcStart, arcEnd);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPATIAL CACHE (OPTIMIZATION)
// ═══════════════════════════════════════════════════════════════════════════

function buildSpatialCache(view) {
  const map = new Map();
  const add = (pos, type, obj) => {
    if (!pos) return;
    const key = `${pos.x},${pos.y}`;
    let entry = map.get(key);
    if (!entry) { entry = {}; map.set(key, entry); }
    if (!entry[type]) entry[type] = obj;
  };
  for (const p of view.knownPlanets || []) add(p.position, "planet", p);
  for (const w of view.knownWormholes || []) add(w.pos, "wormhole", w);
  for (const c of view.crates || []) add(c.pos, "crate", c);
  for (const m of view.monoliths || []) add(m.pos, "monolith", m);
  for (const b of view.beacons || []) add(b.pos, "beacon", b);
  return map;
}

function getSpatialCache(view) {
  if (view === cachedViewRef && cachedSpatial) return cachedSpatial;
  cachedSpatial = buildSpatialCache(view);
  cachedViewRef = view;
  return cachedSpatial;
}

function getZoneMap(zones) {
  if (zones === cachedZonesRef && cachedZoneMap) return cachedZoneMap;
  const map = new Map();
  for (const z of zones || []) {
    const halfW = z.shape === "circle" ? z.radius : Math.floor((z.width || 0) / 2);
    const halfH = z.shape === "circle" ? z.radius : Math.floor((z.height || 0) / 2);
    const minX = Math.max(0, z.pos.x - halfW);
    const maxX = Math.min(99, z.pos.x + halfW);
    const minY = Math.max(0, z.pos.y - halfH);
    const maxY = Math.min(99, z.pos.y + halfH);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = Math.abs(x - z.pos.x), dy = Math.abs(y - z.pos.y);
        const inside = z.shape === "circle"
          ? (dx + dy <= z.radius)
          : (dx <= (z.width || 0) / 2 && dy <= (z.height || 0) / 2);
        if (inside) {
          const key = `${x},${y}`;
          if (!map.has(key)) map.set(key, z);
        }
      }
    }
  }
  cachedZonesRef = zones;
  cachedZoneMap = map;
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════
// TACTICAL MAP (với spatial cache)
// ═══════════════════════════════════════════════════════════════════════════

 
function drawTacticalMap() {
  // ═══ Early return nếu không còn ở game screen hoặc tab bị ẩn ═══
  if (currentScreen !== "game" || document.hidden) {
    if (effectFrame) {
      cancelAnimationFrame(effectFrame);
      effectFrame = 0;
    }
    return;
  }

  const canvas = canvasWithListeners || root.querySelector("#tactical-canvas");
  if (!canvas) return;

  const now = performance.now();

  // ═══ THROTTLE 90fps: màn 144Hz/165Hz không vẽ vô ích ═══
  // Frame < 11ms → skip, giữ mượt 60-90fps ổn định
  if (now - lastGlyphDrawAt < 11 && activeEffects.length === 0 && !pendingHoverRedraw && !cameraAnimFrame) {
    if (!effectFrame) {
      effectFrame = window.requestAnimationFrame(() => {
        effectFrame = 0;
        drawTacticalMap();
      });
    }
    return;
  }
  lastGlyphDrawAt = now;

  // ═══ KHÔNG clear activeEffects ở đây nữa ═══
  // Việc có push effect hay không đã do startActionEffects quyết định.
  // Nếu clear ở đây, effect vừa push sẽ bị xoá ngay frame đầu → mất animation.
  activeEffects = activeEffects.filter((effect) => now - effect.startedAt < effect.duration);
  const isMoving = activeEffects.some((effect) => effect.type === "move" || effect.type === "teleport");
  
  // ═══ TỐI ƯU: Tính t và pulse 1 lần cho toàn bộ frame thay vì từng ô ═══
  const t = now / 1000;
  const globalPulse = 0.5 + Math.sin(t * 2) * 0.15;
  
  const { context: ctx, width, height } = canvasContext(canvas);  
  const view = playerView;
  if (!view) return;

  // ═══ Build cache 1 lần cho cả frame ═══
  const spatial = getSpatialCache(view);
  const zoneMap = getZoneMap(view.zones);

  const cellSize = Math.min(width, height) / 9 * camera.zoom;
  const screenX = (x) => width / 2 + (x - camera.x) * cellSize;
  const screenY = (y) => height / 2 + (y - camera.y) * cellSize;
  const minX = Math.floor(camera.x - width / (2 * cellSize)) - 1;
  const maxX = Math.ceil(camera.x + width / (2 * cellSize)) + 1;
  const minY = Math.floor(camera.y - height / (2 * cellSize)) - 1;
  const maxY = Math.ceil(camera.y + height / (2 * cellSize)) + 1;

  // ═══ Tối ưu: pre-calc screen coords 1 lần cho mỗi frame ═══
  const screenXs = new Array(maxX - minX + 1);
  const screenYs = new Array(maxY - minY + 1);
  for (let x = minX; x <= maxX; x++) screenXs[x - minX] = screenX(x);
  for (let y = minY; y <= maxY; y++) screenYs[y - minY] = screenY(y);

  // 1. Nền gradient
  const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height));
  bgGrad.addColorStop(0, "#0a1e14");
  bgGrad.addColorStop(1, "#040a06");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Vẽ lưới (Tối ưu bằng cách vẽ đường kẻ, không dùng cache)
  // Tô đen vùng ngoài map
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || x > 99 || y < 0 || y > 99) {
        const left = screenXs[x - minX] - cellSize / 2;
        const top = screenYs[y - minY] - cellSize / 2;
        ctx.fillRect(left, top, cellSize, cellSize);
        ctx.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }
  }

  // Vẽ lưới trong map bằng đường kẻ (cực nhanh)
  ctx.strokeStyle = "rgba(63, 191, 107, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gMinX = Math.max(0, minX);
  const gMaxX = Math.min(99, maxX);
  const gMinY = Math.max(0, minY);
  const gMaxY = Math.min(99, maxY);

  for (let x = gMinX; x <= gMaxX + 1; x++) {
    const left = screenXs[Math.min(x, maxX) - minX] - cellSize / 2;
    ctx.moveTo(left, screenYs[gMinY - minY] - cellSize / 2);
    ctx.lineTo(left, screenYs[gMaxY - minY] + cellSize / 2);
  }
  for (let y = gMinY; y <= gMaxY + 1; y++) {
    const top = screenYs[Math.min(y, maxY) - minY] - cellSize / 2;
    ctx.moveTo(screenXs[gMinX - minX] - cellSize / 2, top);
    ctx.lineTo(screenXs[gMaxX - minX] + cellSize / 2, top);
  }
  ctx.stroke();

  // 3. Object & Zones
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (x < 0 || x > 99 || y < 0 || y > 99) continue;
      
      const left = screenXs[x - minX] - cellSize / 2;
      const top = screenYs[y - minY] - cellSize / 2;
      const centerX = screenXs[x - minX];
      const centerY = screenYs[y - minY];

      // 3. Zone - O(1) từ cache
      const zone = zoneMap.get(`${x},${y}`);


            if (zone) {
        ctx.save();

        // ═══ TỐI ƯU: Dùng thời gian t để tạo dao động mượt mà ═══
        const wave = Math.sin(now / 300 + x * 0.5 + y * 0.5); 

        if (zone.type === "jamming") {
          // Nhiễu sóng: Nhấp nháy ngẫu nhiên (Glitch)
          const glitch = Math.sin(now / 80 + x * 73 + y * 37) > 0.8 ? 0.15 : 0;
          ctx.fillStyle = `rgba(180, 80, 220, ${0.25 + glitch})`;
          ctx.fillRect(left, top, cellSize, cellSize);

          // Tia chéo chuyển động
          ctx.strokeStyle = `rgba(230, 150, 255, ${0.15 + Math.abs(wave) * 0.15})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left, top + cellSize);
          ctx.lineTo(left + cellSize, top);
          ctx.stroke();
          
          // Các hạt nhiễu
          const noiseSeed = (x * 73 + y * 37) % 100;
          if (noiseSeed < 40) {
            ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.abs(wave) * 0.5})`;
            const nx = left + (noiseSeed % 7) / 7 * cellSize;
            const ny = top + ((noiseSeed * 3) % 7) / 7 * cellSize;
            ctx.fillRect(nx, ny, Math.max(1, cellSize * 0.05), Math.max(1, cellSize * 0.05));
          }
        } 
        else if (zone.type === "radiation") {
          // Phóng xạ: Sóng lan truyền từ tâm tỏa ra
          const dx = Math.abs(x - zone.pos.x);
          const dy = Math.abs(y - zone.pos.y);
          const dist = dx + dy;
          
          // Tạo sóng lan truyền (chạy vòng lặp liên tục)
          const pulse = Math.sin(dist * 0.6 - now / 200) * 0.5 + 0.5; 
          ctx.fillStyle = `rgba(120, 220, 80, ${0.1 + pulse * 0.2})`;
          ctx.fillRect(left, top, cellSize, cellSize);

          // Chớp sáng ở các giao điểm
          if ((x + y) % 5 === 0) {
            ctx.fillStyle = `rgba(200, 255, 140, ${0.3 + pulse * 0.4})`;
            ctx.beginPath();
            ctx.arc(centerX, centerY, Math.max(1, cellSize * 0.06), 0, Math.PI * 2);
            ctx.fill();
          }
        } 
        else if (zone.type === "zero_g") {
          // Không trọng lực: Các ngôi sao trôi bồng bềnh
          const drift = Math.sin(now / 1000 + x * 0.5) * 0.1;
          ctx.fillStyle = `rgba(150, 200, 255, ${0.12 + drift})`;
          ctx.fillRect(left, top, cellSize, cellSize);

          // Sao lấp lánh
          if ((x * 31 + y * 17) % 4 === 0) {
            const twinkle = Math.sin(now / 400 + x * 3 + y * 5) * 0.5 + 0.5;
            const sx = left + ((x * 13) % 100) / 100 * cellSize;
            const sy = top + ((y * 23) % 100) / 100 * cellSize;
            
            ctx.fillStyle = `rgba(200, 230, 255, ${0.3 + twinkle * 0.6})`;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1, cellSize * 0.045), 0, Math.PI * 2);
            ctx.fill();
            
            // Tia sáng hình chữ thập
            ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + twinkle * 0.4})`;
            ctx.fillRect(sx - Math.max(2, cellSize * 0.1), sy, Math.max(4, cellSize * 0.2), 1);
            ctx.fillRect(sx, sy - Math.max(2, cellSize * 0.1), 1, Math.max(4, cellSize * 0.2));
          }
        } 
        else if (zone.type === "swamp") {
          // Đầm lầy: Bong bóng sủi bọt
          const bubble = Math.sin(now / 500 + x * 2 + y * 3);
          ctx.fillStyle = `rgba(50, 150, 50, ${0.25 + bubble * 0.05})`;
          ctx.fillRect(left, top, cellSize, cellSize);

          if ((x * 19 + y * 23) % 4 === 0) {
            const bx = left + (0.3 + ((x * 13) % 40) / 100) * cellSize;
            const by = top + (0.3 + ((y * 17) % 40) / 100) * cellSize;
            
            // Bong bóng phồng lên xẹp xuống
            const size = Math.max(2, cellSize * 0.12) + Math.max(0, bubble) * cellSize * 0.05;
            
            ctx.fillStyle = "rgba(20, 75, 20, 0.5)";
            ctx.beginPath();
            ctx.arc(bx, by, size, 0, Math.PI * 2);
            ctx.fill();

            // Viền bong bóng
            ctx.strokeStyle = `rgba(140, 220, 140, ${0.2 + Math.max(0, bubble) * 0.3})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(bx, by, size * 1.2, 0, Math.PI * 2);
            ctx.stroke();
          }
        } 
        else if (zone.type === "gold_rush") {
          // Kinh tế: Lấp lánh (Twinkle)
          const twinkle = Math.sin(now / 200 + x * 10 + y * 20);
          ctx.fillStyle = `rgba(255, 215, 0, ${0.2 + twinkle * 0.08})`;
          ctx.fillRect(left, top, cellSize, cellSize);

          if ((x * 31 + y * 17) % 4 === 0) {
            const gx = centerX + (((x * 7) % 3) - 1) * cellSize * 0.18;
            const gy = centerY + (((y * 11) % 3) - 1) * cellSize * 0.18;
            const r = Math.max(2.5, cellSize * 0.08) * (1 + twinkle * 0.2);
            
            ctx.fillStyle = `rgba(255, 255, 220, ${0.6 + twinkle * 0.4})`;
            ctx.beginPath();
            ctx.moveTo(gx, gy - r);
            ctx.lineTo(gx + r * 0.6, gy);
            ctx.lineTo(gx, gy + r);
            ctx.lineTo(gx - r * 0.6, gy);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Viền zone - Cũng nhấp nháy nhẹ theo nhịp thở
        const inZoneAt = (px, py) => {
          const zdx = Math.abs(px - zone.pos.x), zdy = Math.abs(py - zone.pos.y);
          if (zone.shape === "circle") return zdx + zdy <= zone.radius;
          if (zone.shape === "rect") return zdx <= zone.width / 2 && zdy <= zone.height / 2;
          return false;
        };
        const edgeColorMap = {
          jamming: "#d1a8ff", radiation: "#a7f36b",
          zero_g: "#8bc3ff", swamp: "#79b87c", gold_rush: "#ffd700"
        };
        const edgeColor = edgeColorMap[zone.type] || "#ffffff";
        ctx.strokeStyle = edgeColor;
        
        // Thay vì cố định 0.85, cho nó dao động từ 0.6 đến 0.9
        ctx.globalAlpha = 0.75 + Math.sin(now / 400 + zone.pos.x) * 0.15; 
        
        ctx.lineWidth = Math.max(1.5, cellSize * 0.06);
        ctx.beginPath();
        if (!inZoneAt(x, y - 1)) { ctx.moveTo(left, top); ctx.lineTo(left + cellSize, top); }
        if (!inZoneAt(x, y + 1)) { ctx.moveTo(left, top + cellSize); ctx.lineTo(left + cellSize, top + cellSize); }
        if (!inZoneAt(x - 1, y)) { ctx.moveTo(left, top); ctx.lineTo(left, top + cellSize); }
        if (!inZoneAt(x + 1, y)) { ctx.moveTo(left + cellSize, top); ctx.lineTo(left + cellSize, top + cellSize); }
        ctx.stroke();
        ctx.restore();
      }

      const isShip = x === view.player.position.x && y === view.player.position.y;
      const isEarth = x === view.earth.x && y === view.earth.y;

      // ═══ O(1) lookup ═══
      const objs = spatial.get(`${x},${y}`);
      const planet   = objs?.planet;
      const wormhole = objs?.wormhole;
      const crate    = objs?.crate;
      const monolith = objs?.monolith;
      const beacon   = objs?.beacon;

      if (isEarth)   drawMapGlyph(ctx, "earth",    centerX, centerY, cellSize, now);
      if (planet)    drawMapGlyph(ctx, planet.type, centerX, centerY, cellSize, now);
      if (wormhole)  drawMapGlyph(ctx, "wormhole", centerX, centerY, cellSize, now);
      if (crate)     drawMapGlyph(ctx, "crate",    centerX, centerY, cellSize, now);
      if (monolith)  drawMapGlyph(ctx, "monolith", centerX, centerY, cellSize, now);
      if (beacon)    drawMapGlyph(ctx, "beacon",   centerX, centerY, cellSize, now);
      if (isShip && !isMoving) drawMapGlyph(ctx, "ship", centerX, centerY, cellSize, now);

      const isSelected = selectedCell?.x === x && selectedCell?.y === y;
      const isHovered = hoverCell?.x === x && hoverCell?.y === y;
      if (isHovered || isSelected) {
        ctx.save();
        if (isSelected) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#fff0a6";
          ctx.strokeStyle = "#fff0a6";
          ctx.lineWidth = 2.5;
        } else {
          ctx.strokeStyle = "rgba(255, 180, 94, 0.6)";
          ctx.lineWidth = 1.5;
        }
        const inset = Math.max(2, cellSize * 0.05);
        ctx.strokeRect(left + inset, top + inset, cellSize - inset * 2, cellSize - inset * 2);
        ctx.restore();
      }
    }
  }

  drawFeedbackEffects(ctx, width, height, cellSize, screenX, screenY, now);

  ctx.fillStyle = "rgba(113, 255, 145, 0.6)";
  ctx.font = "11px Consolas, monospace";
  ctx.textAlign = "right";
  ctx.fillText("X →", width - 15, 20);
  ctx.textAlign = "left";
  ctx.fillText("Y ↓", 15, height - 15);
  ctx.fillStyle = "rgba(139, 164, 147, 0.85)";
  ctx.fillText(`SYS: ${Math.round(camera.x)}, ${Math.round(camera.y)}  |  ZOOM: ${camera.zoom.toFixed(1)}×`, 15, 20);

  // ═══ Loop liên tục khi ở game screen → glyph luôn animate ═══
  if (currentScreen === "game" && !document.hidden && !effectFrame) {
    effectFrame = window.requestAnimationFrame(() => {
      effectFrame = 0;
      drawTacticalMap();
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SMOOTH CAMERA ANIMATION
// ═══════════════════════════════════════════════════════════════════════════

function cancelCameraAnimation() {
  if (cameraAnimFrame) {
    cancelAnimationFrame(cameraAnimFrame);
    cameraAnimFrame = 0;
  }
}

function smoothResetCamera(targetZoom = 1) {
  cancelCameraAnimation();
  if (!playerView?.player?.position) return;

  const endX = playerView.player.position.x;
  const endY = playerView.player.position.y;
  const endZoom = targetZoom;

  const startX = camera.x;
  const startY = camera.y;
  const startZoom = camera.zoom;

  // Đã đúng vị trí → vẽ lại luôn, không cần animate
  if (Math.abs(startX - endX) < 0.01
      && Math.abs(startY - endY) < 0.01
      && Math.abs(startZoom - endZoom) < 0.01) {
    camera.x = endX;
    camera.y = endY;
    camera.zoom = endZoom;
    drawTacticalMap();
    return;
  }

  const duration = 750;
  const startedAt = performance.now();
  // easeInOutQuint: cực mượt — chậm rãi → tăng tốc → chậm dần settle
  const easeInOutQuint = (t) => t < 0.5
    ? 16 * t * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 5) / 2;

  const step = (now) => {
    const elapsed = now - startedAt;
    const t = Math.min(1, elapsed / duration);
    const eased = easeInOutQuint(t);

    camera.x = startX + (endX - startX) * eased;
    camera.y = startY + (endY - startY) * eased;
    camera.zoom = startZoom + (endZoom - startZoom) * eased;

    // Tránh vẽ trùng nếu effect/hover rAF đang chờ sẵn
    if (!effectFrame && !pendingHoverRedraw) {
      drawTacticalMap();
    }

    if (t < 1) {
      cameraAnimFrame = requestAnimationFrame(step);
    } else {
      cameraAnimFrame = 0;
      camera.x = endX;
      camera.y = endY;
      camera.zoom = endZoom;
      drawTacticalMap();
    }
  };

  cameraAnimFrame = requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTOR OVERVIEW (minimal — vẽ toàn map với fog of war)
// ═══════════════════════════════════════════════════════════════════════════  

function drawSectorOverview() {
  const canvas = root.querySelector("#overview-canvas");
  if (!canvas || !playerView) return;
  const ctx = canvas.getContext("2d");
  const size = Math.min(canvas.clientWidth, canvas.clientHeight) || 600;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cellSize = size / 100;

  // Background nền tối
  ctx.fillStyle = "#07100b";
  ctx.fillRect(0, 0, size, size);

  // ═══ 1. VẼ CÁC VÙNG KHÔNG GIAN (ZONES) DƯỚI CÙNG ═══
  for (const zone of playerView.zones || []) {
    ctx.save();
    let color = "";
    if (zone.type === "jamming") color = "180, 80, 220";
    else if (zone.type === "radiation") color = "120, 220, 80";
    else if (zone.type === "zero_g") color = "150, 200, 255";
    else if (zone.type === "swamp") color = "50, 150, 50";
    else if (zone.type === "gold_rush") color = "255, 215, 0";

    if (color) {
      ctx.fillStyle = `rgba(${color}, 0.15)`;
      ctx.strokeStyle = `rgba(${color}, 0.6)`;
      ctx.lineWidth = 1.5;

      if (zone.shape === "circle") {
        ctx.beginPath();
        ctx.arc(zone.pos.x * cellSize, zone.pos.y * cellSize, zone.radius * cellSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (zone.shape === "rect") {
        const w = zone.width * cellSize;
        const h = zone.height * cellSize;
        const x = (zone.pos.x * cellSize) - (w / 2);
        const y = (zone.pos.y * cellSize) - (h / 2);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    }
    ctx.restore();
  }

  // ═══ 2. LƯỚI TỌA ĐỘ (GRID) ═══
  ctx.strokeStyle = "rgba(63, 191, 107, 0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 100; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellSize);
    ctx.lineTo(size, i * cellSize);
    ctx.stroke();
  }

  // ═══ 3. HÒM TIẾP TẾ (CRATES) ═══
  for (const c of playerView.crates || []) {
    const cx = c.pos.x * cellSize;
    const cy = c.pos.y * cellSize;
    const s = Math.max(4, cellSize * 1.6);
    ctx.fillStyle = "#ffd700";
    ctx.strokeStyle = "#2a1a0a";
    ctx.lineWidth = 1.5;
    ctx.fillRect(cx - s/2, cy - s/2, s, s);
    ctx.strokeRect(cx - s/2, cy - s/2, s, s);
  }

  // ═══ 4. BIA ĐÁ CỔ ĐẠI (MONOLITHS) ═══
  for (const m of playerView.monoliths || []) {
    const cx = m.pos.x * cellSize;
    const cy = m.pos.y * cellSize;
    const r = Math.max(4, cellSize * 1.4);
    ctx.fillStyle = "#1a1124";
    ctx.strokeStyle = "#d1a8ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.8, cy + r * 0.8);
    ctx.lineTo(cx - r * 0.8, cy + r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ═══ 5. HẢI ĐĂNG KHÔNG GIAN (BEACONS) ═══
  for (const b of playerView.beacons || []) {
    const cx = b.pos.x * cellSize;
    const cy = b.pos.y * cellSize;
    const r = Math.max(4, cellSize * 1.4);
    ctx.fillStyle = b.active ? "#ffd700" : "#8a6d00";
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ═══ 6. CỔNG KHÔNG GIAN (WORMHOLES) ═══
  for (const wh of playerView.knownWormholes || []) {
    const wx = wh.pos.x * cellSize;
    const wy = wh.pos.y * cellSize;
    const r = Math.max(3, cellSize * 1.2);
    ctx.strokeStyle = "#79d7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Lõi đen
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(wx, wy, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ═══ 7. HÀNH TINH (PLANETS) PHÂN BIỆT THEO LOẠI ═══
  for (const planet of playerView.knownPlanets || []) {
    const px = planet.position.x * cellSize;
    const py = planet.position.y * cellSize;
    const r = Math.max(4, cellSize * 1.5);

    if (planet.type === "Mining") {
      ctx.fillStyle = "#ffb45e";
      ctx.strokeStyle = "#c9823b";
    } else if (planet.type === "Energy") {
      ctx.fillStyle = "#79d7ff";
      ctx.strokeStyle = "#1a5a99";
    } else if (planet.type === "Rare") {
      ctx.fillStyle = "#ff76dc";
      ctx.strokeStyle = "#d1a8ff";
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#888888";
    }

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ═══ 8. TRÁI ĐẤT (EARTH) ═══
  const earthX = playerView.earth.x * cellSize;
  const earthY = playerView.earth.y * cellSize;
  const earthR = Math.max(5, cellSize * 2);
  ctx.fillStyle = "#4fafff";
  ctx.beginPath();
  ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ═══ 9. TÀU NGƯỜI CHƠI (SHIP) - LÀM NỔI BẬT ═══
  const shipX = playerView.player.position.x * cellSize;
  const shipY = playerView.player.position.y * cellSize;
  
  // Vòng highlight nét đứt
  ctx.strokeStyle = "#71ff91";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(shipX, shipY, cellSize * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]); // Reset lại nét liền

  // Chấm tâm tàu phát sáng
  ctx.fillStyle = "#71ff91";
  ctx.shadowBlur = 15;
  ctx.shadowColor = "#71ff91";
  ctx.beginPath();
  ctx.arc(shipX, shipY, Math.max(4, cellSize * 1.8), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0; // Tắt glow cho chữ

  // Nhãn "TÀU CỦA BẠN"
  const text = "TÀU CỦA BẠN";
  ctx.font = `bold ${Math.max(10, cellSize * 2)}px Consolas, monospace`;
  ctx.textAlign = "center";
  
  // Thông minh đẩy chữ lên trên hoặc xuống dưới nếu tàu ở sát mép
  let textY = shipY - cellSize * 3;
  let textBaseline = "bottom";
  if (shipY < cellSize * 10) {
    textY = shipY + cellSize * 4;
    textBaseline = "top";
  }
  ctx.textBaseline = textBaseline;
  
  // Vẽ nền đen trong suốt đằng sau chữ cho dễ đọc
  const textWidth = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  const pad = 4;
  const textHeight = Math.max(12, cellSize * 2);
  const bgY = textBaseline === "bottom" ? textY - textHeight : textY;
  ctx.fillRect(shipX - textWidth/2 - pad, bgY - pad, textWidth + pad*2, textHeight + pad*2);
  
  // Vẽ chữ
  ctx.fillStyle = "#71ff91";
  ctx.fillText(text, shipX, textY);
}

function drawMapGlyph(ctx, kind, x, y, cellSize, time = 0) {
  const radius = Math.max(8, Math.min(18, cellSize * 0.38));
  const t = time / 1000; // ▼▼ THÊM DÒNG NÀY ▼▼
  ctx.save();
// Giảm blur tối đa để đỡ lag, hoặc tắt luôn nếu máy yếu
const applyGlow = (color, blur = 4) => { ctx.shadowBlur = blur; ctx.shadowColor = color; };  if (kind === "ship") {
    // ── TÀU: mũi tên + động cơ phụt lửa + buồng lái
    const pulse = Math.sin(time / 150) * 0.15 + 0.85;
    
    // Động cơ phụt lửa (2 bên đuôi)
    applyGlow("#ffb45e", 20);
    ctx.fillStyle = `rgba(255, 180, 94, ${0.6 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.5, y + radius * 0.6);
    ctx.lineTo(x - radius * 0.3, y + radius * 1.4 * pulse);
    ctx.lineTo(x - radius * 0.7, y + radius * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + radius * 0.5, y + radius * 0.6);
    ctx.lineTo(x + radius * 0.3, y + radius * 1.4 * pulse);
    ctx.lineTo(x + radius * 0.7, y + radius * 0.7);
    ctx.closePath(); ctx.fill();

    // Thân tàu chính
    applyGlow("#71ff91", 18);
    ctx.fillStyle = "#71ff91";
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.75, y + radius * 0.7);
    ctx.lineTo(x, y + radius * 0.3);
    ctx.lineTo(x - radius * 0.75, y + radius * 0.7);
    ctx.closePath(); ctx.fill();
    
    // Viền sáng
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#a8ffba";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Buồng lái (cockpit) hình thoi trắng
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x, y - radius * 0.15, radius * 0.18, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Lõi xanh phát sáng
    applyGlow("#00ffcc", 25);
    ctx.fillStyle = "#00ffcc";
    ctx.beginPath();
    ctx.arc(x, y + radius * 0.1, radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
    
  } else if (kind === "earth") {
    // ── TRÁI ĐẤT: khí quyển + lục địa + mây + quỹ đạo
    // Khí quyển phát sáng
    applyGlow("#4fafff", 25);
    ctx.fillStyle = "rgba(79, 175, 255, 0.3)";
    ctx.beginPath(); ctx.arc(x, y, radius * 0.95, 0, Math.PI * 2); ctx.fill();
    
    // Lõi trái đất (xanh dương)
    ctx.shadowBlur = 0;
    const earthGrad = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius * 0.75);
    earthGrad.addColorStop(0, "#5fc9ff");
    earthGrad.addColorStop(1, "#1a5a99");
    ctx.fillStyle = earthGrad;
    ctx.beginPath(); ctx.arc(x, y, radius * 0.75, 0, Math.PI * 2); ctx.fill();
    
    // Lục địa (xanh lá) - dùng path ngẫu nhiên
    ctx.fillStyle = "rgba(113, 255, 145, 0.7)";
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.2, y - radius * 0.15, radius * 0.28, radius * 0.18, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + radius * 0.25, y + radius * 0.1, radius * 0.22, radius * 0.15, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.05, y + radius * 0.35, radius * 0.15, radius * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Mây trắng mờ
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.ellipse(x + radius * 0.1, y - radius * 0.35, radius * 0.3, radius * 0.08, 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Quỹ đạo elip phát sáng
    applyGlow("#ffb45e", 15);
    ctx.strokeStyle = "rgba(255, 180, 94, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.15, radius * 0.35, Math.PI / 6, 0, Math.PI * 2);
    ctx.stroke();
    
    // Vệ tinh nhỏ trên quỹ đạo
    const satAngle = (time / 2000) % (Math.PI * 2);
    const satX = x + Math.cos(satAngle) * radius * 1.15 * Math.cos(Math.PI/6) - Math.sin(satAngle) * radius * 0.35 * Math.sin(Math.PI/6);
    const satY = y + Math.cos(satAngle) * radius * 1.15 * Math.sin(Math.PI/6) + Math.sin(satAngle) * radius * 0.35 * Math.cos(Math.PI/6);
    applyGlow("#ffffff", 10);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(satX, satY, 1.8, 0, Math.PI * 2); ctx.fill();
    
  } else if (kind === "Mining") {
    // ── HÀNH TINH KHAI THÁC: đá có miệng núi lửa + mạch khoáng
    applyGlow("#ffb45e", 18);
    
    // Nền đá nâu-cam
    const rockGrad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius * 0.85);
    rockGrad.addColorStop(0, "#ffcc5f");
    rockGrad.addColorStop(0.5, "#c9823b");
    rockGrad.addColorStop(1, "#5a3a1a");
    ctx.fillStyle = rockGrad;
    ctx.beginPath(); ctx.arc(x, y, radius * 0.85, 0, Math.PI * 2); ctx.fill();
    
    // Miệng núi lửa (craters)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(42, 26, 10, 0.7)";
    ctx.beginPath(); ctx.arc(x - radius * 0.3, y - radius * 0.2, radius * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + radius * 0.25, y + radius * 0.3, radius * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + radius * 0.15, y - radius * 0.4, radius * 0.1, 0, Math.PI * 2); ctx.fill();
    
    // Mạch khoáng phát sáng (đường nứt)
    applyGlow("#ffcc5f", 8);
    ctx.strokeStyle = "rgba(255, 204, 95, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.6, y + radius * 0.4);
    ctx.lineTo(x - radius * 0.2, y + radius * 0.1);
    ctx.lineTo(x + radius * 0.1, y + radius * 0.3);
    ctx.lineTo(x + radius * 0.5, y - radius * 0.1);
    ctx.stroke();
    
  } else if (kind === "Energy") {
    // ── HÀNH TINH NĂNG LƯỢNG: plasma lõi + tia điện
    const pulse = Math.sin(time / 300) * 0.2 + 0.8;
    
    // Quầng năng lượng
    applyGlow("#79d7ff", 25);
    ctx.fillStyle = `rgba(121, 215, 255, ${0.2 * pulse})`;
    ctx.beginPath(); ctx.arc(x, y, radius * 1.05, 0, Math.PI * 2); ctx.fill();
    
    // Lõi plasma (gradient sáng)
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#79d7ff";
    const plasmaGrad = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.7);
    plasmaGrad.addColorStop(0, "#ffffff");
    plasmaGrad.addColorStop(0.3, "#a0e6ff");
    plasmaGrad.addColorStop(1, "#1a5a99");
    ctx.fillStyle = plasmaGrad;
    ctx.beginPath(); ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2); ctx.fill();
    
    // Lục giác viền ngoài
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#79d7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 3 * i - Math.PI / 2;
      const px = x + Math.cos(angle) * radius * 0.9;
      const py = y + Math.sin(angle) * radius * 0.9;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    
    // Tia sét xoay quanh
    ctx.shadowBlur = 15;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    const sparkAngle = (time / 400) % (Math.PI * 2);
    for (let i = 0; i < 3; i++) {
      const a = sparkAngle + (i * Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * radius * 0.7, y + Math.sin(a) * radius * 0.7);
      ctx.lineTo(x + Math.cos(a + 0.3) * radius * 0.9, y + Math.sin(a + 0.3) * radius * 0.9);
      ctx.stroke();
    }
    
  } else if (kind === "Rare") {
    // ── HÀNH TINH HIẾM: tinh thể đa sắc + tia sáng
    const pulse = Math.sin(time / 400) * 0.3 + 0.7;
    const rotation = (time / 3000) % (Math.PI * 2);
    
    // Quầng sáng hồng
    applyGlow("#ff76dc", 30);
    ctx.fillStyle = `rgba(255, 118, 220, ${0.15 * pulse})`;
    ctx.beginPath(); ctx.arc(x, y, radius * 1.2, 0, Math.PI * 2); ctx.fill();
    
    // Tinh thể chính (hình thoi lấp lánh)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Gradient cầu vồng
    const crystalGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
    crystalGrad.addColorStop(0, "#ff76dc");
    crystalGrad.addColorStop(0.5, "#d1a8ff");
    crystalGrad.addColorStop(1, "#79d7ff");
    ctx.fillStyle = crystalGrad;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#ff76dc";
    
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.9);
    ctx.lineTo(radius * 0.6, 0);
    ctx.lineTo(0, radius * 0.9);
    ctx.lineTo(-radius * 0.6, 0);
    ctx.closePath(); ctx.fill();
    
    // Viền tinh thể
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Các tia sáng xung quanh (star sparkles)
    ctx.restore();
    applyGlow("#ffffff", 12);
    ctx.fillStyle = "#ffffff";
    const sparkleAngle = (time / 500) % (Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const a = sparkleAngle + (i * Math.PI / 2);
      const dist = radius * (1.1 + Math.sin(time / 200 + i) * 0.15);
      const sx = x + Math.cos(a) * dist;
      const sy = y + Math.sin(a) * dist;
      // Vẽ ngôi sao 4 cánh nhỏ
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3);
      ctx.lineTo(sx + 1, sy);
      ctx.lineTo(sx, sy + 3);
      ctx.lineTo(sx - 1, sy);
      ctx.closePath(); ctx.fill();
    }
    
  } else if (kind === "wormhole") {
    // ── CỔNG KHÔNG GIAN: nhiều lớp xoáy + hạt sáng bay vào
    const rotOffset = (time / 800) % (Math.PI * 2);
    
    // Quầng sáng lớn
    applyGlow("#79d7ff", 30);
    ctx.fillStyle = "rgba(121, 215, 255, 0.15)";
    ctx.beginPath(); ctx.arc(x, y, radius * 1.2, 0, Math.PI * 2); ctx.fill();
    
    // Lõi đen (hố đen mini)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000000";
    ctx.beginPath(); ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2); ctx.fill();
    
    // 4 lớp xoáy ốc
    for (let layer = 0; layer < 4; layer++) {
      const layerRadius = radius * (0.35 + layer * 0.2);
      const layerRotation = rotOffset + (layer * Math.PI / 4);
      const alpha = 1 - layer * 0.18;
      
      applyGlow("#79d7ff", 15 - layer * 2);
      ctx.strokeStyle = `rgba(121, 215, 255, ${alpha})`;
      ctx.lineWidth = 2.5 - layer * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, layerRadius, layerRotation, layerRotation + Math.PI * 1.4);
      ctx.stroke();
    }
    
    // Hạt sáng bay vào tâm
    applyGlow("#ffffff", 10);
    for (let i = 0; i < 6; i++) {
      const particleAngle = (time / 600 + i * Math.PI / 3) % (Math.PI * 2);
      const particleDist = ((time / 100 + i * 40) % 100) / 100 * radius * 1.1;
      const px = x + Math.cos(particleAngle) * (radius * 1.1 - particleDist);
      const py = y + Math.sin(particleAngle) * (radius * 1.1 - particleDist);
      const alpha = particleDist / (radius * 1.1);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === "monolith") {
    // BIA ĐÁ CỔ ĐẠI (Obsidian + Rune Tím)
    const pulse = Math.sin(t * 2) * 0.15 + 0.85;
    applyGlow("#d1a8ff", 20 * pulse);
    
    // Khối đá đen hình lục giác méo
    ctx.fillStyle = "#1a1124";
    ctx.strokeStyle = "#3c2a52";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 1.1);
    ctx.lineTo(x + radius * 0.7, y - radius * 0.3);
    ctx.lineTo(x + radius * 0.5, y + radius * 0.8);
    ctx.lineTo(x - radius * 0.5, y + radius * 0.8);
    ctx.lineTo(x - radius * 0.7, y - radius * 0.3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    
    // Đường vân Rune phát sáng tím
    ctx.strokeStyle = `rgba(209, 168, 255, ${pulse})`;
    ctx.shadowBlur = 10; ctx.shadowColor = "#d1a8ff";
    ctx.beginPath();
    ctx.moveTo(x - radius*0.2, y - radius*0.6);
    ctx.lineTo(x + radius*0.2, y - radius*0.2);
    ctx.lineTo(x - radius*0.1, y + radius*0.2);
    ctx.lineTo(x + radius*0.2, y + radius*0.6);
    ctx.stroke();
    
    // Các mảnh đá lơ lửng xung quanh
    ctx.fillStyle = "#2a1b3d";
    for(let i=0; i<3; i++) {
        const ang = t + i * Math.PI*2/3;
        const dist = radius * 1.3 + Math.sin(t*3 + i)*2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang)*dist, y + Math.sin(ang)*dist, radius*0.1, 0, Math.PI*2);
        ctx.fill();
    }

  } else if (kind === "beacon") {
    // HẢI ĐĂNG (Vàng kim + Tinh thể)
    const pulse = Math.sin(t * 3) * 0.2 + 0.8;
    applyGlow("#ffd700", 25 * pulse);
    
    // Chân đế hình nón cụt
    ctx.fillStyle = "#8a6d00";
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.6, y + radius * 0.7);
    ctx.lineTo(x - radius * 0.3, y - radius * 0.1);
    ctx.lineTo(x + radius * 0.3, y - radius * 0.1);
    ctx.lineTo(x + radius * 0.6, y + radius * 0.7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Tinh thể trung tâm
    ctx.fillStyle = `rgba(255, 240, 166, ${pulse})`;
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.9);
    ctx.lineTo(x + radius * 0.25, y - radius * 0.2);
    ctx.lineTo(x, y + radius * 0.2);
    ctx.lineTo(x - radius * 0.25, y - radius * 0.2);
    ctx.closePath();
    ctx.fill();
    
    // Vòng quỹ đạo xoay (Orbital Rings)
    ctx.strokeStyle = "rgba(255, 215, 0, 0.6)";
    ctx.lineWidth = 1;
    for(let i=0; i<2; i++) {
        const rot = t * 1.5 + i * Math.PI/2;
        ctx.beginPath();
        ctx.ellipse(x, y - radius*0.1, radius*1.1, radius*0.3, rot, 0, Math.PI*2);
        ctx.stroke();
    }
    
    // Cột sáng chiếu lên trời
    const beamGrad = ctx.createLinearGradient(x, y - radius*0.9, x, y - radius*3);
    beamGrad.addColorStop(0, `rgba(255, 215, 0, ${0.6 * pulse})`);
    beamGrad.addColorStop(1, "rgba(255, 215, 0, 0)");
    ctx.fillStyle = beamGrad;
    ctx.fillRect(x - radius*0.2, y - radius*3, radius*0.4, radius*2.1);
  }else if (kind === "crate") {
    // ── HÒM TIẾP TẾ: hòm kho báu có khóa + đinh tán
    const pulse = Math.sin(time / 250) * 0.3 + 0.7;
    
    // Quầng sáng vàng
    applyGlow("#ffd700", 20 + pulse * 15);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.2 * pulse})`;
    ctx.beginPath(); ctx.arc(x, y, radius * 1.1, 0, Math.PI * 2); ctx.fill();
    
    // Thân hòm (gỗ nâu vàng)
    ctx.shadowBlur = 0;
    const woodGrad = ctx.createLinearGradient(x - radius * 0.7, y - radius * 0.5, x + radius * 0.7, y + radius * 0.5);
    woodGrad.addColorStop(0, "#d4a028");
    woodGrad.addColorStop(0.5, "#ffd700");
    woodGrad.addColorStop(1, "#b38f00");
    ctx.fillStyle = woodGrad;
    ctx.fillRect(x - radius * 0.65, y - radius * 0.35, radius * 1.3, radius * 0.85);
    
    // Nắp hòm (vòm cong)
    const lidGrad = ctx.createLinearGradient(x - radius * 0.65, y - radius * 0.6, x + radius * 0.65, y - radius * 0.3);
    lidGrad.addColorStop(0, "#ffd700");
    lidGrad.addColorStop(1, "#b38f00");
    ctx.fillStyle = lidGrad;
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.7, y - radius * 0.35);
    ctx.lineTo(x - radius * 0.7, y - radius * 0.5);
    ctx.quadraticCurveTo(x, y - radius * 0.85, x + radius * 0.7, y - radius * 0.5);
    ctx.lineTo(x + radius * 0.7, y - radius * 0.35);
    ctx.closePath(); ctx.fill();
    
    // Viền đen bao quanh
    ctx.strokeStyle = "#2a1a0a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - radius * 0.65, y - radius * 0.35, radius * 1.3, radius * 0.85);
    ctx.stroke();
    
    // Đinh tán (rivets) 4 góc
    ctx.fillStyle = "#2a1a0a";
    [[-0.5, -0.2], [0.5, -0.2], [-0.5, 0.4], [0.5, 0.4]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + radius * dx, y + radius * dy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Ổ khóa vàng ở giữa
    applyGlow("#ffd700", 8);
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(x - radius * 0.12, y + radius * 0.05, radius * 0.24, radius * 0.25);
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(x, y + radius * 0.18, radius * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 1, y + radius * 0.18, 2, radius * 0.08);
    
  } else {
    // Fallback
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
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

  // ═══ Nếu canvas này đã được attach listener từ trước, chỉ cần vẽ lại ═══
  if (canvas === canvasWithListeners) {
    drawTacticalMap();
    return;
  }
  canvasWithListeners = canvas;

  let pointerStart = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    cancelCameraAnimation();   // ← Cancel nếu đang bay
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
    const next = cellAtPoint(canvas, event.clientX, event.clientY);
    const prev = hoverCell;
    const changed = (!next && !prev) ? false
                  : (!next !== !prev) ? true
                  : (next.x !== prev.x || next.y !== prev.y);
    hoverCell = next;
    if (changed && !pendingHoverRedraw) {
      pendingHoverRedraw = requestAnimationFrame(() => {
        pendingHoverRedraw = 0;
        drawTacticalMap();
      });
    }
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
    cancelCameraAnimation();   // ← Cancel nếu đang bay
    camera.zoom = Math.max(0.55, Math.min(2.5, camera.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    drawTacticalMap();
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (directions[event.key]) {
      event.preventDefault();
      cancelCameraAnimation();   // ← Cancel nếu đang bay
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
  // Reset state augment
  isAugmentPhaseActive = false;
  augmentResultReceived = false;
  isAugmentAnimPlaying = false;
  pendingCanonEvents = [];
  if (canonFlushTimer) clearTimeout(canonFlushTimer);
  canonFlushTimer = null;
  pendingTurnStartAnim = false;
  lastTurnToken = null;
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
  cancelCameraAnimation();   // ← Cancel anim cũ nếu có
  camera.x = playerView.player.position.x;
  camera.y = playerView.player.position.y;
  camera.zoom = 1;
  try {
    render("game");
    matchViewInitialized = true;
    checkTurnChange(null, playerView);
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

  updateBgm(screen === "game");

  // ═══ Rời game → giải phóng tham chiếu để lần vào sau attach lại ═══
  if (screen !== "game") {
    canvasWithListeners = null;
    cancelCameraAnimation();
    // Cancel glyph loop để không chạy ngầm vô ích
    if (effectFrame) {
      cancelAnimationFrame(effectFrame);
      effectFrame = 0;
    }
  }

  // ═══ Chụp canvas cũ trước khi innerHTML xóa DOM ═══
  let preservedCanvas = null;
  if (screen === "game") {
    const existing = root.querySelector("#tactical-canvas");
    if (existing && existing === canvasWithListeners) preservedCanvas = existing;
  }

  root.innerHTML = screen === "help" ? helpScreen()
    : screen === "lobby" ? lobbyHomeScreen()
    : screen === "settings" ? settingsScreen()
      : screen === "link-lost" ? linkLostScreen()
        : screen === "match-result" ? matchResultScreen()
          : screen === "waiting-room" || screen === "initializing" ? initializingScreen()
            : screen === "game" ? gameScreen()
              : homeScreen();

  // ═══ Đặt canvas cũ vào chỗ placeholder mới ═══
  if (preservedCanvas) {
    const placeholder = root.querySelector("#tactical-canvas");
    if (placeholder && placeholder !== preservedCanvas) {
      placeholder.replaceWith(preservedCanvas);
    }
  }

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
  if (!actionFlow.selected || actionFlow.status === "pending" || !playerView?.turn?.isMyTurn) return;
  const action = actionFlow.selected;
  const args = getActionArgs(action);

  // ═══ XỬ LÝ RIÊNG CHO MONOLITH & BEACON ═══
  if (action === "INTERACT_MONOLITH" || action === "ACTIVATE_BEACON") {
    actionFlow.status = "pending";
    actionFlow.result = null;
    render("game");

    try {
      const previousView = playerView;
      const response = await window.gameAdapter.submitAction(action, {});
      if (currentScreen === "match-result" || currentScreen === "link-lost") return;

      if (response.ok && response.playerView) {
        const result = response.actionReport?.result || {};
        if (result.kind === "MonolithResult") {
          const isGood = String(result.message || "").includes("Nhan");
          enqueueToast({
            level: isGood ? "success" : "error",
            title: isGood ? "BIA ĐÁ: BAN PHƯỚC" : "BIA ĐÁ: NGUYỀN RỦA",
            message: result.message || "",
            code: "MONOLITH_RESULT"
          });
        } else if (result.kind === "BeaconActivated") {
          enqueueToast({ level: "success", title: "HẢI ĐĂNG KÍCH HOẠT", message: "Đã mở rộng tầm nhìn khu vực!", code: "BEACON_ACTIVATED" });
        }
        playerView = response.playerView;
        const nextView = response.playerView;
        setCommandEcho(action, `(${previousView.player.position.x}, ${previousView.player.position.y})`, response);
        playActionFeedback(action, response, previousView, nextView);
        actionFlow.result = response;
        actionFlow.status = "success";
      } else {
        enqueueToast({ level: "warning", title: "HÀNH ĐỘNG BỊ TỪ CHỐI", message: response.error?.message || "Lỗi không xác định", code: response.error?.code || "ACTION_FAILED" });
        setCommandEcho(action, "—", response);
        addLocalActionEvent(response.error?.code || "ERROR", response.error?.message || "");
        actionFlow.result = response;
        actionFlow.status = "error";
      }
    } catch (err) {
      console.error("Lỗi khi gửi lệnh:", err);
      enqueueToast({ level: "error", title: "LỖI HỆ THỐNG", message: "Không thể hoàn tất lệnh.", code: "CLIENT_ERROR" });
      actionFlow.status = "error";
    } finally {
      render("game"); // Luôn luôn mở khóa UI
    }
    return;
  }

  // ═══ XỬ LÝ RIÊNG CHO MỞ HÒM ═══
  if (action === "OPEN_CRATE") {
    actionFlow.status = "pending";
    actionFlow.result = null;
    render("game");

    let dialogToShow = null;
    try {
      const previousView = playerView;
      const response = await window.gameAdapter.submitAction(action, {});
      if (currentScreen === "match-result" || currentScreen === "link-lost") return;

      if (response.ok && response.playerView) {
        const result = response.actionReport?.result || {};
        if (result.kind === "CrateOpened") {
          const lootList = result.items || [];
          const lootHtml = lootList.map(item => {
            if (item.kind === "resources") {
              const parts = Object.entries(item.resources).map(([k, v]) => `${v} ${resourceLabel(k)}`).join(", ");
              return `<li class="loot-item">📦 Tài nguyên: ${parts}</li>`;
            } else if (item.kind === "active_item") {
              return `<li class="loot-item">⚡ Vật phẩm chủ động: ${rpgItems.find(i => i.id === item.item)?.name || item.item}</li>`;
            } else if (item.kind === "passive_item") {
              return `<li class="loot-item">🛡️ Vật phẩm bị động: ${rpgItems.find(i => i.id === item.item)?.name || item.item}</li>`;
            } else if (item.kind === "augment") {
              return `<li class="loot-item">💎 Nâng cấp: ${getRarityLabel(item.rarity)}</li>`;
            }
            return "";
          }).join("");

          dialogToShow = document.createElement("dialog");
          dialogToShow.id = "crate-loot-modal";
          dialogToShow.className = "terminal-dialog event-modal planet";
          dialogToShow.innerHTML = `<section class="dialog-card panel"><span class="eyebrow amber-eyebrow">HÒM TIẾP TẾ</span><h2>ĐÃ MỞ THÀNH CÔNG!</h2><ul style="list-style:none; padding:0; margin:1rem 0; text-align:left; color:var(--text); line-height:2;">${lootHtml}</ul><button class="primary-button" data-action="close-loot">THU THẬP</button></section>`;
        } else if (result.kind === "CrateTrap") {
          const trapName = String(result.trap?.kind || "unknown").toUpperCase().replace(/_/g, " ");
          enqueueToast({ level: "error", title: "BẪY KÍCH HOẠT!", message: `Bạn đã dính ${trapName}`, code: "TRAP_TRIGGERED" });
        }
        playerView = response.playerView;
        setCommandEcho(action, `(${previousView.player.position.x}, ${previousView.player.position.y})`, response);
        playActionFeedback(action, response, previousView, response.playerView);
        actionFlow.result = response;
        actionFlow.status = "success";
      } else {
        enqueueToast({ level: "warning", title: "HÀNH ĐỘNG BỊ TỪ CHỐI", message: response.error?.message || "Lỗi không xác định", code: response.error?.code || "ACTION_FAILED" });
        setCommandEcho(action, "—", response);
        addLocalActionEvent(response.error?.code || "ERROR", response.error?.message || "");
        actionFlow.result = response;
        actionFlow.status = "error";
      }
    } catch (err) {
      console.error("Lỗi khi mở hòm:", err);
      enqueueToast({ level: "error", title: "LỖI HỆ THỐNG", message: "Không thể mở hòm.", code: "CLIENT_ERROR" });
      actionFlow.status = "error";
    } finally {
      render("game");
      if (dialogToShow) {
        document.body.append(dialogToShow);
        dialogToShow.showModal();

        // ═══ GẮN SỰ KIỆN CLICK TRỰC TIẾP CHO NÚT THU THẬP ═══
        const lootBtn = dialogToShow.querySelector('[data-action="close-loot"]');
        if (lootBtn) {
          lootBtn.addEventListener("click", () => dialogToShow.close());
        }

        dialogToShow.addEventListener("close", () => dialogToShow.remove(), { once: true });
      }
    }
    return;
  }

  // ═══ KIỂM TRA ĐẦU VÀO RECHARGE ═══
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

  // ═══ XỬ LÝ CHUNG (MOVE, SCAN, MINE, DEPOSIT, END_TURN...) ═══
  actionFlow.status = "pending";
  actionFlow.result = null;
  render("game");

  try {
    const previousView = playerView;
    const response = await window.gameAdapter.submitAction(action, args);
    if (currentScreen === "match-result" || currentScreen === "link-lost") return;

    const nextView = response.ok && response.playerView ? response.playerView : previousView;
    const targetLabel = action === "MOVE" ? `(${args.target?.x}, ${args.target?.y})`
      : action === "RECHARGE" ? `${args.amount} ${resourceLabel(args.resource)}`
      : action === "DEPOSIT" ? "Toàn bộ hàng về Trái Đất"
      : action === "END_TURN" ? "Người chơi tiếp theo"
      : `Từ (${previousView.player.position.x}, ${previousView.player.position.y})`;

    setCommandEcho(action, targetLabel, response);
    if (!response.ok) addLocalActionEvent(response.error?.code || "ERROR", response.error?.message || "");

    playActionFeedback(action, response, previousView, nextView);

    if (response.ok && response.playerView) {
      playerView = response.playerView;
      
      // ═══ BẮT SỰ KIỆN CHUYỂN LƯỢT ═══
      checkTurnChange(previousView, response.playerView);
      
      // Di chuyển camera nếu khoảng cách xa
    if (action === "MOVE" && response.playerView?.player?.position) {
        const dist = Math.abs(camera.x - response.playerView.player.position.x) + Math.abs(camera.y - response.playerView.player.position.y);
        if (dist > 2) {
          camera.x = response.playerView.player.position.x;
          camera.y = response.playerView.player.position.y;
        }
      }
    }

    actionFlow.result = response;
    actionFlow.status = response.ok ? "success" : "error";

    if (response.matchResult) {
      matchResult = response.matchResult;
      summaryNotice = "ĐÃ NHẬN KẾT QUẢ TRẬN";
      render("match-result");
      return;
    }
  } catch (err) {
    console.error("Lỗi khi gửi lệnh chung:", err);
    enqueueToast({ level: "error", title: "LỖI HỆ THỐNG", message: "Không thể hoàn tất lệnh.", code: "CLIENT_ERROR" });
    actionFlow.status = "error";
  } finally {
    render("game"); // LUÔN LUÔN MỞ KHÓA UI
  }
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
    isAugmentPhaseActive = true;
    augmentResultReceived = false;
    isAugmentAnimPlaying = false;
    // KHÔNG XÓA pendingCanonEvents Ở ĐÂY NỮA
    
    if (canonFlushTimer) {
      clearTimeout(canonFlushTimer);
      canonFlushTimer = null;
    }

    augmentOffers = offers;
    augmentDeadline = Date.now() + 30000;
    renderAugmentOverlay();
    if (augmentTimerInterval) clearInterval(augmentTimerInterval);
    augmentTimerInterval = setInterval(updateAugmentCountdown, 100);
}

function hideAugmentUI() {
    augmentResultReceived = true;
    augmentOffers = null;
    if (augmentTimerInterval) clearInterval(augmentTimerInterval);
    document.querySelector("#augment-overlay")?.remove(); // ← Sửa dòng này
    
    tryFinishAugmentPhase();
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
    document.querySelector("#augment-overlay")?.remove();

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
    document.body.append(overlay);
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
    const timerEl = document.querySelector("#augment-timer"); // ← Sửa dòng này
    if (!timerEl) return;
    const seconds = Math.max(0, Math.ceil((augmentDeadline - Date.now()) / 1000));
    timerEl.textContent = `00:${String(seconds).padStart(2, "0")}`;
}



function pickAugment(index) {
  if (!augmentOffers) return;

  const chosenOffer = augmentOffers[index];
  const overlay = document.querySelector("#augment-overlay");
  if (!overlay || !chosenOffer) return;

  const chosenCardEl = overlay.querySelector(`.augment-card[data-augment-index="${index}"]`);
  if (!chosenCardEl) return;

  const chosenRect = chosenCardEl.getBoundingClientRect();
  const chosenCenter = {
    x: chosenRect.left + chosenRect.width / 2,
    y: chosenRect.top + chosenRect.height / 2,
  };

  const allCards = Array.from(overlay.querySelectorAll(".augment-card"));
  const otherCards = allCards
    .filter((el) => parseInt(el.dataset.augmentIndex) !== index)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    });

  augmentOffers = null;
  window.gameAdapter.submitAugment(index);

  allCards.forEach((el) => {
    el.style.transition = "opacity 0.15s ease";
    el.style.opacity = "0";
  });
  const waitingEl = overlay.querySelector("#augment-waiting");
  if (waitingEl) waitingEl.hidden = true;

  isAugmentAnimPlaying = true;

  // Fallback: Tự động mở khóa nếu server không trả kết quả sau 8s
  const fallbackTimer = setTimeout(() => {
    if (isAugmentPhaseActive && !augmentResultReceived) {
      console.warn("Không nhận được augment_result, tự động mở khóa.");
      augmentResultReceived = true;
      tryFinishAugmentPhase();
    }
  }, 8000);

  playAugmentSelectionAnimation({
    chosenCenter,
    chosenRect: { x: chosenRect.left, y: chosenRect.top, w: chosenRect.width, h: chosenRect.height },
    chosenOffer,
    otherCards,
  }, () => {
    isAugmentAnimPlaying = false;
    clearTimeout(fallbackTimer);
    tryFinishAugmentPhase();

    const oldOverlay = document.querySelector("#augment-overlay");
    if (!oldOverlay) return; 

    const cardsEl = oldOverlay.querySelector(".augment-cards");
    if (cardsEl) cardsEl.style.display = "none";
    const w = oldOverlay.querySelector("#augment-waiting");
    if (w) w.hidden = false;
    const timerEl = oldOverlay.querySelector("#augment-timer");
    if (timerEl) timerEl.style.opacity = "0.3";
  });
}
  



function tryFinishAugmentPhase() {
    if (augmentResultReceived && !isAugmentAnimPlaying) {
        isAugmentPhaseActive = false;
        
        if (pendingCanonEvents.length > 0) {
            flushCanonEvents(); // Chạy xong Canon sẽ tự gọi checkPendingTurnStart
        } else {
            checkPendingTurnStart(); // Không có Canon thì check Turn Start luôn
        }
    }
}

function checkPendingTurnStart() {
    if (!pendingTurnStartAnim) return;
    if (isAugmentPhaseActive) return; // Đang chọn lõi thì chưa bung
    if (canonFlushTimer) return; // Đang đợi event
    if (pendingCanonEvents.length > 0) return; // Còn event chưa chạy
    
    // Mọi thứ đã sạch sẽ -> Bung Animation
    pendingTurnStartAnim = false;
    playTurnTransition(true);
}


function playTurnTransition(isMyTurn) {
    if (settings.reducedMotion) return;
    document.querySelector(".turn-transition-overlay")?.remove();

    // Chèn CSS keyframes nếu chưa có
    if (!document.getElementById("turn-anim-style")) {
        const style = document.createElement("style");
        style.id = "turn-anim-style";
        style.textContent = `
            @keyframes turnFadeInOut {
                0% { opacity: 0; transform: scale(0.8); }
                20% { opacity: 1; transform: scale(1); }
                70% { opacity: 1; transform: scale(1.05); }
                100% { opacity: 0; transform: scale(1.1); }
            }
            @keyframes bgFadeInOut {
                0% { opacity: 0; }
                20% { opacity: 0.85; }
                80% { opacity: 0.85; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.className = "turn-transition-overlay";
    overlay.style.cssText = "position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; pointer-events:none; background:#050907; animation: bgFadeInOut 1.8s ease-in-out forwards;";

    const text = document.createElement("div");
    text.textContent = isMyTurn ? "LƯỢT CỦA BẠN" : "KẾT THÚC LƯỢT";
    text.style.cssText = `font-family: Consolas, monospace; font-size: clamp(2.5rem, 6vw, 5rem); font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: ${isMyTurn ? '#71ff91' : '#8ba493'}; text-shadow: 0 0 30px ${isMyTurn ? '#71ff91' : '#000'}; animation: turnFadeInOut 1.8s ease-in-out forwards;`;

    overlay.appendChild(text);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.remove(), 1900);
}


function playEndTurnMeme() {
  document.querySelector("#end-turn-meme-overlay")?.remove();
  
  const overlay = document.createElement("div");
  overlay.id = "end-turn-meme-overlay";
  
  // Random vị trí chữ "ゴゴゴゴ" (Menacing) cho nó tự nhiên
  const topLeft = Math.random() * 20 + 10;
  const bottomRight = Math.random() * 20 + 10;
  
  overlay.innerHTML = `
    <div class="menacing-text" style="top: ${topLeft}%; left: 15%;">ゴゴゴゴ</div>
    <div class="menacing-text" style="bottom: ${bottomRight}%; right: 10%;">ゴゴゴゴ</div>
    <div class="jojo-arrow-container">
      <span class="jojo-arrow-text">TO BE CONTINUED</span>
    </div>
    <div class="waiting-text">VUI LÒNG CHỜ ĐỐI THỦ...</div>
  `;
  
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1700);
}
function checkTurnChange(previousView, nextView) {
    if (!nextView || !nextView.turn) return;
    const token = `${nextView.turn.round}:${nextView.turn.activePlayer}`;
    if (lastTurnToken === token) return;
    lastTurnToken = token;

    const wasMyTurn = Boolean(previousView?.turn?.isMyTurn);
    const isMyTurn = Boolean(nextView.turn?.isMyTurn);

    if (wasMyTurn !== isMyTurn) {
        if (!isMyTurn) {
            // Vừa mất lượt -> Hiện End Turn ngay
            playTurnTransition(false);
        } else {
            // Vừa tới lượt -> Đưa vào hàng đợi chờ Augment/Canon
            pendingTurnStartAnim = true;
            setTimeout(checkPendingTurnStart, 300); // Đợi 300ms xem có Augment/Event không
        }
    }
}


function playAugmentSelectionAnimation(config, onComplete) {

  if (settings.reducedMotion) {
    if (onComplete) onComplete();
    return;
  }

  const { chosenCenter, chosenRect, chosenOffer, otherCards } = config;
  const rarity = chosenOffer.rarity;
  const type = chosenOffer.type;
  const info = getAugmentInfo(type, rarity);

  // ═══ Bảng màu theo rarity ═══
  const rarityColors = {
    silver:  { primary: "#c8d8ec", secondary: "#ffffff", glow: "#a0c0e0", accent: "#e8f0ff" },
    gold:    { primary: "#ffd700", secondary: "#ffffa0", glow: "#ffb000", accent: "#ffffe0" },
    diamond: { primary: "#00ffff", secondary: "#ffffff", glow: "#00c8ff", accent: "#e0ffff" },
  };
  const colors = rarityColors[rarity] || rarityColors.gold;

  // ═══ Overlay toàn màn hình ═══
  const overlay = document.createElement("div");
  overlay.id = "augment-anim-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:10000;pointer-events:auto;cursor:wait;";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  overlay.append(canvas);
  document.body.append(overlay);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  let w = window.innerWidth;
  let h = window.innerHeight;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const startTime = performance.now();
  const DURATION = 4200;

  // Kích thước đích của card ở giữa màn hình
  const startW = chosenRect.w;
  const startH = chosenRect.h;
  const targetW = Math.min(w * 0.32, 380);
  const targetH = targetW * (startH / startW);
  const cardCenterX = w / 2;
  const cardCenterY = h / 2;

  // ═══ Hạt vỡ từ 2 thẻ không chọn ═══
  const shatterParticles = [];
  otherCards.forEach((card, ci) => {
    const otherColors = ["#ffd700", "#00ffff", "#c8d8ec"];
    for (let i = 0; i < 60; i++) {
      shatterParticles.push({
        ox: card.x + (Math.random() - 0.5) * card.w,
        oy: card.y + (Math.random() - 0.5) * card.h,
        vx: (Math.random() - 0.5) * 700,
        vy: (Math.random() - 0.5) * 700 - 250,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 12,
        size: Math.random() * 18 + 8,
        color: otherColors[ci % otherColors.length],
        delay: Math.random() * 0.25,
      });
    }
  });

  // ═══ Hạt orbital xoay quanh card ═══
  const orbitals = [];
  for (let i = 0; i < 12; i++) {
    orbitals.push({
      angle: (i / 12) * Math.PI * 2,
      speed: 0.8 + Math.random() * 0.8,
      size: 3 + Math.random() * 4,
    });
  }

  // ═══ 24 tia sáng bắn ra ═══
  const beams = [];
  for (let i = 0; i < 24; i++) {
    beams.push({
      angle: (i / 24) * Math.PI * 2 + Math.random() * 0.15,
      delay: 0.4 + Math.random() * 0.15,
    });
  }

  // ═══ Easing functions ═══
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const easeOutQuint = (x) => 1 - Math.pow(1 - x, 5);
  const easeInOutCubic = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const hex2rgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  // ═══ Vẽ card hologram ═══
  function drawHoloCard(cx, cy, cw, ch, alpha, glow, rotation) {
    const rx = cx - cw / 2;
    const ry = cy - ch / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = alpha;

    // Aura nền
    const auraR = Math.max(cw, ch) * 0.9;
    const auraGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
    auraGrad.addColorStop(0, hex2rgba(colors.glow, 0.5 * glow));
    auraGrad.addColorStop(0.5, hex2rgba(colors.primary, 0.2 * glow));
    auraGrad.addColorStop(1, hex2rgba(colors.primary, 0));
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
    ctx.fill();

    // Thân card
    ctx.shadowBlur = 40 * glow;
    ctx.shadowColor = colors.glow;
    const bodyGrad = ctx.createLinearGradient(rx, ry, rx + cw, ry + ch);
    bodyGrad.addColorStop(0, "rgba(15,25,20,0.95)");
    bodyGrad.addColorStop(1, "rgba(5,10,8,0.98)");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(rx, ry, cw, ch, 10);
    ctx.fill();

    // Viền rarity phát sáng
    ctx.shadowBlur = 25 * glow;
    ctx.shadowColor = colors.primary;
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(rx, ry, cw, ch, 10);
    ctx.stroke();

    // Viền trong mờ
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,255,255,0.2)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rx + 7, ry + 7, cw - 14, ch - 14, 6);
    ctx.stroke();

    // Icon phát sáng
    const iconY = cy - ch * 0.1;
    const iconR = Math.min(cw, ch) * 0.32;
    const iconGrad = ctx.createRadialGradient(cx, iconY, 0, cx, iconY, iconR);
    iconGrad.addColorStop(0, hex2rgba(colors.secondary, 0.9 * glow));
    iconGrad.addColorStop(0.4, hex2rgba(colors.primary, 0.6 * glow));
    iconGrad.addColorStop(1, hex2rgba(colors.primary, 0));
    ctx.fillStyle = iconGrad;
    ctx.beginPath();
    ctx.arc(cx, iconY, iconR, 0, Math.PI * 2);
    ctx.fill();

    // Emoji icon
    ctx.font = `${Math.max(24, iconR * 1.3)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 20;
    ctx.shadowColor = colors.secondary;
    ctx.fillStyle = "#fff";
    ctx.fillText(info.icon, cx, iconY);

    // Tên augment
    ctx.shadowBlur = 15;
    ctx.shadowColor = colors.primary;
    ctx.fillStyle = colors.primary;
    ctx.font = `bold ${Math.max(14, cw * 0.062)}px Consolas, monospace`;
    ctx.fillText(info.name, cx, cy + ch * 0.2);

    // Độ hiếm
    ctx.shadowBlur = 8;
    ctx.shadowColor = colors.secondary;
    ctx.fillStyle = colors.secondary;
    ctx.font = `bold ${Math.max(10, cw * 0.04)}px Consolas, monospace`;
    ctx.fillText(getRarityLabel(rarity), cx, cy + ch * 0.3);

    ctx.restore();
  }

  // ═══ Main animation loop ═══
  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / DURATION);
    ctx.clearRect(0, 0, w, h);

    // Nền mờ
    const dimAlpha = Math.min(0.75, t * 4);
    ctx.fillStyle = `rgba(0,0,0,${dimAlpha})`;
    ctx.fillRect(0, 0, w, h);

    // ═══ PHA 1: CHỚP LÓE (0-630ms) ═══
    if (t < 0.15) {
      const fp = t / 0.15;
      const fa = Math.sin(fp * Math.PI);
      const fr = 200 + fp * w * 0.8;
      const g = ctx.createRadialGradient(chosenCenter.x, chosenCenter.y, 0, chosenCenter.x, chosenCenter.y, fr);
      g.addColorStop(0, `rgba(255,255,255,${fa})`);
      g.addColorStop(0.4, hex2rgba(colors.secondary, fa * 0.8));
      g.addColorStop(1, hex2rgba(colors.primary, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // ═══ PHA 2: THẺ KHÔNG CHỌN VỠ TAN (80-1260ms) ═══
    if (t > 0.02) {
      const shT = Math.min(1, (t - 0.02) / 0.3);
      shatterParticles.forEach((p) => {
        if (shT < p.delay) return;
        const pT = (shT - p.delay) / (1 - p.delay);
        const eased = easeOutCubic(pT);
        const x = p.ox + p.vx * eased;
        const y = p.oy + p.vy * eased + 500 * eased * eased;
        const rot = p.rot + p.rotSpeed * eased;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.globalAlpha = 1 - pT;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 2);
        ctx.lineTo(p.size / 2, p.size / 2);
        ctx.lineTo(-p.size / 2, p.size / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }

    // ═══ PHA 3: CARD BAY LÊN GIỮA (210-1470ms) ═══
    let curX = chosenCenter.x;
    let curY = chosenCenter.y;
    let curW = startW;
    let curH = startH;
    let curRot = 0;
    let glowIntensity = 1;

    if (t > 0.05) {
      const ascT = Math.min(1, (t - 0.05) / 0.3);
      const eased = easeInOutCubic(ascT);
      curX = chosenCenter.x + (cardCenterX - chosenCenter.x) * eased;
      curY = chosenCenter.y + (cardCenterY - chosenCenter.y) * eased;
      curW = startW + (targetW - startW) * eased;
      curH = startH + (targetH - startH) * eased;
      curRot = Math.sin(ascT * Math.PI * 3) * 0.05 * (1 - ascT);
    }

    if (t > 0.25) {
      glowIntensity = 1 + Math.sin((t - 0.25) * Math.PI * 6) * 0.5;
    }

    // ═══ PHA 4: VÒNG NĂNG LƯỢNG + ORBITAL ═══
    if (t > 0.3) {
      const ringT = Math.min(1, (t - 0.3) / 0.3);

      // 3 vòng sóng lan
      for (let i = 0; i < 3; i++) {
        const rp = (t - 0.3 - i * 0.15) / 0.5;
        if (rp <= 0 || rp >= 1) continue;
        const r = Math.max(curW, curH) * 0.5 + rp * 280;
        ctx.strokeStyle = hex2rgba(colors.primary, (1 - rp) * 0.9);
        ctx.lineWidth = 3 * (1 - rp);
        ctx.shadowBlur = 25;
        ctx.shadowColor = colors.glow;
        ctx.beginPath();
        ctx.arc(curX, curY, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 12 hạt orbital có trail
      if (ringT > 0) {
        orbitals.forEach((o) => {
          const orbR = Math.max(curW, curH) * 0.72 + ringT * 130;
          const a = o.angle + (now / 1000) * o.speed;
          const alpha = ringT * (1 - Math.max(0, (t - 0.9) / 0.1));
          for (let j = 0; j < 6; j++) {
            const ta = a - j * 0.06;
            const tx = curX + Math.cos(ta) * orbR;
            const ty = curY + Math.sin(ta) * orbR * 0.6;
            const ta2 = alpha * (1 - j / 6);
            ctx.fillStyle = hex2rgba(colors.secondary, ta2);
            ctx.shadowBlur = 12;
            ctx.shadowColor = colors.primary;
            ctx.beginPath();
            ctx.arc(tx, ty, o.size * (1 - j / 6), 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    }

    // Vẽ card hologram
    if (t < 0.88) {
      const cardAlpha = 1 - Math.max(0, (t - 0.8) / 0.08);
      if (cardAlpha > 0) {
        drawHoloCard(curX, curY, curW, curH, cardAlpha, glowIntensity, curRot);
      }
    }

    // ═══ PHA 5: 24 TIA SÁNG (1970-3280ms) ═══
    if (t > 0.47 && t < 0.78) {
      const bT = (t - 0.47) / 0.31;
      const bAlpha = Math.sin(bT * Math.PI);
      beams.forEach((b) => {
        if (bT < b.delay) return;
        const bp = Math.min(1, (bT - b.delay) / (1 - b.delay));
        const eased = easeOutQuint(bp);
        const startR = Math.max(curW, curH) * 0.6;
        const len = eased * Math.max(w, h) * 0.75;
        const sx = curX + Math.cos(b.angle) * startR;
        const sy = curY + Math.sin(b.angle) * startR;
        const ex = curX + Math.cos(b.angle) * (startR + len);
        const ey = curY + Math.sin(b.angle) * (startR + len);
        const grad = ctx.createLinearGradient(sx, sy, ex, ey);
        grad.addColorStop(0, hex2rgba(colors.secondary, bAlpha));
        grad.addColorStop(0.4, hex2rgba(colors.primary, bAlpha * 0.8));
        grad.addColorStop(1, hex2rgba(colors.primary, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.shadowBlur = 25;
        ctx.shadowColor = colors.glow;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.fillStyle = hex2rgba(colors.secondary, bAlpha);
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // ═══ PHA 6: CARD TAN RÃ (2770-3780ms) ═══
    if (t > 0.66 && t < 0.9) {
      const dT = (t - 0.66) / 0.24;
      const numP = 80;
      for (let i = 0; i < numP; i++) {
        const seed = i * 13.71;
        const ang = (seed % 1) * Math.PI * 2;
        const spd = 200 + (seed % 1) * 400;
        const dist = easeOutCubic(dT) * spd;
        const px = curX + Math.cos(ang) * dist + Math.sin(seed) * 100;
        const py = curY + Math.sin(ang) * dist;
        const alpha = 1 - dT;
        const size = 2 + (seed % 1) * 4;
        ctx.fillStyle = hex2rgba(colors.secondary, alpha);
        ctx.shadowBlur = 15;
        ctx.shadowColor = colors.primary;
        ctx.beginPath();
        ctx.arc(px, py, size * (1 - dT * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ═══ PHA 7: CHỚP TRẮNG + SÓNG XUNG KÍCH (3400-4200ms) ═══
    if (t > 0.81) {
      const fT = (t - 0.81) / 0.19;
      if (fT < 0.5) {
        const fa = Math.sin(fT * Math.PI * 2) * 0.9;
        ctx.fillStyle = `rgba(255,255,255,${fa})`;
        ctx.fillRect(0, 0, w, h);
      }
      const waveA = Math.max(0, 1 - fT);
      const waveR = fT * Math.max(w, h) * 1.2;
      ctx.strokeStyle = hex2rgba(colors.secondary, waveA);
      ctx.lineWidth = 8 * (1 - fT);
      ctx.shadowBlur = 30;
      ctx.shadowColor = colors.glow;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, waveR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ═══ Loop hoặc kết thúc ═══
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      finishAnimation();
    }
  }

  let isFinished = false;
  function finishAnimation() {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(fallbackTimer);
    overlay.style.transition = "opacity 0.4s ease";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      if (onComplete) onComplete();
    }, 400);
  }

  const fallbackTimer = setTimeout(finishAnimation, 5000);
  requestAnimationFrame(animate);
} 

// ═══════════════════════════════════════════════════════════════════════════
// CRAFTING ANIMATION (GLOBAL SCOPE)
// ═══════════════════════════════════════════════════════════════════════════

function playCraftingAnimation(itemId, isPassive, onComplete) {
  if (settings.reducedMotion) {
    if (onComplete) onComplete();
    return;
  }

  const itemInfo = rpgItems.find(i => i.id === itemId) || { name: itemId, icon: "◇", desc: "" };

  const overlay = document.createElement("div");
  overlay.id = "crafting-anim-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;pointer-events:auto;cursor:wait;background:rgba(0,0,0,0);";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  overlay.append(canvas);
  document.body.append(overlay);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  let w = window.innerWidth;
  let h = window.innerHeight;
  
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const cx = w / 2;
  const cy = h / 2;
  const startTime = performance.now();
  const DURATION = 4500;

  const particles = [];
  for (let i = 0; i < 150; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      dist: Math.random() * 400,
      speed: Math.random() * 5 + 2,
      size: Math.random() * 3 + 1,
      offset: Math.random() * 100
    });
  }

  function hex2rgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / DURATION);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = `rgba(2, 5, 4, ${Math.min(0.85, t * 5)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    if (!isPassive) {
      const mainColor = "#ff8c00";
      const subColor = "#00ffff";

      if (t > 0.05) {
        const ringT = Math.min(1, (t - 0.05) / 0.2);
        ctx.save();
        ctx.translate(cx, cy + 150);
        ctx.scale(1, 0.3);
        for (let i = 0; i < 3; i++) {
          const r = 250 * ringT - i * 40;
          if (r > 0) {
            ctx.strokeStyle = hex2rgba(mainColor, (1 - i * 0.3) * 0.8);
            ctx.lineWidth = 4;
            ctx.setLineDash([20, 10 + i * 10]);
            ctx.beginPath();
            ctx.arc(0, 0, r, now / (500 + i * 200), now / (500 + i * 200) + Math.PI * 1.5);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      if (t > 0.2 && t < 0.4) {
        const flashT = (t - 0.2) / 0.2;
        if (Math.random() < 0.5) {
          ctx.strokeStyle = hex2rgba(subColor, Math.sin(flashT * Math.PI));
          ctx.lineWidth = 3 + Math.random() * 3;
          ctx.shadowBlur = 30; ctx.shadowColor = subColor;
          ctx.beginPath();
          let lx = cx + (Math.random() - 0.5) * 100;
          let ly = 0;
          ctx.moveTo(lx, ly);
          while (ly < cy) {
            lx += (Math.random() - 0.5) * 80;
            ly += Math.random() * 60;
            ctx.lineTo(lx, ly);
          }
          ctx.stroke();
        }
      }

      const coreScale = t < 0.4 ? t * 2.5 : (t > 0.8 ? (1 - t) * 5 : 1);
      if (coreScale > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(now / 200);
        
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 120 * coreScale);
        grad.addColorStop(0, hex2rgba(subColor, 0.8));
        grad.addColorStop(0.5, hex2rgba(mainColor, 0.4));
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, 120 * coreScale, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = Math.cos(a) * 80 * coreScale;
          const py = Math.sin(a) * 80 * coreScale;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();

        ctx.rotate(Math.PI / 6);
        ctx.strokeStyle = subColor;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = Math.cos(a) * 60 * coreScale;
          const py = Math.sin(a) * 60 * coreScale;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }

      if (t > 0.4 && t < 0.8) {
        const suckT = (t - 0.4) / 0.4;
        particles.forEach(p => {
          const dist = (1 - suckT) * 500 + 50;
          const px = cx + Math.cos(p.angle + now / 500) * dist;
          const py = cy + Math.sin(p.angle + now / 500) * dist;
          ctx.fillStyle = hex2rgba(mainColor, suckT);
          ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
        });
      }

      if (t > 0.75 && t < 0.85) {
        const expT = (t - 0.75) / 0.1;
        ctx.fillStyle = `rgba(255, 255, 255, ${1 - expT})`;
        ctx.beginPath(); ctx.arc(cx, cy, 300 * expT, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 10 * (1 - expT);
        ctx.beginPath(); ctx.arc(cx, cy, 400 * expT, 0, Math.PI * 2); ctx.stroke();
      }
    } 
    else {
      const mainColor = "#b864ff";
      const subColor = "#64ffb8";

      if (t > 0.1 && t < 0.6) {
        const webT = (t - 0.1) / 0.5;
        ctx.strokeStyle = hex2rgba(mainColor, 1 - webT);
        ctx.lineWidth = 2;
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const r = webT * 300;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          ctx.stroke();
          
          if (i < 11) {
            const nextAngle = ((i + 1) / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.5, angle, nextAngle);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.8, angle, nextAngle);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      if (t > 0.3 && t < 0.85) {
        const mT = (t - 0.3) / 0.55;
        ctx.save();
        ctx.translate(cx, cy);
        
        ctx.rotate(now / 1000);
        ctx.strokeStyle = hex2rgba(subColor, Math.sin(mT * Math.PI));
        ctx.lineWidth = 4;
        ctx.setLineDash([15, 20]);
        ctx.beginPath(); ctx.arc(0, 0, 200 * mT, 0, Math.PI * 2); ctx.stroke();

        ctx.rotate(-now / 500);
        ctx.strokeStyle = hex2rgba(mainColor, Math.sin(mT * Math.PI));
        ctx.lineWidth = 6;
        ctx.setLineDash([5, 15]);
        ctx.beginPath(); ctx.arc(0, 0, 140 * mT, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      if (t > 0.4) {
        const weaveT = Math.min(1, (t - 0.4) / 0.3);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-now / 300);
        for (let i = 0; i < 20; i++) {
          const a1 = (i / 20) * Math.PI * 2;
          const a2 = a1 + Math.PI * 0.8;
          const r = 220 * weaveT;
          ctx.strokeStyle = hex2rgba(i % 2 === 0 ? mainColor : subColor, 0.6);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a1) * r, Math.sin(a1) * r);
          ctx.quadraticCurveTo(0, 0, Math.cos(a2) * r, Math.sin(a2) * r);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (t > 0.3) {
        particles.slice(0, 50).forEach(p => {
          const px = cx + Math.cos(p.angle) * p.dist * 1.5;
          const py = cy + Math.sin(p.angle) * p.dist * 1.5;
          const alpha = Math.sin(now / 300 + p.offset) * 0.5 + 0.5;
          ctx.fillStyle = hex2rgba(subColor, alpha);
          ctx.beginPath(); ctx.arc(px, py, p.size * 1.5, 0, Math.PI * 2); ctx.fill();
          
          ctx.strokeStyle = hex2rgba("#ffffff", alpha);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py);
          ctx.moveTo(px, py - 5); ctx.lineTo(px, py + 5);
          ctx.stroke();
        });
      }
    }

    if (t > 0.7 && t < 0.95) {
      const textAlpha = Math.min(1, (t - 0.7) * 10) * Math.min(1, (0.95 - t) * 10);
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const auraGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 250);
      auraGrad.addColorStop(0, isPassive ? hex2rgba("#b864ff", 0.3) : hex2rgba("#ff8c00", 0.3));
      auraGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = auraGrad;
      ctx.beginPath(); ctx.arc(cx, cy, 250, 0, Math.PI * 2); ctx.fill();

      ctx.font = "bold 80px serif";
      ctx.shadowBlur = 30; ctx.shadowColor = isPassive ? "#b864ff" : "#ff8c00";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(itemInfo.icon, cx, cy - 30);

      ctx.font = "bold 32px Consolas, monospace";
      ctx.fillStyle = isPassive ? "#64ffb8" : "#00ffff";
      ctx.fillText(itemInfo.name.toUpperCase(), cx, cy + 60);

      ctx.font = "14px Consolas, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(isPassive ? "VẬT PHẨM BỊ ĐỘNG" : "VẬT PHẨM CHỦ ĐỘNG", cx, cy + 95);

      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      finishAnimation();
    }
  }

  let isFinished = false;
  function finishAnimation() {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(fallbackTimer);
    overlay.style.transition = "opacity 0.5s ease";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      if (onComplete) onComplete();
    }, 500);
  }

  const fallbackTimer = setTimeout(finishAnimation, 6000);
  requestAnimationFrame(animate);
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
  } else if (button.dataset.action === "open-objectives") {
    openRpgDialog("objectives"); // MỚI
  } else if (button.dataset.rpgAction === "claim") {
    submitRpgAction("CLAIM_OBJECTIVE", { id: Number(button.dataset.id) }); // MỚI
  } else if (button.dataset.eventTab) {
    eventTab = button.dataset.eventTab;
    openRpgDialog("events");
  } else if (button.dataset.action === "close-rpg" || button.dataset.action === "close-event" || button.dataset.action === "close-loot") {    button.closest("dialog")?.close();
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
    hoverCell = null;
    smoothResetCamera(1);
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
    if (actionFlow.selected === "END_TURN") playEndTurnMeme();
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
  
  const previousView = playerView;
  playerView = nextView;
  updateTurnDeadline(nextView);
  
  // ═══ BẮT SỰ KIỆN CHUYỂN LƯỢT BẰNG HÀM SO SÁNH ═══
  if (previousView) {
      checkTurnChange(previousView, nextView);
  } else if (nextView.turn?.isMyTurn) {
      // Lần đầu tiên vào trận
      pendingTurnStartAnim = true;
      setTimeout(checkPendingTurnStart, 300);
  }

  if (currentScreen === "game" && !pendingAction) render("game");
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

// ═══ Pause glyph animation khi tab bị ẩn, resume khi quay lại ═══
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Cancel loop để tiết kiệm pin khi tab ẩn
    if (effectFrame) {
      cancelAnimationFrame(effectFrame);
      effectFrame = 0;
    }
  } else if (currentScreen === "game" && canvasWithListeners) {
    // Resume loop khi quay lại
    drawTacticalMap();
  }
});
