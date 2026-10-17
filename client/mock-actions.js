"use strict";

// MOCK ONLY: isolated action adapter. It owns the mock authoritative view and
// returns a new view only after an action response. Replace this module for networking.
(() => {
  const resourceValues = { Iron: 1, Crystal: 3, EnergyCore: 5, RareOre: 10, ExoticMatter: 25 };
  // MOCK costs mirror the current UI specification; the real server remains authoritative.
  const costs = {
    MOVE: [1, 2], OBSERVE: [1, 1], SCAN_AREA: [2, 3], SCAN_NEAREST: [2, 3],
    SCAN_OPPONENT: [3, 3], MINE: [2, 1], DEPOSIT: [1, null], RECHARGE: [1, 0], END_TURN: [0, 0],
  };
  // Private mock fixture data; never included in the player view until a valid report reveals it.
  const initialPlanetStock = {
    "P-017": { Iron: 8, Crystal: 3 }, "P-023": { EnergyCore: 5, Iron: 4 },
    "P-031": { RareOre: 4 }, "P-032": { Iron: 12, Crystal: 2 },
  };
  const undiscoveredPlanets = [
    { id: "P-031", type: "Rare", position: { x: 49, y: 52 } },
    { id: "P-032", type: "Mining", position: { x: 44, y: 50 } },
  ];
  let planetStock = structuredClone(initialPlanetStock);
  const initialView = structuredClone(window.mockPlayerView);
  let authoritativeView = structuredClone(initialView);

  function copy(value) { return structuredClone(value); }
  function failure(code, message) {
    return { ok: false, error: { code, message }, view: copy(authoritativeView) };
  }
  function pointValue(resources = {}) {
    return Object.entries(resources).reduce((sum, [type, count]) => sum + (resourceValues[type] || 0) * count, 0);
  }
  function units(resources = {}) { return Object.values(resources).reduce((sum, value) => sum + value, 0); }
  function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function event(targetView, code, text, kind = "INFO") {
    const now = new Date();
    const time = `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    targetView.recentEvents.unshift({ time, kind, code, text });
    targetView.recentEvents = targetView.recentEvents.slice(0, 40);
  }
  function costFor(action, args, view) {
    if (action === "DEPOSIT" && distance(view.player.position, view.earth) > 0) return [1, 2];
    return costs[action] || null;
  }

  async function submit(action, args = {}) {
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    const view = authoritativeView;
    if (view.gameStatus !== "in-progress") return failure("GAME_NOT_IN_PROGRESS", "This mock match is not active.");
    if (!view.turn.isMyTurn) return failure("NOT_YOUR_TURN", "Wait for your turn before sending a command.");
    const cost = costFor(action, args, view);
    if (!cost) return failure("UNKNOWN_ACTION", "The mock adapter does not recognize this command.");
    if (view.player.ap < cost[0]) return failure("NOT_ENOUGH_AP", "Not enough AP for this command.");
    if (cost[1] !== null && view.player.battery < cost[1]) return failure("NOT_ENOUGH_BATTERY", "Not enough battery for this command.");

    const next = copy(view);
    const player = next.player;
    const pos = player.position;
    const addEvent = (code, text, kind) => event(next, code, text, kind);
    let actionResult = { kind: "ActionAccepted" };
    if (action === "MOVE") {
      const target = args.target;
      if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y) || target.x < 0 || target.x > 99 || target.y < 0 || target.y > 99) return failure("OUT_OF_BOUNDS", "Choose a cell inside the 0–99 map.");
      if (distance(pos, target) !== 1) return failure("INVALID_MOVE", "Move requires one adjacent cell in a cardinal direction.");
      player.position = { x: target.x, y: target.y };
      const planet = next.knownPlanets.find((item) => item.position.x === target.x && item.position.y === target.y);
      if (planet) player.currentPlanetStock = copy(planetStock[planet.id] || {});
      else delete player.currentPlanetStock;
      player.ap -= cost[0]; player.battery -= cost[1];
      addEvent("MOVE_CONFIRMED", `Ship moved to (${target.x}, ${target.y}).`, "MOVE");
      actionResult = { kind: "Moved", position: { ...target } };
    } else if (["OBSERVE", "SCAN_AREA", "SCAN_NEAREST", "SCAN_OPPONENT"].includes(action)) {
      player.ap -= cost[0]; player.battery -= cost[1];
      const labels = { OBSERVE: "Observe scan complete.", SCAN_AREA: "Area scan complete.", SCAN_NEAREST: "Nearest-planet scan complete; no exact coordinates returned.", SCAN_OPPONENT: "Opponent scan complete; coordinates remain hidden." };
      addEvent(`${action}_CONFIRMED`, labels[action], "SCAN");
      if (action === "OBSERVE" || action === "SCAN_AREA") {
        const radius = action === "OBSERVE" ? 3 : 8;
        const alreadyKnown = new Set(next.knownPlanets.map((planet) => planet.id));
        const found = undiscoveredPlanets.filter((planet) => !alreadyKnown.has(planet.id) && distance(pos, planet.position) <= radius);
        const discoveredBy = action === "OBSERVE" ? "Observe" : "ScanArea";
        next.knownPlanets.push(...found.map((planet) => ({ ...planet, discoveredBy })));
        for (const planet of found) addEvent("PLANET_DISCOVERED", `${planet.id} · ${planet.type} planet discovered.`, "SCAN");
        actionResult = { kind: "PlanetsFound", planets: found.map((planet) => ({ ...planet, discoveredBy })) };
      } else {
        actionResult = { kind: action === "SCAN_NEAREST" ? "NearestPlanetSignal" : "OpponentSignal" };
      }
    } else if (action === "MINE") {
      const planet = next.knownPlanets.find((item) => item.position.x === pos.x && item.position.y === pos.y);
      if (!planet) return failure("NOT_ON_PLANET", "Mining requires the ship to stand on a known planet.");
      const stock = planetStock[planet.id] || {};
      const available = Object.entries(stock).find(([, count]) => count > 0);
      const free = player.cargoCapacity - player.cargoUsed;
      if (!available || free <= 0) return failure(!available ? "PLANET_EMPTY" : "CARGO_FULL", !available ? "No mock stock remains on this planet." : "Cargo hold is full.");
      const [type, amount] = available;
      const mined = Math.min(5, amount, free);
      stock[type] -= mined;
      player.currentPlanetStock = copy(stock);
      player.cargo[type] = (player.cargo[type] || 0) + mined;
      player.cargoUsed += mined; player.ap -= cost[0]; player.battery -= cost[1];
      addEvent("MINE_CONFIRMED", `Recovered ${mined} ${type}.`, "INFO");
      actionResult = { kind: "Mined", resource: type, amount: mined };
    } else if (action === "DEPOSIT") {
      const range = distance(pos, next.earth);
      if (range > 5) return failure("OUT_OF_DEPOSIT_RANGE", "Earth is outside the 5-cell deposit range.");
      if (units(player.cargo) === 0) return failure("CARGO_EMPTY", "There is no cargo to deposit.");
      const deposited = copy(player.cargo);
      const gained = pointValue(deposited);
      player.earthStorage ||= {};
      for (const [type, amount] of Object.entries(deposited)) player.earthStorage[type] = (player.earthStorage[type] || 0) + amount;
      player.cargo = {}; player.cargoUsed = 0; player.earthScore += gained;
      player.ap -= cost[0]; player.battery -= cost[1];
      addEvent("DEPOSIT_CONFIRMED", `Cargo deposited · +${gained} Earth score.`, "INFO");
      actionResult = { kind: "Deposited", resources: deposited, scoreAdded: gained };
    } else if (action === "RECHARGE") {
      if (distance(pos, next.earth) !== 0) return failure("NOT_AT_EARTH", "Recharge is available only while docked at Earth.");
      if (player.battery >= player.batteryMax) return failure("BATTERY_FULL", "Battery is already at maximum.");
      const type = args.resource;
      const amount = Number(args.amount);
      if (!Number.isInteger(amount) || amount <= 0) return failure("INVALID_AMOUNT", "Choose a positive whole number of resource units.");
      const stock = player.earthStorage?.[type] || 0;
      if (stock < amount) return failure("NOT_ENOUGH_RESOURCES", "Earth storage does not contain that many units.");
      const gained = Math.min(player.batteryMax - player.battery, amount * (resourceValues[type] || 0) * 2);
      player.earthStorage[type] -= amount;
      if (!player.earthStorage[type]) delete player.earthStorage[type];
      player.earthScore -= amount * (resourceValues[type] || 0);
      player.battery += gained; player.ap -= cost[0];
      addEvent("RECHARGE_CONFIRMED", `Battery recharged by ${gained}; Earth storage consumed ${amount} ${type}.`, "INFO");
      actionResult = { kind: "Recharged", batteryAdded: gained, resource: type, amount };
    } else if (action === "END_TURN") {
      player.ap -= cost[0]; player.battery -= cost[1];
      next.turn.isMyTurn = false;
      next.turn.activePlayer = "Player 2";
      next.opponent.publicStatus = "active";
      addEvent("TURN_END_CONFIRMED", "Turn ended. Waiting for the opponent.", "INFO");
      actionResult = { kind: "TurnEnded" };
    }
    authoritativeView = next;
    return { ok: true, report: { action, code: `${action}_CONFIRMED`, message: "Mock server accepted the command.", result: actionResult }, view: copy(authoritativeView) };
  }

  async function simulateOpponentTurn() {
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    const next = copy(authoritativeView);
    if (next.turn.isMyTurn) return { ok: false, view: copy(authoritativeView) };
    next.turn.round = Math.min(next.turn.round + (next.turn.activePlayer === "Player 2" ? 1 : 0), next.turn.roundMax);
    next.turn.activePlayer = "Player 1";
    next.turn.isMyTurn = true;
    next.player.ap = next.player.apMax;
    next.opponent.publicStatus = "waiting";
    authoritativeView = next;
    event(authoritativeView, "TURN_STARTED", "The mock opponent turn ended. Your turn is active.", "INFO");
    return { ok: true, view: copy(authoritativeView) };
  }

  function resetMatch() {
    authoritativeView = copy(initialView);
    planetStock = structuredClone(initialPlanetStock);
    return copy(authoritativeView);
  }

  async function getResultFixture(outcome) {
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    const fixtures = {
      victory: { verified: true, outcome: "Victory", reason: "EARTH_SCORE_TARGET_REACHED", eventCode: "MATCH_WON", playerScore: 500, opponentScore: 438, rounds: 42, totalDeposited: 428 },
      defeat: { verified: true, outcome: "Defeat", reason: "BATTERY_DEPLETED", eventCode: "MATCH_LOST", playerScore: 210, opponentScore: 500, rounds: 61, totalDeposited: 138 },
      draw: { verified: true, outcome: "Draw", reason: "ROUND_LIMIT_REACHED", eventCode: "MATCH_DRAW", playerScore: 472, opponentScore: 472, rounds: 100, totalDeposited: 400 },
      unknown: { verified: false, reason: "RESULT_UNAVAILABLE", eventCode: "MATCH_RESULT_UNVERIFIED" },
    };
    return { ok: true, mock: true, result: copy(fixtures[outcome] || fixtures.unknown) };
  }

  async function checkResultAfterDisconnect() {
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    return { ok: false, mock: true, error: { code: "RESULT_UNAVAILABLE", message: "No authoritative match result was returned." } };
  }

  window.mockActions = Object.freeze({ submit, simulateOpponentTurn, resetMatch, getResultFixture, checkResultAfterDisconnect, resourceValues: Object.freeze({ ...resourceValues }) });
})();
