"use strict";

// MOCK ONLY: replace this adapter with a network adapter in a later, reviewed phase.
// Fixture codes are demo inputs and do not define the eventual server protocol.
window.mockLobby = (() => {
  const demoRoomCode = "MOCK-7K2Q";
  const fixturePattern = /^[A-Z0-9]{4,8}-[A-Z0-9]{4}$/;

  function reply(data) {
    return new Promise((resolve) => window.setTimeout(() => resolve(data), 180));
  }

  function error(reason, code, message, hint) {
    return { ok: false, reason, code, message, hint };
  }

  return {
    async createRoom() {
      return reply({ ok: true, roomCode: demoRoomCode, mock: true });
    },

    async joinRoom(rawCode) {
      const roomCode = String(rawCode || "").trim().toUpperCase();
      if (!fixturePattern.test(roomCode)) {
        return reply(error("INVALID ROOM CODE", "MOCK-ROOM-01", "That code does not match the mock room format.", "Enter a code such as MOCK-7K2Q."));
      }
      if (roomCode === "FULL-0000") {
        return reply(error("ROOM FULL", "MOCK-ROOM-03", "This mock room already has two players.", "Try another room code."));
      }
      if (roomCode === "LINK-0000") {
        return reply(error("CONNECTION ERROR", "MOCK-NET-01", "The mock connection was interrupted.", "Check the address in Settings or retry the demo."));
      }
      if (roomCode !== demoRoomCode) {
        return reply(error("ROOM NOT FOUND", "MOCK-ROOM-02", "No mock room uses that code.", "Check the code and try again."));
      }
      return reply({ ok: true, roomCode, mock: true, playersConnected: true });
    },

    async leaveRoom() {
      return reply({ ok: true, mock: true, released: true });
    },

    async simulateOpponentJoin(roomCode) {
      if (roomCode !== demoRoomCode) {
        return reply(error("ROOM NOT FOUND", "MOCK-ROOM-02", "The mock room is no longer available.", "Return to the menu and create another mock room."));
      }
      return reply({ ok: true, mock: true, playersConnected: true });
    },

    async simulateLinkLoss() {
      return reply({ ok: true, mock: true, connection: "lost" });
    },

    async retryConnection() {
      return reply({ ok: true, mock: true, connection: "restored" });
    },
  };
})();
