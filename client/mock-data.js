"use strict";

// MOCK PlayerView only. This object contains only the information shown to this player.
// Do not add hidden planet locations, remote stock, or opponent coordinates here.
window.mockPlayerView = Object.freeze({
  player: Object.freeze({
    position: Object.freeze({ x: 50, y: 51 }),
    ap: 5,
    apMax: 5,
    battery: 84,
    batteryMax: 100,
    cargo: Object.freeze({ Iron: 3, Crystal: 1 }),
    cargoUsed: 4,
    cargoCapacity: 50,
    // MOCK ONLY: the player's private Earth storage, needed to preview Recharge.
    earthStorage: Object.freeze({ Crystal: 24 }),
    earthScore: 72,
    earthScoreTarget: 500,
  }),
  earth: Object.freeze({ x: 50, y: 50 }),
  knownPlanets: Object.freeze([
    Object.freeze({ id: "P-017", type: "Mining", position: Object.freeze({ x: 52, y: 51 }), discoveredBy: "Observe" }),
    Object.freeze({ id: "P-023", type: "Energy", position: Object.freeze({ x: 48, y: 49 }), discoveredBy: "ScanArea" }),
  ]),
  turn: Object.freeze({ activePlayer: "Player 1", round: 7, roundMax: 100, isMyTurn: true }),
  opponent: Object.freeze({ connection: "connected", publicStatus: "waiting" }),
  commandReference: Object.freeze([
    Object.freeze({ name: "MOVE", cost: "1 AP · 2 BAT" }),
    Object.freeze({ name: "OBSERVE", cost: "1 AP · 1 BAT" }),
    Object.freeze({ name: "SCAN AREA", cost: "2 AP · 3 BAT" }),
    Object.freeze({ name: "SCAN NEAREST", cost: "2 AP · 3 BAT" }),
    Object.freeze({ name: "SCAN OPPONENT", cost: "3 AP · 3 BAT" }),
    Object.freeze({ name: "MINE", cost: "2 AP · 1 BAT" }),
    Object.freeze({ name: "DEPOSIT", cost: "1 AP · 0–2 BAT" }),
    Object.freeze({ name: "RECHARGE", cost: "1 AP · 0 BAT" }),
    Object.freeze({ name: "END TURN", cost: "0 AP · 0 BAT" }),
  ]),
  gameStatus: "in-progress",
  recentEvents: Object.freeze([
    Object.freeze({ time: "00:42", kind: "INFO", code: "TURN_STARTED", text: "Your turn is active." }),
    Object.freeze({ time: "00:31", kind: "SCAN", code: "PLANET_DISCOVERED", text: "P-017 · Mining planet discovered." }),
    Object.freeze({ time: "00:18", kind: "INFO", code: "CARGO_UPDATED", text: "Cargo manifest received." }),
  ]),
});
