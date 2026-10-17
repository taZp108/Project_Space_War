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
let connectionNotice = "MOCK ONLY — no connection request was sent.";
let lobbyState = null;
let joinCodeValue = "";
let lobbyBusy = false;
let lobbyError = null;
let playerView = null;
let matchResult = null;
let matchLinkLost = false;
let matchLinkNotice = "The match result is unconfirmed. A lost local connection does not establish a winner.";
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

const helpTopics = [
  {
    title: "Objective / Victory", tag: "01 / WIN CONDITION", cost: "—",
    condition: "Explore planets, mine resources, and bring cargo to Earth.",
    result: "Reach 500 Earth storage points to win immediately after Deposit.",
    hidden: "Only the server confirms the match result.",
  },
  {
    title: "Map & Coordinates", tag: "02 / NAVIGATION", cost: "—",
    condition: "Coordinates run from 0 to 99. X increases right; Y increases down. Map edges are hard boundaries.",
    result: "Distance uses Manhattan steps: horizontal plus vertical distance.",
    hidden: "Unknown cells show no planet glyph or planet presence.",
  },
  {
    title: "Turn, AP & Battery", tag: "03 / RESOURCES", cost: "Action dependent",
    condition: "A turn has up to 5 AP. Each action also uses its listed battery cost.",
    result: "Your turn ends when AP runs out or when you choose End Turn.",
    hidden: "Battery reaching 0 means defeat, confirmed by the server. The UI never ends a turn automatically.",
  },
  {
    title: "Move", tag: "04 / NAVIGATION", cost: "1 AP · 2 battery",
    condition: "Choose one of the four cardinal directions. Movement is one cell and cannot cross the map edge.",
    result: "The server reports the accepted position change.",
    hidden: "Movement does not reveal unknown planets around you.",
  },
  {
    title: "Observe", tag: "05 / SCAN", cost: "1 AP · 1 battery",
    condition: "Use to scan within radius 3.",
    result: "Returns locations and types of planets in range.",
    hidden: "Only planets returned by the scan become known to you.",
  },
  {
    title: "ScanArea", tag: "06 / SCAN", cost: "2 AP · 3 battery",
    condition: "Use to scan within radius 8.",
    result: "Returns locations and types of planets in range.",
    hidden: "It does not reveal planets outside the scan result.",
  },
  {
    title: "ScanNearest", tag: "07 / INTELLIGENCE", cost: "2 AP · 3 battery",
    condition: "Search for the nearest planet that still has resources.",
    result: "Returns an eight-direction heading and distance.",
    hidden: "It never returns the planet's exact coordinates.",
  },
  {
    title: "ScanOpponent", tag: "08 / INTELLIGENCE", cost: "3 AP · 3 battery",
    condition: "Scan for the other ship.",
    result: "Returns a heading, or HERE if both ships share a cell. The opponent is notified they were scanned.",
    hidden: "The opponent's coordinates are never shown.",
  },
  {
    title: "Mine", tag: "09 / RESOURCES", cost: "2 AP · 1 battery",
    condition: "Stand on a planet with remaining stock and have cargo space.",
    result: "Takes up to 5 units, limited by remaining stock and free cargo space.",
    hidden: "Stock is visible only while your ship is on that planet.",
  },
  {
    title: "Cargo", tag: "10 / STORAGE", cost: "Capacity: 50 units",
    condition: "Cargo counts resource units, not their point value.",
    result: "Each resource unit occupies one cargo space.",
    hidden: "Cargo is separate from your Earth storage score.",
  },
  {
    title: "Deposit", tag: "11 / EARTH", cost: "1 AP · 0 battery on Earth; otherwise 2",
    condition: "Deposit at Earth or within 1–5 Manhattan cells of Earth.",
    result: "Moves all cargo into your own Earth storage without loss; victory is checked after Deposit.",
    hidden: "Each player has a separate Earth storage and score.",
  },
  {
    title: "Recharge", tag: "12 / EARTH", cost: "1 AP · 0 battery",
    condition: "Recharge only while at Earth, using resources in your Earth storage.",
    result: "Each point of resource value converts to 2 battery. Battery above its maximum is lost.",
    hidden: "Recharge spends stored resources and can lower your Earth score.",
  },
  {
    title: "End Turn", tag: "13 / TURN CONTROL", cost: "0 AP · 0 battery",
    condition: "Choose it whenever you want to end your turn early.",
    result: "The next turn starts after the server confirms the change.",
    hidden: "The client will not send this automatically when AP reaches zero.",
  },
  {
    title: "Fog of War", tag: "14 / INTELLIGENCE", cost: "—",
    condition: "Each player has their own discovered-planet information.",
    result: "Sector overview shows Earth, your ship, and planets you have validly discovered.",
    hidden: "Unknown cells reveal no planet; old stock is not treated as current stock. Opponent coordinates remain hidden.",
  },
  {
    title: "Round Limit", tag: "15 / MATCH END", cost: "100 rounds maximum",
    condition: "A round consists of Player 1's turn followed by Player 2's turn.",
    result: "At the limit, higher Earth storage score wins; equal scores draw.",
    hidden: "The server supplies the final result.",
  },
  {
    title: "Disconnect", tag: "16 / CONNECTION", cost: "—",
    condition: "A local connection loss does not establish that the opponent lost.",
    result: "The client requests an authoritative result when possible.",
    hidden: "If the result cannot be verified, the UI says so instead of guessing.",
  },
];

function homeScreen() {
  return `
    <section class="home-screen">
      <div class="home-copy">
        <span class="eyebrow amber-eyebrow">TACTICAL NETWORK // HUMAN OPERATED</span>
        <h1>Command<br /><span>the unknown.</span></h1>
        <p class="welcome-copy">A two-player expedition across an uncharted sector. Explore, collect resources, and bring them home.</p>
        <div class="home-signature"><span class="signature-line"></span><span>SPACE WAR / PVP STRATEGY</span></div>
      </div>
      <nav class="menu-panel panel" aria-label="Main menu">
        <div class="panel-heading"><div><span class="eyebrow">COMMAND DECK</span><h2>Select destination</h2></div><span class="panel-code">MENU.01</span></div>
        <div class="menu-list">
          <button class="menu-button menu-primary" data-screen="lobby"><span class="menu-index">01</span><span class="menu-label">MULTIPLAYER</span><span class="menu-arrow" aria-hidden="true">→</span></button>
          <button class="menu-button" data-screen="help"><span class="menu-index">02</span><span class="menu-label">HOW TO PLAY</span><span class="menu-arrow" aria-hidden="true">→</span></button>
          <button class="menu-button" data-screen="settings"><span class="menu-index">03</span><span class="menu-label">SETTINGS</span><span class="menu-arrow" aria-hidden="true">→</span></button>
          <button class="menu-button menu-exit" data-action="exit"><span class="menu-index">04</span><span class="menu-label">EXIT</span><span class="menu-arrow" aria-hidden="true">↗</span></button>
        </div>
        <div class="menu-footnote"><span class="live-mark"></span> LOCAL INTERFACE READY <span class="menu-footnote-right">MOCK BUILD / 0.2</span></div>
      </nav>
      <div class="home-coordinate coordinate-top">SECTOR // UNCHARTED</div>
      <div class="home-coordinate coordinate-bottom">NO SIGNAL / AWAITING OPERATOR</div>
      <div class="home-orbit" aria-hidden="true"><span></span><i></i></div>
    </section>`;
}

function helpScreen() {
  const cards = helpTopics.map((topic) => `
    <article class="help-card panel">
      <div class="help-card-heading"><span class="eyebrow">${topic.tag}</span><span class="help-cost">${topic.cost}</span></div>
      <h2>${topic.title}</h2>
      <dl>
        <div><dt>USE / CONDITION</dt><dd>${topic.condition}</dd></div>
        <div><dt>SERVER RESULT</dt><dd>${topic.result}</dd></div>
        <div><dt>INFO BOUNDARY</dt><dd>${topic.hidden}</dd></div>
      </dl>
    </article>`).join("");

  return `
    <section class="content-screen help-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">FIELD MANUAL // OPERATOR REFERENCE</span><h1 id="screen-title">How to <span>play</span></h1><p>Rules at a glance. The server remains the authority for every action and result.</p></div>
        <button class="utility-button" data-screen="home">← <span>BACK TO MENU</span></button>
      </div>
      <div class="help-grid">${cards}</div>
      <p class="screen-footnote">GAMEPLAY VALUES SHOWN ARE FROM THE CURRENT SPECIFICATION. SERVER RESPONSE IS AUTHORITATIVE.</p>
    </section>`;
}

function settingsScreen() {
  return `
    <section class="content-screen settings-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">OPERATOR PROFILE // LOCAL PREFERENCES</span><h1 id="screen-title">System <span>settings</span></h1><p>These preferences affect presentation only. No gameplay state is changed.</p></div>
        <button class="utility-button" data-screen="home">← <span>BACK TO MENU</span></button>
      </div>
      <div class="settings-layout">
        <section class="settings-group panel" aria-labelledby="display-title">
          <div class="panel-heading"><div><span class="eyebrow">01 / ACCESSIBILITY</span><h2 id="display-title">Display & sound</h2></div><span class="panel-code">LOCAL</span></div>
          <div class="setting-row"><div class="setting-copy"><label for="font-size">Font size</label><p>Adjust interface text scale.</p></div><div class="setting-control range-control"><input id="font-size" type="range" min="14" max="22" step="1" value="${settings.fontSize}" /><output id="font-size-output" for="font-size">${settings.fontSize}px</output></div></div>
          <div class="setting-row"><div class="setting-copy"><label for="sound-toggle">Sound</label><p>Play short interface tones after mock action responses.</p></div><label class="toggle"><input id="sound-toggle" type="checkbox" ${settings.sound ? "checked" : ""} /><span class="toggle-track" aria-hidden="true"></span><span class="toggle-value">${settings.sound ? "ON" : "OFF"}</span></label></div>
          <div class="setting-row"><div class="setting-copy"><label for="volume">Volume</label><p>Set the level of interface feedback tones.</p></div><div class="setting-control range-control"><input id="volume" type="range" min="0" max="100" step="1" value="${settings.volume}" /><output id="volume-output" for="volume">${settings.volume}%</output></div></div>
          <div class="setting-row"><div class="setting-copy"><label for="reduced-motion">Reduced motion</label><p>Reduce decorative motion and transitions.</p></div><label class="toggle"><input id="reduced-motion" type="checkbox" ${settings.reducedMotion ? "checked" : ""} /><span class="toggle-track" aria-hidden="true"></span><span class="toggle-value">${settings.reducedMotion ? "ON" : "OFF"}</span></label></div>
        </section>
        <section class="settings-group panel" aria-labelledby="network-title">
          <div class="panel-heading"><div><span class="eyebrow">02 / NETWORK PROFILE</span><h2 id="network-title">Server address</h2></div><span class="panel-code">MOCK</span></div>
          <div class="network-settings">
            <label class="field-label" for="server-address">SERVER ADDRESS</label>
            <input class="text-field" id="server-address" type="text" autocomplete="url" spellcheck="false" />
            <button class="secondary-button" data-action="test-connection">TEST CONNECTION <span aria-hidden="true">↗</span></button>
            <p class="mock-callout"><span aria-hidden="true">i</span> TEST CONNECTION IS SIMULATED. NO SERVER REQUEST WILL BE SENT.</p>
            <p class="connection-notice" id="connection-notice" role="status" aria-live="polite">${connectionNotice}</p>
          </div>
        </section>
      </div>
      <p class="screen-footnote">PREFERENCES ARE SAVED LOCALLY IN THIS BROWSER. SERVER ADDRESS HAS NO EFFECT UNTIL NETWORK SUPPORT IS IMPLEMENTED.</p>
    </section>`;
}

function lobbyHomeScreen() {
  return `
    <section class="content-screen lobby-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">MULTIPLAYER // ROOM ACCESS</span><h1 id="screen-title">Establish a <span>link.</span></h1><p>Create a room and share its code, or join another operator's room.</p></div>
        <button class="utility-button" data-screen="home">← <span>BACK TO MENU</span></button>
      </div>
      <div class="lobby-choice-grid">
        <article class="lobby-action panel"><span class="panel-code">ROOM HOST / 01</span><span class="lobby-symbol" aria-hidden="true">＋</span><h2>Create Room</h2><p>Create a private mock room code and wait for a second operator.</p><button class="primary-button" data-action="create-room">CREATE ROOM <span aria-hidden="true">→</span></button></article>
        <article class="lobby-action panel"><span class="panel-code">ROOM ACCESS / 02</span><span class="lobby-symbol amber-symbol" aria-hidden="true">⌁</span><h2>Join Room</h2><p>Enter the Room Code shared by the room host.</p><button class="secondary-button" data-screen="join-room">ENTER ROOM CODE <span aria-hidden="true">→</span></button></article>
      </div>
      <div class="mock-banner"><span class="mock-banner-mark">MOCK</span><span>Lobby actions are simulated locally. No server connection or room is created.</span></div>
    </section>`;
}

function joinRoomScreen(errorResult = null) {
    const errorMarkup = errorResult ? `
    <div class="room-error" role="alert">
      <div class="error-heading"><span class="error-symbol" aria-hidden="true">!</span><div><strong>${escapeHtml(errorResult.details?.title || errorResult.code)}</strong><span>${escapeHtml(errorResult.code)}</span></div></div>
      <p>${escapeHtml(errorResult.message)}</p><p class="error-hint">${escapeHtml(errorResult.details?.hint || "Review the room code and retry.")}</p>
    </div>` : "";
  return `
    <section class="content-screen join-screen" aria-labelledby="screen-title">
      <div class="screen-heading">
        <div><span class="eyebrow amber-eyebrow">MULTIPLAYER // ROOM ACCESS</span><h1 id="screen-title">Join a <span>room.</span></h1><p>Enter the host's Room Code to request access.</p></div>
        <button class="utility-button" data-screen="lobby">← <span>BACK</span></button>
      </div>
      <form class="join-form panel" id="join-form">
        <label class="field-label" for="room-code">ROOM CODE</label>
        <input class="room-code-input" id="room-code" name="room-code" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="e.g. MOCK-7K2Q" value="${escapeHtml(joinCodeValue)}" ${lobbyBusy ? "disabled" : ""} />
        <p class="field-note">MOCK FIXTURE: MOCK-7K2Q joins. FULL-0000 and LINK-0000 demonstrate errors.</p>
        ${errorMarkup}
        <div class="join-actions"><button class="primary-button" type="submit" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "CHECKING MOCK ROOM…" : "JOIN ROOM"}<span aria-hidden="true">→</span></button><button class="utility-button" type="button" data-screen="lobby" ${lobbyBusy ? "disabled" : ""}>CANCEL</button></div>
      </form>
      <p class="screen-footnote">ROOM CODES AND ERROR REASONS ON THIS SCREEN ARE MOCK DATA.</p>
    </section>`;
}

function creatingRoomScreen() {
  return `
    <section class="content-screen initializing-screen" aria-live="polite"><div class="initializing-card panel"><span class="eyebrow amber-eyebrow">ROOM SERVICE // MOCK</span><span class="initializing-mark" aria-hidden="true">⌁</span><h1>Requesting a <span>room.</span></h1><p>Waiting for the mock response…</p></div></section>`;
}

function waitingRoomScreen() {
  const status = lobbyBusy ? "WAITING FOR MOCK RESPONSE…" : "WAITING FOR SECOND PLAYER";
  return `
    <section class="content-screen waiting-screen" aria-labelledby="screen-title">
      <div class="waiting-layout panel">
        <div class="waiting-main">
          <span class="eyebrow amber-eyebrow">MULTIPLAYER // ROOM HOST</span>
          <h1 id="screen-title">Room <span>ready.</span></h1>
          <p class="waiting-description">Share this code with the other player. The match starts when both players are connected.</p>
          <span class="field-label">ROOM CODE <span class="mock-inline">MOCK</span></span>
          <div class="room-code-display" id="created-room-code">${lobbyState?.roomCode || "—"}</div>
          <button class="copy-button" data-action="copy-room">▣ <span>COPY CODE</span></button>
          <p class="copy-notice" id="copy-notice" role="status" aria-live="polite">Use Copy Code to share this mock room code.</p>
          <div class="player-wait-state"><span class="wait-ring" aria-hidden="true"></span><div><strong>${status}</strong><span>Room remains active until the mock cancel response.</span></div></div>
          <div class="waiting-actions"><button class="utility-button" data-action="cancel-room" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "WAITING FOR RESPONSE…" : "CANCEL ROOM"}</button></div>
        </div>
        ${window.mockDemoAdapter ? `<aside class="demo-controls"><span class="eyebrow">DEMO CONTROLS</span><p>Simulate events normally received from another player or the server.</p><button class="secondary-button" data-action="simulate-join" ${lobbyBusy ? "disabled" : ""}>SIMULATE PLAYER JOIN <span aria-hidden="true">→</span></button><button class="utility-button demo-link-button" data-action="simulate-link-loss" ${lobbyBusy ? "disabled" : ""}>SIMULATE LINK LOST</button><span class="panel-code">MOCK ONLY / NO NETWORK</span></aside>` : ""}
      </div>
      <p class="screen-footnote">NO READY OR START BUTTON. THE MATCH TRANSITION IS AUTOMATIC AFTER THE MOCK REPORTS BOTH PLAYERS CONNECTED.</p>
    </section>`;
}

function linkLostScreen() {
  return `
    <section class="content-screen link-lost-screen" aria-labelledby="screen-title">
      <div class="link-lost-card panel"><span class="eyebrow danger-eyebrow">MULTIPLAYER // LINK LOST</span><span class="link-lost-icon" aria-hidden="true">×</span><h1 id="screen-title">Connection <span>interrupted.</span></h1><p>${matchLinkLost ? matchLinkNotice : "The mock lobby connection was lost. Room state is unconfirmed; this screen does not claim the room was released."}</p><div class="link-lost-actions">${matchLinkLost ? `<button class="primary-button" data-action="check-match-result" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "CHECKING RESULT…" : "CHECK MATCH RESULT"}</button>` : `<button class="primary-button" data-action="retry-lobby" ${lobbyBusy ? "disabled" : ""}>${lobbyBusy ? "WAITING FOR MOCK RESPONSE…" : "RETRY"}</button>`}<button class="utility-button" data-screen="home" ${lobbyBusy ? "disabled" : ""}>BACK TO MENU</button></div><p class="screen-footnote">MOCK LINK STATE / ${matchLinkLost ? "MATCH RESULT NOT VERIFIED" : "ROOM RELEASE NOT CONFIRMED"}</p></div>
    </section>`;
}

function matchResultScreen() {
  const result = matchResult || {};
  const verified = result.verified === true;
  const outcome = verified ? (result.outcome || "Outcome unavailable") : "Result unverified";
  const fields = [
    ["REASON", result.reason], ["EVENT CODE", result.eventCode],
    ["YOUR SCORE", result.playerScore], ["OPPONENT SCORE", result.opponentScore],
    ["ROUNDS", result.rounds], ["TOTAL DEPOSITED", result.totalDeposited],
  ].filter(([, value]) => value !== undefined && value !== null);
  const details = fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  return `<section class="content-screen result-screen" aria-labelledby="screen-title"><article class="match-result-card panel ${verified ? "result-verified" : "result-unverified"}"><span class="eyebrow ${verified ? "amber-eyebrow" : "danger-eyebrow"}">MULTIPLAYER // ${verified ? "SERVER RESULT" : "RESULT STATUS"}</span><span class="result-mark" aria-hidden="true">${verified ? "✦" : "?"}</span><h1 id="screen-title">${escapeHtml(outcome)}</h1><p>${verified ? "This mock result was explicitly supplied as verified." : "The available response did not verify an outcome. No winner or score is inferred."}</p>${details ? `<dl class="match-result-details">${details}</dl>` : ""}<div class="link-lost-actions"><button class="primary-button" data-action="copy-match-summary">COPY MATCH SUMMARY</button><button class="utility-button" data-screen="home">BACK TO MENU</button></div><p class="summary-notice" role="status" aria-live="polite">${escapeHtml(summaryNotice || (verified ? "MOCK FIXTURE / VERIFIED RESULT" : "MOCK FIXTURE / OUTCOME UNKNOWN"))}</p></article></section>`;
}

function matchDemoControls() {
  if (!window.mockDemoAdapter) return "";
  return `<aside class="match-demo-controls panel"><span class="eyebrow">RESULT / CONNECTION FIXTURES</span><p>Local mock fixtures for reviewing verified outcomes and disconnect behavior.</p><div class="match-demo-buttons"><button data-action="result-fixture" data-outcome="victory">VICTORY</button><button data-action="result-fixture" data-outcome="defeat">DEFEAT</button><button data-action="result-fixture" data-outcome="draw">DRAW</button><button data-action="result-fixture" data-outcome="unknown">UNVERIFIED</button><button data-action="match-link-loss">SIMULATE LINK LOST</button></div></aside>`;
}

function matchResultSummary(result) {
  const lines = [`SPACE WAR MATCH SUMMARY`, `STATUS: ${result.verified === true ? "VERIFIED" : "UNVERIFIED"}`];
  if (result.outcome !== undefined) lines.push(`RESULT: ${result.outcome}`);
  for (const [label, key] of [["REASON", "reason"], ["EVENT CODE", "eventCode"], ["YOUR SCORE", "playerScore"], ["OPPONENT SCORE", "opponentScore"], ["ROUNDS", "rounds"], ["TOTAL DEPOSITED", "totalDeposited"]]) {
    if (result[key] !== undefined && result[key] !== null) lines.push(`${label}: ${result[key]}`);
  }
  return lines.join("\n");
}

function initializingScreen() {
  return `
    <section class="content-screen initializing-screen" aria-live="polite"><div class="initializing-card panel"><span class="eyebrow amber-eyebrow">MATCH HANDSHAKE // MOCK</span><span class="initializing-mark" aria-hidden="true">⊕</span><h1>Players <span>connected.</span></h1><p>Initializing match interface…</p></div></section>`;
}

function renderMapPreview(view) {
  return `
    <div class="map-canvas-wrap"><canvas id="tactical-canvas" class="tactical-canvas" tabindex="0" role="img" aria-label="Tactical map viewport. Click a cell to select it; drag to pan; use the wheel to zoom. With keyboard focus, arrow keys pan and Enter selects the center cell."></canvas></div>
    <div class="map-legend" aria-label="Map legend"><span><b class="legend-earth">⊕</b> EARTH</span><span><b class="legend-ship">▲</b> YOUR SHIP</span><span><b class="legend-mining">◆</b> MINING</span><span><b class="legend-energy">◇</b> ENERGY</span><span><b class="legend-rare">◈</b> RARE</span><span>UNKNOWN CELLS BLANK</span></div>`;
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
    return `<div class="target-empty"><span class="target-crosshair" aria-hidden="true">＋</span><strong>SELECT A CELL</strong><span>No target selected</span></div>`;
  }
  const info = getCellInfo(view, selectedCell);
  if (info.status === "KNOWN PLANET") {
    const planet = info.object;
    const stock = selectedCell.x === view.player.position.x && selectedCell.y === view.player.position.y
      ? view.player.currentPlanetStock
      : null;
    const stockValue = stock
      ? (Object.entries(stock).filter(([, amount]) => amount > 0).map(([type, amount]) => `${type} ${amount}`).join(" · ") || "EMPTY")
      : selectedCell.x === view.player.position.x && selectedCell.y === view.player.position.y
        ? "UNKNOWN · not provided in mock view"
        : "UNKNOWN · ship not on planet";
    return `<div class="target-state target-known"><span class="target-glyph" aria-hidden="true">◆</span><div><span class="field-label">CELL STATUS</span><strong>${info.status}</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y}) · ${planet.id}</span></div></div><dl class="target-details"><div><dt>TYPE</dt><dd>${planet.type}</dd></div><div><dt>DISCOVERED BY</dt><dd>${planet.discoveredBy}</dd></div><div><dt>STOCK</dt><dd class="unknown-value">${stockValue}</dd></div></dl>`;
  }
  const glyph = info.status === "EARTH" ? "⊕" : info.status === "OWN SHIP" ? "▲" : "□";
  return `<div class="target-state ${info.status === "UNKNOWN" ? "target-unknown" : ""}"><span class="target-glyph" aria-hidden="true">${glyph}</span><div><span class="field-label">CELL STATUS</span><strong>${info.status}</strong><span class="target-coordinate">(${selectedCell.x}, ${selectedCell.y})</span></div></div>${info.status === "UNKNOWN" ? '<p class="target-note">No object information is available for this cell.</p>' : ""}`;
}

const commandDefinitions = [
  ["MOVE", "1 AP · 2 BAT", "Choose one adjacent cell."],
  ["OBSERVE", "1 AP · 1 BAT", "Scan within radius 3."],
  ["SCAN_AREA", "2 AP · 3 BAT", "Scan within radius 8."],
  ["SCAN_NEAREST", "2 AP · 3 BAT", "Get heading and distance only."],
  ["SCAN_OPPONENT", "3 AP · 3 BAT", "Get heading only; no coordinates."],
  ["MINE", "2 AP · 1 BAT", "Requires a planet and free cargo."],
  ["DEPOSIT", "1 AP · 0–2 BAT", "Send all cargo to Earth storage."],
  ["RECHARGE", "1 AP · 0 BAT", "Spend selected Earth resources."],
  ["END_TURN", "0 AP · 0 BAT", "End your turn early."],
];

function commandEchoMarkup() {
  if (!commandEcho) return "";
  const outcome = commandEcho.ok ? "CONFIRMED" : "REJECTED";
  const tone = commandEcho.ok ? "echo-accepted" : "echo-rejected";
  return `<div class="command-echo ${tone}" role="status"><span class="echo-label">COMMAND ECHO / ${outcome}</span><strong>${escapeHtml(commandEcho.action.replaceAll("_", " "))}</strong><span>${escapeHtml(commandEcho.target)} · ${escapeHtml(commandEcho.code)}</span><p>${escapeHtml(commandEcho.message)}</p></div>`;
}

function toastMarkup() {
  if (!activeToast) return "";
  const repeat = activeToast.count > 1 ? `<span class="toast-count">×${activeToast.count}</span>` : "";
  const role = activeToast.level === "warning" || activeToast.level === "error" ? "alert" : "status";
  return `<article class="terminal-toast toast-${activeToast.level}" role="${role}"><span class="toast-level">${activeToast.level.toUpperCase()}</span><div><strong>${escapeHtml(activeToast.title)}</strong><p>${escapeHtml(activeToast.message)}</p></div>${repeat}<button type="button" data-action="dismiss-toast" aria-label="Dismiss notification">×</button></article>`;
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
  if (!response.ok) return `${response.error.code} · ${response.error.message}`;
  const report = response.actionReport || {};
  const result = report.result || {};
  if (result.kind === "Moved") return `Moved to (${result.position.x}, ${result.position.y}).`;
  if (result.kind === "PlanetsFound") return result.planets.length ? `${result.planets.length} new planet signal${result.planets.length === 1 ? "" : "s"} acquired.` : "Scan complete; no new planets found.";
  if (result.kind === "Mined") return `Recovered ${result.amount} ${result.resource}.`;
  if (result.kind === "Deposited") return `Cargo deposited; +${result.scoreAdded} Earth score.`;
  if (result.kind === "Recharged") return `Battery +${result.batteryAdded}; spent ${result.amount} ${result.resource}.`;
  if (result.kind === "TurnEnded") return "Turn ended; awaiting opponent.";
  return report.message || `${action.replaceAll("_", " ")} complete.`;
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
      title: discovered ? "PLANETARY SIGNAL ACQUIRED" : `${action.replaceAll("_", " ")} CONFIRMED`,
      message: discovered ? `${found.length} new planet signal${found.length === 1 ? "" : "s"} added to your view.` : report.message,
      code: discovered ? "PLANET_DISCOVERED" : report.code,
    });
    for (const notice of response.notifications || []) {
      showAdapterNotification(notice);
    }
  } else {
    enqueueToast({ level: "warning", title: "ACTION REJECTED", message: `${response.error.code} · ${response.error.message}`, code: response.error.code });
  }
  playFeedbackTone(response.ok);
}

function commandSummaryMarkup(view) {
  const locked = actionFlow.status === "pending" || !view.turn.isMyTurn;
  const commands = commandDefinitions.map(([name, cost, hint]) => `
    <button class="command-option" type="button" data-command="${name}" ${locked ? "disabled" : ""} aria-pressed="${actionFlow.selected === name}">
      <strong>${name.replaceAll("_", " ")}</strong><span>${cost}</span><small>${hint}</small>
    </button>`).join("");
  const selected = actionFlow.selected;
  let detail = "<p class=\"command-note\"><span class=\"notice-icon\" aria-hidden=\"true\">◇</span><span>Select a command to review its target and cost. MOCK ONLY.</span></p>";
  if (selected) {
    const target = selected === "MOVE" && selectedCell ? `(${selectedCell.x}, ${selectedCell.y})` : selected === "MOVE" ? "No cell selected" : selected === "DEPOSIT" ? "All cargo" : selected === "RECHARGE" ? "Earth storage" : "—";
    const moveCost = selected === "DEPOSIT" && distanceBetween(view.player.position, view.earth) > 0 ? "1 AP · 2 BAT" : commandDefinitions.find(([name]) => name === selected)?.[1];
    const result = actionFlow.result ? `<div class="action-result ${actionFlow.result.ok ? "result-success" : "result-error"}" role="status"><strong>${actionFlow.result.ok ? "ACTION ACCEPTED" : escapeHtml(actionFlow.result.error.code)}</strong><span>${escapeHtml(actionFlow.result.ok ? actionFlow.result.actionReport?.message || "Action accepted." : actionFlow.result.error.message)}</span></div>` : "";
    const recharge = selected === "RECHARGE" ? rechargeControlsMarkup(view) : "";
    const confirmLabel = ["DEPOSIT", "RECHARGE", "END_TURN"].includes(selected) ? "REVIEW & CONFIRM" : "SEND MOCK COMMAND";
    const pendingMarkup = actionFlow.status === "pending" ? `<div class="action-pending" role="status" aria-live="polite"><span class="wait-ring" aria-hidden="true"></span><span>WAITING FOR MOCK RESPONSE… Gameplay commands are locked.</span></div>` : "";
    const isModal = actionFlow.status === "confirming";
    detail = `
      <div class="action-summary"><div class="action-summary-heading"><span class="field-label">ACTION SUMMARY</span><strong>${selected.replaceAll("_", " ")}</strong></div>
        <dl><div><dt>TARGET</dt><dd>${escapeHtml(target)}</dd></div><div><dt>COST</dt><dd>${escapeHtml(moveCost || "—")}</dd></div></dl>
        ${recharge}
        ${!isModal && actionFlow.status !== "pending" ? `<div class="action-controls"><button class="primary-button" type="button" data-action="${["DEPOSIT", "RECHARGE", "END_TURN"].includes(selected) ? "review-command" : "send-command"}" ${locked ? "disabled" : ""}>${confirmLabel} <span aria-hidden="true">→</span></button><button class="utility-button" type="button" data-action="clear-command" ${locked ? "disabled" : ""}>CLEAR</button></div>` : ""}
        ${pendingMarkup}${result}
      </div>`;
  }
  return `<div class="command-list">${commands}</div><div class="command-interaction">${detail}${commandEchoMarkup()}</div>`;
}

function distanceBetween(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function rechargeControlsMarkup(view) {
  const storage = view.player.earthStorage || {};
  const resources = Object.keys(storage).filter((type) => storage[type] > 0);
  if (!resources.length) return `<p class="field-note recharge-empty">MOCK EARTH STORAGE HAS NO RESOURCE UNITS AVAILABLE.</p>`;
  if (!resources.includes(rechargeSelection.resource)) rechargeSelection = { resource: resources[0], amount: 1 };
  const amountAvailable = storage[rechargeSelection.resource] || 0;
  rechargeSelection.amount = Math.max(1, Math.min(amountAvailable, Number(rechargeSelection.amount) || 1));
  const points = window.gameAdapter.resourceValue(rechargeSelection.resource) * Number(rechargeSelection.amount) * 2;
  return `<div class="recharge-controls"><label>RESOURCE<select id="recharge-resource">${resources.map((type) => `<option value="${escapeHtml(type)}" ${type === rechargeSelection.resource ? "selected" : ""}>${escapeHtml(type)} · ${storage[type]} units</option>`).join("")}</select></label><label>UNITS<input id="recharge-amount" type="number" min="1" max="${amountAvailable}" step="1" value="${rechargeSelection.amount}" /></label><span class="recharge-preview">UP TO +${points} BAT · −${Number(rechargeSelection.amount) * window.gameAdapter.resourceValue(rechargeSelection.resource)} SCORE</span></div>`;
}

function confirmationDialogMarkup(view) {
  if (actionFlow.status !== "confirming" || !actionFlow.selected) return "";
  const action = actionFlow.selected;
  const args = getActionArgs(action);
  const cost = action === "DEPOSIT" && distanceBetween(view.player.position, view.earth) > 0 ? "1 AP · 2 BAT" : commandDefinitions.find(([name]) => name === action)?.[1];
  let summary = action === "DEPOSIT"
    ? `Deposit all ${view.player.cargoUsed} cargo units into your Earth storage? The score changes only after the mock response.`
    : action === "END_TURN" ? "End your turn now? Gameplay commands will remain locked until the mock response arrives."
      : `Spend ${args.amount} ${args.resource} from Earth storage? Battery above maximum is lost.`;
  return `<dialog id="action-confirm-dialog" class="terminal-dialog action-confirm-dialog" aria-labelledby="action-confirm-title"><div class="dialog-card panel"><span class="eyebrow amber-eyebrow">COMMAND REVIEW // MOCK ONLY</span><h2 id="action-confirm-title">Confirm ${action.replaceAll("_", " ")}</h2><p>${escapeHtml(summary)}</p><div class="confirmation-cost"><span>COST</span><strong>${escapeHtml(cost || "—")}</strong></div><div class="action-controls"><button class="primary-button" type="button" data-action="confirm-command">CONFIRM & SEND</button><button class="utility-button" type="button" data-action="cancel-confirmation">CANCEL</button></div><p class="screen-footnote">No gameplay state changes until the mock adapter responds.</p></div></dialog>`;
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
  const cargoRows = cargoItems.map(([name, amount]) => `<li><span>${name}</span><b>${amount}</b></li>`).join("");
  const apWidth = Math.round((player.ap / player.apMax) * 100);
  const batteryWidth = Math.round((player.battery / player.batteryMax) * 100);
  const cargoWidth = Math.round((player.cargoUsed / player.cargoCapacity) * 100);
  const scoreWidth = Math.round((player.earthScore / player.earthScoreTarget) * 100);
  const selectedInfo = getCellInfo(view, selectedCell);
  const allEvents = [...localActionEvents, ...view.recentEvents];
  const events = allEvents.slice(0, eventLogExpanded ? 40 : 4).map((event) => `
    <li class="event-row event-${event.kind.toLowerCase()}">
      <time>[${event.time}]</time><span class="event-kind">[${event.kind}]</span><div><code>${event.code}</code><p>${event.text}</p></div>
    </li>`).join("");
  const overviewMarkup = sectorOverviewOpen ? `
    <dialog id="sector-overview" class="sector-dialog" aria-labelledby="overview-title">
      <div class="overview-dialog-panel panel">
        <div class="panel-heading"><div><span class="eyebrow amber-eyebrow">SECTOR OVERVIEW // MOCK</span><h2 id="overview-title">Full sector</h2></div><button class="utility-button" data-action="close-overview" autofocus>CLOSE <span aria-hidden="true">×</span></button></div>
        <p class="overview-note">Coordinates 0–99 · X increases right · Y increases down. Only Earth, your ship, and discovered planets are shown. Unexplored locations remain unknown. Click selection is disabled in overview.</p>
        <div class="overview-canvas-wrap"><canvas id="overview-canvas" class="overview-canvas" role="img" aria-label="Sector overview showing Earth, your ship, and discovered planets only. This overview does not allow cell selection."></canvas></div>
        <div class="map-legend"><span><b class="legend-earth">⊕</b> EARTH</span><span><b class="legend-ship">▲</b> YOUR SHIP</span><span><b class="legend-mining">◆</b> MINING</span><span><b class="legend-energy">◇</b> ENERGY</span><span><b class="legend-rare">◈</b> RARE</span><span>UNKNOWN CELLS BLANK</span></div>
      </div>
    </dialog>` : "";

  return `
    <section class="game-screen" aria-label="Mock match interface">
      <div class="game-turnbar panel"><div class="turn-readout"><span class="eyebrow">ROUND</span><strong>${String(view.turn.round).padStart(2, "0")} <small>/ ${view.turn.roundMax}</small></strong></div><div class="turn-divider"></div><div class="turn-status"><span class="status-indicator"></span><div><strong>${view.turn.isMyTurn ? "YOUR TURN" : "OPPONENT TURN"}</strong><span>${view.turn.activePlayer.toUpperCase()} ACTIVE · MOCK VIEW</span></div></div><div class="turn-right"><span class="field-label">SESSION</span><strong>MATCH / DEMO</strong><button class="utility-button game-leave-button" data-action="leave-room" ${lobbyBusy || pendingAction ? "disabled" : ""}>LEAVE MOCK MATCH</button></div></div>
      <div id="toast-region" class="toast-region" aria-live="polite" ${activeToast ? "" : "hidden"}>${toastMarkup()}</div>
      <div class="game-grid">
        <aside class="ship-hud panel" aria-labelledby="ship-hud-title">
          <div class="panel-heading"><div><span class="eyebrow">FLIGHT SYSTEMS</span><h2 id="ship-hud-title">Ship HUD</h2></div><span class="panel-code">P1 / MOCK</span></div>
          <div class="hud-content">
            <section class="hud-position"><span class="field-label">SHIP POSITION</span><strong>(${player.position.x}, ${player.position.y})</strong><span class="position-caption">CURRENT VIEWPOINT</span></section>
            <div class="meter-block"><div class="meter-label"><span>AP</span><strong>${player.ap} <small>/ ${player.apMax}</small></strong></div><div class="meter-track" role="progressbar" aria-label="Action points" aria-valuemin="0" aria-valuemax="${player.apMax}" aria-valuenow="${player.ap}"><span style="width:${apWidth}%"></span></div><span class="meter-caption">ACTION POINTS</span></div>
            <div class="meter-block"><div class="meter-label"><span>BATTERY</span><strong>${player.battery} <small>/ ${player.batteryMax}</small></strong></div><div class="meter-track meter-amber" role="progressbar" aria-label="Battery" aria-valuemin="0" aria-valuemax="${player.batteryMax}" aria-valuenow="${player.battery}"><span style="width:${batteryWidth}%"></span></div><span class="meter-caption">POWER RESERVE</span></div>
            <div class="hud-section-title"><span>CARGO MANIFEST</span><span>${player.cargoUsed} / ${player.cargoCapacity} UNITS</span></div>
            <div class="meter-track cargo-meter" role="progressbar" aria-label="Cargo capacity" aria-valuemin="0" aria-valuemax="${player.cargoCapacity}" aria-valuenow="${player.cargoUsed}"><span style="width:${cargoWidth}%"></span></div>
            <ul class="cargo-list">${cargoRows || "<li><span>EMPTY HOLD</span><b>0</b></li>"}</ul>
            <section class="score-block"><div class="meter-label"><span>EARTH SCORE</span><strong>${player.earthScore} <small>/ ${player.earthScoreTarget}</small></strong></div><div class="meter-track score-meter" role="progressbar" aria-label="Earth score toward victory target" aria-valuemin="0" aria-valuemax="${player.earthScoreTarget}" aria-valuenow="${player.earthScore}"><span style="width:${scoreWidth}%"></span></div><span class="meter-caption">STORED RESOURCES · MOCK</span></section>
          </div>
          <div class="panel-footnote"><span class="footnote-mark">VIEW</span> PLAYER-SCOPED MOCK DATA</div>
        </aside>

        <section class="tactical-panel panel" aria-labelledby="map-title">
          <div class="panel-heading"><div><span class="eyebrow">TACTICAL VIEWPORT // MOCK</span><h2 id="map-title">Sector viewport</h2></div><div class="map-controls"><button class="map-control-button" data-action="reset-to-ship" title="Return camera to your ship">RESET TO SHIP</button><button class="map-control-button" data-action="open-overview">SECTOR OVERVIEW</button></div></div>
          <div class="map-preview">${renderMapPreview(view)}</div>
          <div class="cell-status-strip"><span class="field-label">TARGET CELL</span><strong>${selectedCell ? `(${selectedCell.x}, ${selectedCell.y}) · ${selectedInfo.status}` : "NO CELL SELECTED"}</strong><span id="hover-status" role="status" aria-live="polite">Click selects only · no action sent</span><button class="clear-target-button" data-action="clear-target" ${selectedCell ? "" : "hidden"}>CLEAR TARGET</button></div>
        </section>

        <aside class="target-panel panel" aria-labelledby="target-title">
          <div class="panel-heading"><div><span class="eyebrow">TARGET / INTELLIGENCE</span><h2 id="target-title">Target Panel</h2></div><span class="panel-code">TGT.01</span></div>
          <div class="target-content">${targetPreviewPanel(view)}</div>
          <section class="opponent-status"><div class="opponent-heading"><span class="eyebrow">OPPONENT STATUS</span><span class="panel-code">PUBLIC</span></div><div class="opponent-connection"><span class="status-indicator" aria-hidden="true"></span><strong>${escapeHtml(String(view.opponent?.connection || "unknown").toUpperCase())}</strong><span>PUBLIC VIEW</span></div><p>Turn status: ${escapeHtml(String(view.opponent?.publicStatus || "unknown"))}</p><span class="field-note">No opponent coordinates or private resources shown.</span></section>
        </aside>

        <section class="command-console panel" aria-labelledby="command-title">
          <div class="panel-heading"><div><span class="eyebrow">COMMAND CONSOLE // MOCK</span><h2 id="command-title">Select command</h2></div><span class="panel-code">${actionFlow.status.toUpperCase()}</span></div>
          ${commandSummaryMarkup(view)}
        </section>

        <section class="event-log panel ${eventLogExpanded ? "expanded" : ""}" aria-labelledby="event-log-title">
          <div class="panel-heading"><div><span class="eyebrow">RECENT ACTIVITY // MOCK</span><h2 id="event-log-title">Event Log</h2></div><button class="event-toggle" type="button" data-action="toggle-event-log" aria-expanded="${eventLogExpanded}">${eventLogExpanded ? "COLLAPSE" : "EXPAND"} · ${view.recentEvents.length}</button></div>
          <ol class="event-list">${events}</ol>
          <div class="panel-footnote"><span class="footnote-mark">LOG</span> PLAYER-VISIBLE EVENTS ONLY</div>
        </section>
      </div>
      <div class="game-statusbar"><span><span class="live-mark"></span> MOCK PLAYER VIEW</span><span>${selectedCell ? `TARGET: (${selectedCell.x}, ${selectedCell.y}) / ${selectedInfo.status}` : "SELECT A CELL / TARGET NONE"}</span><span>${view.turn.isMyTurn ? "MOCK ADAPTER / NO NETWORK" : "WAITING FOR OPPONENT MOCK TURN"}</span></div>
      ${window.mockDemoAdapter && !view.turn.isMyTurn && !pendingAction ? `<div class="opponent-turn-control"><span>Mock match is waiting for Player 2.</span><button class="utility-button" data-action="simulate-opponent-turn">SIMULATE OPPONENT TURN</button></div>` : ""}
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
    ? `(${selectedCell.x}, ${selectedCell.y}) · ${info.status}`
    : "NO CELL SELECTED";
  strip.querySelector(".clear-target-button").hidden = !selectedCell;
  statusbar.children[1].textContent = selectedCell
    ? `TARGET: (${selectedCell.x}, ${selectedCell.y}) / ${info.status}`
    : "SELECT A CELL / TARGET NONE";
  const commandPanel = root.querySelector(".command-console");
  if (commandPanel) commandPanel.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">COMMAND CONSOLE // MOCK</span><h2 id="command-title">Select command</h2></div><span class="panel-code">${actionFlow.status.toUpperCase()}</span></div>${commandSummaryMarkup(view)}`;
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
        if (hoverStatus) hoverStatus.textContent = "PAN CAMERA · GAME STATE UNCHANGED";
        drawTacticalMap();
        return;
      }
    }
    hoverCell = cellAtPoint(canvas, event.clientX, event.clientY);
    const hoverStatus = root.querySelector("#hover-status");
    if (hoverStatus) {
      const info = getCellInfo(playerView, hoverCell);
      hoverStatus.textContent = hoverCell ? `HOVER (${hoverCell.x}, ${hoverCell.y}) · ${info.status}` : "OUTSIDE MAP BOUNDS";
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
    if (hoverStatus) hoverStatus.textContent = "Click selects only · no action sent";
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
  matchLinkNotice = "The match result is unconfirmed. A lost local connection does not establish a winner.";
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
  if (runtimeStatus) runtimeStatus.textContent = screen === "home" ? "LOCAL INTERFACE READY" : "LOCAL INTERFACE / MOCK";
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
    const response = { ok: false, error: { code: "TARGET_REQUIRED", message: "Select a target cell first." } };
    actionFlow.result = response;
    actionFlow.status = "error";
    setCommandEcho(action, "No target", response);
    addLocalActionEvent(response.error.code, response.error.message);
    playActionFeedback(action, response, playerView, playerView);
    render("game");
    return;
  }
  if (action === "RECHARGE" && (!Number.isInteger(args.amount) || args.amount < 1)) {
    const response = { ok: false, error: { code: "INVALID_AMOUNT", message: "Choose a positive whole number of units." } };
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
    : action === "RECHARGE" ? `${args.amount} ${args.resource}`
      : action === "DEPOSIT" ? "All cargo to Earth" : action === "END_TURN" ? "Next player" : `From (${previousView.player.position.x}, ${previousView.player.position.y})`;
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
    summaryNotice = "MATCH RESULT RECEIVED";
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
      <span class="eyebrow amber-eyebrow">SESSION CONTROL // EXIT</span>
      <h2>Close this browser tab to exit.</h2>
      <p>This page cannot close a tab that was not opened by the game.</p>
      <button class="secondary-button" value="close">ACKNOWLEDGE</button>
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
    connectionNotice = "MOCK RESULT: no connection request was sent.";
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
    matchLinkNotice = "The mock match connection was lost. No authoritative result is available, so the winner and score remain unknown.";
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
    toggle.textContent = `${eventLogExpanded ? "COLLAPSE" : "EXPAND"} · ${playerView.recentEvents.length + localActionEvents.length}`;
    toggle.setAttribute("aria-expanded", String(eventLogExpanded));
  }
});

async function simulateMockOpponentTurn() {
  if (pendingAction || playerView.turn.isMyTurn) return;
  actionFlow.status = "pending";
  render("game");
  const response = await window.mockDemoAdapter.advanceOpponentTurn();
  if (response.ok) playerView = response.playerView;
  actionFlow = { status: response.ok ? "success" : "error", selected: null, result: response.ok ? { ok: true, actionReport: { message: "Mock opponent turn complete." } } : response };
  if (response.ok) enqueueToast({ level: "info", title: "YOUR TURN ACTIVE", message: "Mock opponent turn complete. AP restored from the new view.", code: "TURN_STARTED" });
  render("game");
}

async function loadMatchResultFixture(outcome) {
  lobbyBusy = true;
  render("game");
  const response = await window.mockDemoAdapter.getResultFixture(outcome);
  lobbyBusy = false;
  if (!response.ok) return;
  matchResult = response.result;
  summaryNotice = "MOCK FIXTURE / RESULT RECEIVED";
  render("match-result");
}

async function checkMatchResultAfterDisconnect() {
  lobbyBusy = true;
  render("link-lost");
  const response = await window.gameAdapter.getMatchResult();
  lobbyBusy = false;
  if (response.ok && response.data?.result) {
    matchResult = response.data.result;
    summaryNotice = "MATCH RESULT RESPONSE RECEIVED";
    render("match-result");
    return;
  }
  matchLinkNotice = response.error
    ? `${response.error.code}: ${response.error.message} The match outcome remains unknown.`
    : "No verified MatchResult was included in the response. The match outcome remains unknown.";
  render("link-lost");
}

async function copyMatchSummary() {
  if (!matchResult) return;
  const summary = matchResultSummary(matchResult);
  try {
    await navigator.clipboard.writeText(summary);
    summaryNotice = "MATCH SUMMARY COPIED.";
  } catch {
    const field = document.createElement("textarea");
    field.value = summary;
    field.setAttribute("aria-label", "Match summary to copy");
    field.className = "summary-copy-fallback";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    if (copied) {
      field.remove();
      summaryNotice = "MATCH SUMMARY COPIED.";
    } else {
      field.focus();
      summaryNotice = "COPY FAILED. The match summary is selected below for manual copying.";
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
    notice.textContent = "ROOM CODE COPIED TO CLIPBOARD.";
    notice.classList.remove("copy-error");
  } catch {
    notice.textContent = "COPY FAILED. Select the code above and copy it manually.";
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
    control.nextElementSibling.nextElementSibling.textContent = settings.sound ? "ON" : "OFF";
    saveSettings();
  } else if (control.id === "reduced-motion") {
    settings.reducedMotion = control.checked;
    control.nextElementSibling.nextElementSibling.textContent = settings.reducedMotion ? "ON" : "OFF";
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
  summaryNotice = "MATCH RESULT RECEIVED";
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
