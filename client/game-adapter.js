"use strict";

// Stable UI boundary. Replace this file's mock delegates with a reviewed network adapter later.
(() => {
  const actions = window.mockActions;
  const lobby = window.mockLobby;

  function errorFrom(raw = {}) {
    return {
      code: String(raw.code || "UNKNOWN_ERROR"),
      message: String(raw.message || "The operation could not be completed."),
      retryable: Boolean(raw.retryable),
      details: {
        ...(raw.reason ? { title: raw.reason } : {}),
        ...(raw.hint ? { hint: raw.hint } : {}),
      },
    };
  }

  function lobbyReply(raw, dataKeys = []) {
    if (!raw?.ok) return { ok: false, error: errorFrom(raw?.error || raw) };
    const data = {};
    for (const key of dataKeys) if (raw[key] !== undefined) data[key] = raw[key];
    return { ok: true, data };
  }

  async function submitAction(action, args) {
    const raw = await actions.submit(action, args);
    if (!raw?.ok) return { ok: false, error: errorFrom(raw?.error), notifications: [] };
    return {
      ok: true,
      playerView: raw.view,
      actionReport: raw.report,
      notifications: Array.isArray(raw.report?.notifications) ? raw.report.notifications : [],
      ...(raw.matchResult ? { matchResult: raw.matchResult } : {}),
    };
  }

  window.gameAdapter = Object.freeze({
    startMatch: async () => ({ ok: true, playerView: actions.resetMatch() }),
    submitAction,
    createRoom: async () => lobbyReply(await lobby.createRoom(), ["roomCode"]),
    joinRoom: async (roomCode) => lobbyReply(await lobby.joinRoom(roomCode), ["roomCode", "playersConnected"]),
    leaveRoom: async () => lobbyReply(await lobby.leaveRoom(), ["released"]),
    reconnectRoom: async () => lobbyReply(await lobby.retryConnection(), ["connection"]),
    getMatchResult: async () => {
      const raw = await actions.checkResultAfterDisconnect();
      return raw?.ok ? { ok: true, data: { result: raw.result } } : { ok: false, error: errorFrom(raw?.error) };
    },
    subscribePlayerViews: (_listener) => () => {},
    subscribeNotifications: (_listener) => () => {},
    subscribeMatchResults: (_listener) => () => {},
    resourceValue: (resourceType) => actions.resourceValues[resourceType] || 0,
  });

  // Demo-only controls stay outside the production adapter contract.
  window.mockDemoAdapter = Object.freeze({
    advanceOpponentTurn: async () => {
      const raw = await actions.simulateOpponentTurn();
      return raw?.ok
        ? { ok: true, playerView: raw.view, notifications: [] }
        : { ok: false, error: errorFrom(raw?.error || { code: "MOCK_TURN_FAILED", message: "The mock turn could not be advanced." }), notifications: [] };
    },
    simulateOpponentJoin: async (roomCode) => lobbyReply(await lobby.simulateOpponentJoin(roomCode), ["playersConnected"]),
    simulateLobbyLinkLoss: async () => lobbyReply(await lobby.simulateLinkLoss(), ["connection"]),
    getResultFixture: async (outcome) => {
      const raw = await actions.getResultFixture(outcome);
      return raw?.ok ? { ok: true, result: raw.result } : { ok: false, error: errorFrom(raw?.error) };
    },
  });
})();
