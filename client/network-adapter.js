"use strict";

// Production adapter for the Haskell WebSocket protocol.
(() => {
  const resourceNames = {
    pink_diamond: "PinkDiamond", spinel: "Spinel", holly_blue_agate: "HollyBlueAgate", peridot: "Peridot",
    topaz: "Topaz", carnelian: "Carnelian", jasper: "Jasper", amethyst: "Amethyst",
    iron: "Spinel", crystal: "HollyBlueAgate", energy_core: "Peridot", rare_ore: "Topaz", exotic_matter: "Carnelian",
  };
  const resourceValues = { PinkDiamond: 50, Spinel: 1, HollyBlueAgate: 3, Peridot: 5, Topaz: 10, Carnelian: 25, Jasper: 15, Amethyst: 2 };
  const errorMessages = {
    game_not_in_progress: "Trận đấu hiện không hoạt động.", not_your_turn: "Hãy đợi đến lượt của bạn.",
    not_enough_ap: "Không đủ điểm hành động (AP).", not_enough_battery: "Không đủ pin.",
    out_of_bounds: "Vị trí nằm ngoài bản đồ.", not_on_planet: "Tàu cần đứng trên hành tinh để khai thác.",
    planet_has_no_such_resource: "Hành tinh không có loại tài nguyên đã chọn.", cargo_full: "Khoang hàng đã đầy.",
    cargo_empty: "Không có hàng để nộp.", not_at_earth: "Chỉ có thể sạc pin tại Trái Đất.",
    out_of_deposit_range: "Trái Đất nằm ngoài tầm nộp hàng.", battery_full: "Pin đã đầy.",
    not_enough_resources: "Kho Trái Đất không có đủ tài nguyên.", invalid_amount: "Số lượng không hợp lệ.",
    in_jammed_zone: "Đang trong vùng nhiễu sóng — không thể quét.",
    no_crate_here: "Không đứng trên hòm tiếp tế.",
    objective_not_complete: "Nhiệm vụ chưa hoàn thành.",
    objective_already_claimed: "Nhiệm vụ đã nhận thưởng rồi.",
    objective_not_found: "Không tìm thấy nhiệm vụ.",
  };
  const listeners = { views: new Set(), notifications: new Set(), results: new Set(), states: new Set(), augment: new Set() };  let socket = null;
  let self = null;
  let started = false;
  let startPromise = null;
  let startResolve = null;
  let startReject = null;
  let pendingAction = null;
  let connectionTimer = null;
  let recentEvents = [];
  let latestView = null;

  function on(kind, value) { for (const listener of listeners[kind]) listener(value); }
  function emitState(state, message = "") { on("states", { state, message }); }
  function normalizeResources(resources = {}) {
    return Object.fromEntries(Object.entries(resources)
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => [resourceNames[key] || key, Number(value)]));
  }
  function event(code, text, kind = "INFO") {
    const now = new Date();
    recentEvents.unshift({ time: `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`, code, text, kind });
    recentEvents = recentEvents.slice(0, 40);
  }
  function normalizeView(raw) {
    if (!raw || typeof raw !== "object" || !raw.pos || !raw.earth) throw new Error("Server trả về view không hợp lệ.");
    const me = raw.you;
    const activePlayer = raw.current_player;
    const here = raw.planet_here;
    const view = {
      player: {
        position: raw.pos, ap: raw.ap, apMax: raw.ap_max, battery: raw.battery, batteryMax: raw.max_battery ?? raw.battery_max,
        cargo: normalizeResources(raw.cargo), cargoUsed: Object.values(raw.cargo || {}).reduce((sum, count) => sum + count, 0),
        cargoCapacity: raw.max_cargo ?? raw.cargo_capacity, earthStorage: normalizeResources(raw.storage), earthScore: raw.score,
        earthScoreTarget: raw.score_target, currentPlanetStock: here ? normalizeResources(here.stock) : null,
        currentPlanetEvent: here ? (here.event_type || null) : null,        
        inventory: raw.inventory || { passives: {}, actives: [] }, luck: raw.luck || 0,
        augments: raw.augments || [], // <-- THÊM DÒNG NÀY ĐỂ UI ĐỌC ĐƯỢC NÂNG CẤP
      },
      you: me,
      earth: raw.earth,
      knownPlanets: (raw.known_planets || []).map((planet) => ({
        id: String(planet.id), 
        type: planet.type[0].toUpperCase() + planet.type.slice(1), 
        position: planet.pos, 
        discoveredBy: "Unknown",
        stock: planet.stock ? normalizeResources(planet.stock) : null,
        eventType: planet.event_type || null
      })),
      // ▼▼▼ THÊM MỚI ▼▼▼
      zones: (raw.zones || []).map((z) => ({
        id: z.id, type: z.type, pos: z.pos, shape: z.shape, radius: z.radius, width: z.width, height: z.height
      })),
      crates: (raw.crates || []).map((c) => ({
        id: c.id, pos: c.pos, content: c.content, spawnedRound: c.spawned_round
      })),
      knownWormholes: (raw.wormholes || []).map((w) => ({
        id: w.id, pos: w.pos, pairedWith: w.paired_with
      })),
      objectives: (raw.objectives || []).map((o) => ({
        id: o.id, difficulty: o.difficulty, type: o.type, reward: o.reward, completed: o.completed, claimed: o.claimed
      })),
      crateHere: raw.crate_here || null,
      currentZone: raw.current_zone || null,
      monoliths: (raw.monoliths || []).map(m => ({ id: m.id, pos: m.pos })),
      beacons: (raw.beacons || []).map(b => ({ id: b.id, pos: b.pos, active: b.active })),
      monolithHere: raw.monolith_here || null,
      beaconHere: raw.beacon_here || null,
      // ▲▲▲ THÊM MỚI ▲▲▲
      turn: {
        activePlayer: activePlayer === "player1" ? "Player 1" : "Player 2", round: raw.round, roundMax: raw.max_rounds,
        isMyTurn: activePlayer === me, endTime: raw.turn_end_time || null,
      },
      opponent: { connection: "connected", publicStatus: activePlayer === me ? "waiting" : "active" },
      gameStatus: raw.phase?.type === "finished" ? "finished" : raw.phase?.type === "in_progress" ? "in-progress" : "waiting",
      recentEvents: [...recentEvents], activeEvent: raw.active_event || null, canCraft: raw.can_craft || [],
      mapWidth: raw.map_width, mapHeight: raw.map_height,
    };
    latestView = view;
    return view;
  }
  function resultFrom(rawResult, summary) {
    const isDraw = rawResult?.type === "draw";
    const won = !isDraw && rawResult?.player === self;
    const playerKey = self || "player1";
    const opponentKey = playerKey === "player1" ? "player2" : "player1";
    return {
      verified: true,
      outcome: isDraw ? "Draw" : won ? "Victory" : "Defeat",
      eventCode: isDraw ? "MATCH_DRAW" : "MATCH_WON_OR_LOST",
      reason: rawResult?.reason,
      playerScore: summary?.[playerKey]?.score,
      opponentScore: summary?.[opponentKey]?.score,
      rounds: latestView?.turn.round,
      totalDeposited: summary?.[playerKey]?.deposited,
    };
  }
  function actionReport(raw, previous, next) {
    let source = raw?.result || {};
    const triggered = source.type === "planet_event" || source.type === "canon_event" ? source : null;
    if (triggered?.result) source = triggered.result;
    const kinds = {
      moved: { kind: "Moved", position: source.pos },
      planets_found: { kind: "PlanetsFound", planets: (source.planets || []).map((p, i) => ({ id: String(p.id ?? `planet-${i}`), type: p.type[0].toUpperCase() + p.type.slice(1), position: p.pos })) },
      nearest_planet: { kind: "NearestPlanetSignal", found: source.found, direction: source.direction, distance: source.distance },
      opponent_direction: { kind: "OpponentSignal", direction: source.direction },
      mined: { kind: "Mined", resource: resourceNames[source.resource] || source.resource, amount: source.amount },
      mined_all: { kind: "MinedAll", resources: normalizeResources(source.resources) },
      deposited: { kind: "Deposited", resources: normalizeResources(source.resources), scoreAdded: Math.max(0, next.player.earthScore - previous.player.earthScore) },
      recharged: { kind: "Recharged", batteryAdded: source.amount },
      turn_ended: { kind: "TurnEnded" },
      // ▼▼▼ THÊM MỚI ▼▼▼
      wormhole_entered: { kind: "WormholeEntered", from: source.from, to: source.to },
      crate_opened: { kind: "CrateOpened", items: source.items },
      crate_trap: { kind: "CrateTrap", trap: source.trap },
      zone_entered: { kind: "ZoneEntered", zoneType: source.zone_type },
      zone_ended_turn: { kind: "ZoneEndedTurn", zoneType: source.zone_type, amount: source.amount },
      objective_claimed: { kind: "ObjectiveClaimed", objectiveId: source.objective_id, reward: source.reward },
      monolith_result: { kind: "MonolithResult", message: source.message },
      beacon_activated: { kind: "BeaconActivated", pos: source.pos },      // ▲▲▲ THÊM MỚI ▲▲▲

      use_item: { kind: "ItemUsed" },
      craft: { kind: "ItemCrafted" },
      objective_claimed: { kind: "ObjectiveClaimed" }
    };
    const result = kinds[source.type] || { kind: "ActionAccepted" };
    const messages = {
      nearest_planet: source.found ? `Tín hiệu hành tinh gần nhất: ${source.direction}, cách ${source.distance} ô.` : "Không còn hành tinh nào có tài nguyên.",
      opponent_direction: `Tín hiệu đối thủ: ${source.direction}.`,
      moved: source.pos ? `Tàu di chuyển đến (${source.pos.x}, ${source.pos.y}).` : "Tàu đã di chuyển.",
      planets_found: (source.planets || []).length ? `Phát hiện ${(source.planets || []).length} hành tinh.` : "Không phát hiện hành tinh mới.",
      mined: `Khai thác ${source.amount} ${resourceNames[source.resource] || source.resource}.`,
      deposited: "Đã nộp hàng về Trái Đất.", recharged: `Đã nạp thêm ${source.amount} pin.`,
      turn_ended: "Đã kết thúc lượt. Đang chờ đối thủ.",
    };
    return { result, event: triggered ? { kind: triggered.type === "planet_event" ? "planet" : "canon", name: triggered.event } : null, message: messages[source.type] || "Lệnh đã được máy chủ chấp nhận." };
  }
  function protocolError(message) {
    on("notifications", { code: "PROTOCOL_ERROR", level: "error", title: "LỖI GIAO THỨC", message: "Máy chủ không thể xử lý yêu cầu. Vui lòng thử lại." });
    if (!started && startReject) {
      const reject = startReject;
      startResolve = startReject = null;
      reject({ ok: false, error: { code: "PROTOCOL_ERROR", message: `Không đọc được phản hồi vào trận từ máy chủ: ${message}`, retryable: false } });
    }
    if (pendingAction) {
      clearTimeout(pendingAction.timer);
      pendingAction.resolve({ ok: false, error: { code: "PROTOCOL_ERROR", message: "Phản hồi từ máy chủ không hợp lệ.", retryable: false }, notifications: [] });
      pendingAction = null;
    }
  }
  function send(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Kết nối máy chủ chưa sẵn sàng.");
    socket.send(JSON.stringify(data));
  }
  function socketUrl() {
    const secure = location.protocol === "https:";
    const host = location.hostname || "localhost";
    return `${secure ? "wss" : "ws"}://${host}:8080/`;
  }
  function closeWithError(message) {
    const error = { code: "CONNECTION_LOST", message, retryable: false };
    emitState("disconnected", message);
    if (!started && startReject) { startReject({ ok: false, error }); startReject = null; }
    if (pendingAction) {
      clearTimeout(pendingAction.timer);
      pendingAction.resolve({ ok: false, error, notifications: [] });
      pendingAction = null;
    }
    if (started) on("notifications", { code: error.code, level: "error", title: "MẤT KẾT NỐI", message });
  }
  function handleMessage(message) {
    switch (message.type) {
      case "welcome":
        self = message.player;
        if (connectionTimer) clearTimeout(connectionTimer);
        connectionTimer = null;
        return;
      case "waiting_for_opponent":
        event("WAITING_OPPONENT", "Đang chờ người chơi thứ hai kết nối.");
        on("notifications", { code: "WAITING_OPPONENT", level: "info", title: "ĐANG CHỜ", message: "Đang chờ người chơi thứ hai kết nối." });
        emitState("waiting", "Đang chờ người chơi thứ hai kết nối.");
        return;
      case "game_started": {
        const view = normalizeView(message.view);
        started = true;
        event("GAME_STARTED", "Trận đấu bắt đầu.");
        latestView = { ...view, recentEvents: [...recentEvents] };
        startResolve?.({ ok: true, playerView: latestView });
        on("views", latestView);
        startResolve = startReject = null;
        emitState("started", "Trận đấu đã bắt đầu.");
        return;
      }
      case "action_accepted": {
        const previous = latestView;
        const view = normalizeView(message.view);
        const report = actionReport(message.report, previous, view);
        const reportType = String(message.report?.result?.type || "action").toUpperCase();
        event(`${reportType}_CONFIRMED`, report.message);
        const next = { ...view, recentEvents: [...recentEvents] };
        latestView = next;
        if (pendingAction?.moveFallback && pendingAction.moveTarget &&
            (view.player.position.x !== pendingAction.moveTarget.x || view.player.position.y !== pendingAction.moveTarget.y)) {
          on("views", next);
          sendNextLegacyMoveStep(pendingAction);
          return;
        }
        if (pendingAction) {
          clearTimeout(pendingAction.timer);
          pendingAction.resolve({ ok: true, playerView: next, actionReport: report, notifications: [] });
          pendingAction = null;
        }
        on("views", next);
        return;
      }
      case "action_rejected": {
        if (!pendingAction) return;
        const code = String(message.error || "unknown_error").toLowerCase();
        const error = { code: code.toUpperCase(), message: errorMessages[code] || "Máy chủ đã từ chối hành động.", retryable: true };
        event(error.code, error.message, "WARN");
        clearTimeout(pendingAction.timer);
        pendingAction.resolve({ ok: false, error, notifications: [] });
        pendingAction = null;
        return;
      }
      case "opponent_acted": {
        const view = normalizeView(message.view);
        if (message.notice === "you_were_scanned") {
          on("notifications", { code: "YOU_WERE_SCANNED", level: "warning", title: "BẠN BỊ QUÉT", message: "Đối thủ đã quét hướng của bạn." });
          event("YOU_WERE_SCANNED", "Đối thủ vừa quét bạn.", "SCAN");
        } else {
          event("OPPONENT_ACTED", "Đối thủ đã hành động.");
        }
        latestView = { ...view, recentEvents: [...recentEvents] };
        on("views", latestView);
        return;
      }
      case "game_over": {
        const result = resultFrom(message.result, message.summary);
        event(result.outcome === "Draw" ? "MATCH_DRAW" : "MATCH_OVER", result.outcome === "Draw" ? "Trận đấu kết thúc với kết quả hòa." : "Máy chủ đã xác nhận kết quả trận đấu.");
        if (pendingAction) {
          clearTimeout(pendingAction.timer);
          pendingAction.resolve({ ok: false, error: { code: "GAME_FINISHED", message: "Trận đấu đã kết thúc.", retryable: false }, notifications: [] });
          pendingAction = null;
        }
        started = false;
        on("results", result);
        emitState("finished", "Trận đấu đã kết thúc.");
        return;
      }
      case "event_triggered": {
        const notice = message.event || {};
        const canonical = notice.kind === "canon";
        event(`EVENT_${notice.event_name || "TRIGGERED"}`, notice.effect_desc || "A game event was triggered.", "WARN");
        if (message.view) { latestView = { ...normalizeView(message.view), recentEvents: [...recentEvents] }; on("views", latestView); }
        on("notifications", { code: `EVENT_${notice.event_name || "TRIGGERED"}`, level: canonical ? "error" : "warning", title: notice.event_name || "GAME EVENT", message: notice.effect_desc || "A game event was triggered." });
        return;
      }
      case "augment_offer": {
        on("augment", { type: "offer", offers: message.offers });
        return;
      }
      case "augment_result": {
        if (message.view) {
          const view = normalizeView(message.view);
          latestView = view;
          on("views", view);
        }
        on("augment", { type: "result", yourPick: message.your_pick, oppPick: message.opp_pick });
        return;
      }
      case "protocol_error":
        if (pendingAction?.moveTarget && !pendingAction.moveFallback && /direction/i.test(String(message.message || ""))) {
          pendingAction.moveFallback = true;
          sendNextLegacyMoveStep(pendingAction);
          return;
        }
        if (pendingAction?.legacyMineResource && !pendingAction.mineFallback && /resource/i.test(String(message.message || ""))) {
          pendingAction.mineFallback = true;
          try { send({ type: "action", action: { type: "mine", resource: pendingAction.legacyMineResource } }); }
          catch (error) {
            clearTimeout(pendingAction.timer);
            pendingAction.resolve({ ok: false, error: { code: "CONNECTION_LOST", message: error.message, retryable: false }, notifications: [] });
            pendingAction = null;
          }
          return;
        }
        event("PROTOCOL_ERROR", "Máy chủ không thể xử lý yêu cầu.", "WARN");
        protocolError(message.message);
        return;
      default:
        protocolError(`Loại tin nhắn không hỗ trợ: ${message.type || "không rõ"}`);
    }
  }
  function sendNextLegacyMoveStep(action) {
    if (pendingAction !== action || !latestView) return;
    const current = latestView.player.position;
    const target = action.moveTarget;
    if (current.x === target.x && current.y === target.y) return;
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? "left" : "right")
      : (dy < 0 ? "up" : "down");
    try { send({ type: "action", action: { type: "move", direction } }); }
    catch (error) {
      clearTimeout(action.timer);
      pendingAction = null;
      action.resolve({ ok: false, error: { code: "CONNECTION_LOST", message: error.message, retryable: false }, notifications: [] });
    }
  }
  function legacyMineType(resources) {
    const legacyTypes = {
      Spinel: "iron", HollyBlueAgate: "crystal", Peridot: "energy_core",
      Topaz: "rare_ore", Carnelian: "exotic_matter",
    };
    return Object.keys(resources || {}).find((resource) => legacyTypes[resource])
      ? legacyTypes[Object.keys(resources).find((resource) => legacyTypes[resource])]
      : null;
  }
  function startMatch() {
    if (socket && socket.readyState === WebSocket.OPEN && started && latestView) return Promise.resolve({ ok: true, playerView: latestView });
    if (startPromise) return startPromise;
    return startPromise = new Promise((resolve) => {
      startResolve = (value) => { startPromise = null; startResolve = startReject = null; resolve(value); };
      startReject = (value) => { startPromise = null; startResolve = startReject = null; resolve(value); };
      recentEvents = [];
      self = null; started = false; latestView = null;
      if (connectionTimer) clearTimeout(connectionTimer);
      connectionTimer = null;
      emitState("connecting", "Đang kết nối với máy chủ…");
      if (socket && socket.readyState < WebSocket.CLOSING) {
        const oldSocket = socket;
        socket = null;
        oldSocket.close();
      }
      let currentSocket;
      try { currentSocket = new WebSocket(socketUrl()); socket = currentSocket; }
      catch { startReject({ ok: false, error: { code: "CONNECTION_FAILED", message: "Không thể mở kết nối WebSocket.", retryable: false } }); return; }
      currentSocket.addEventListener("open", () => {
        if (socket !== currentSocket) return;
        try {
          send({ type: "join" }); emitState("waiting", "Đã kết nối, đang ghép trận tự động…");
          connectionTimer = window.setTimeout(() => {
            if (!self && startReject) {
              const reject = startReject;
              startResolve = startReject = null;
              reject({ ok: false, error: { code: "JOIN_TIMEOUT", message: "Máy chủ chưa xác nhận yêu cầu vào trận.", retryable: true } });
              currentSocket.close();
            }
          }, 12000);
        }
        catch { closeWithError("Không gửi được yêu cầu vào trận."); }
      }, { once: true });
      currentSocket.addEventListener("message", (event) => {
        if (socket !== currentSocket) return;
        try { handleMessage(JSON.parse(event.data)); }
        catch (error) { protocolError(error.message); }
      });
      currentSocket.addEventListener("error", () => {
        if (socket !== currentSocket) return;
        if (!started) closeWithError("Không thể kết nối tới máy chủ tại cổng 8080.");
      });
      currentSocket.addEventListener("close", () => {
        if (socket !== currentSocket) return;
        closeWithError("Kết nối tới máy chủ đã đóng. Trận đấu không thể kết nối lại.");
      });
    });
  }
  function submitAction(action, args = {}) {
    if (!started || !latestView) return Promise.resolve({ ok: false, error: { code: "GAME_NOT_IN_PROGRESS", message: "Chưa có trận đấu đang hoạt động.", retryable: false }, notifications: [] });
    if (pendingAction) return Promise.resolve({ ok: false, error: { code: "ACTION_PENDING", message: "Đang chờ phản hồi máy chủ.", retryable: true }, notifications: [] });
    const messageActions = {
      OBSERVE: { type: "observe" }, SCAN_AREA: { type: "scan_area" }, SCAN_NEAREST: { type: "scan_nearest" },
      SCAN_OPPONENT: { type: "scan_opponent" }, DEPOSIT: { type: "deposit" }, END_TURN: { type: "end_turn" },
      MINE: { type: "mine" },
      OPEN_CRATE: { type: "open_crate" },
      CLAIM_OBJECTIVE: { type: "claim_objective", id: Number(args.id) },
      INTERACT_MONOLITH: { type: "interact_monolith" },
      ACTIVATE_BEACON: { type: "activate_beacon" },
      RECHARGE: { type: "recharge", resource: String(args.resource || "Iron").replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, "").toLowerCase(), amount: Number(args.amount) },
    };
    if (action === "MOVE") {
      const target = args.target;
      if (!target) return Promise.resolve({ ok: false, error: { code: "TARGET_REQUIRED", message: "Hãy chọn ô mục tiêu trước.", retryable: false }, notifications: [] });
      const dx = target.x - latestView.player.position.x, dy = target.y - latestView.player.position.y;
      if (Math.abs(dx) + Math.abs(dy) < 1) return Promise.resolve({ ok: false, error: { code: "INVALID_MOVE", message: "Choose a different target cell.", retryable: false }, notifications: [] });
      messageActions.MOVE = { type: "move", target };
    }
    if (action === "CRAFT") messageActions.CRAFT = { type: "craft", item: args.item };
    if (action === "USE_ITEM") messageActions.USE_ITEM = { type: "use_item", item: args.item };
    const actionData = messageActions[action];
    if (!actionData) return Promise.resolve({ ok: false, error: { code: "UNKNOWN_ACTION", message: "Lệnh không được hỗ trợ.", retryable: false }, notifications: [] });
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        if (!pendingAction) return;
        const timedOutSocket = socket;
        pendingAction = null;
        resolve({ ok: false, error: { code: "ACTION_TIMEOUT", message: "Máy chủ chưa phản hồi hành động.", retryable: true }, notifications: [] });
        started = false;
        emitState("disconnected", "Không thể xác nhận phản hồi hành động. Hãy rời trận và kết nối lại.");
        timedOutSocket?.close();
      }, 15000);
      pendingAction = {
        resolve, timer,
        moveTarget: action === "MOVE" ? { ...args.target } : null,
        moveFallback: false,
        legacyMineResource: action === "MINE" ? legacyMineType(latestView?.player.currentPlanetStock) : null,
        mineFallback: false,
      };
      try { send({ type: "action", action: actionData }); }
      catch (error) { clearTimeout(timer); pendingAction = null; resolve({ ok: false, error: { code: "CONNECTION_LOST", message: error.message, retryable: false }, notifications: [] }); }
    });
  }
  function leaveRoom() {
    if (connectionTimer) clearTimeout(connectionTimer);
    connectionTimer = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    socket = null; started = false; latestView = null;
    return Promise.resolve({ ok: true, data: { released: false } });
  }
  function submitAugment(choice) {
    if (!started) return;
    try { send({ type: "pick_augment", choice }); } catch {}
  }

  window.gameAdapter = Object.freeze({
    startMatch, submitAction, leaveRoom, submitAugment,
    subscribePlayerViews: (listener) => { listeners.views.add(listener); return () => listeners.views.delete(listener); },
    subscribeNotifications: (listener) => { listeners.notifications.add(listener); return () => listeners.notifications.delete(listener); },
    subscribeMatchResults: (listener) => { listeners.results.add(listener); return () => listeners.results.delete(listener); },
    subscribeConnectionStates: (listener) => { listeners.states.add(listener); return () => listeners.states.delete(listener); },
    subscribeAugmentEvents: (listener) => { listeners.augment.add(listener); return () => listeners.augment.delete(listener); },
    resourceValue: (type) => resourceValues[type] || resourceValues[String(type).toLowerCase()] || 0,
  });
})();
