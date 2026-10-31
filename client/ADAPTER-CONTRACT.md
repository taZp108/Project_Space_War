# Network adapter contract

`adapter-loader.js` loads `network-adapter.js` by default before `app.js`. For fixture testing, open `index.html?mock=1` to load the mock scripts instead. Both modes expose `window.gameAdapter`.

## Server connection

- The adapter opens `ws://<page-host>:8080/` (or `wss://` for an HTTPS page), then sends `{"type":"join"}`.
- The server automatically pairs the first two clients. `startMatch()` resolves only after `game_started`; it returns `{ ok: true, playerView }` or `{ ok: false, error }`.
- `waiting_for_opponent` and connection changes are delivered through `subscribeConnectionStates(listener)`.
- The documented server has no reconnect, room, or result lookup message. A disconnect is not treated as a verified result.

## UI methods

- `startMatch()` connects and joins. The UI remains on `waiting-room` until the adapter delivers the first authoritative view through `subscribePlayerViews(listener)`.
- `submitAction(action, args)` sends one `action` message and resolves after `action_accepted` or `action_rejected`.
- `leaveRoom()` closes the socket. Disconnecting during a match lets the server apply its forfeit rule.
- `subscribePlayerViews(listener)`, `subscribeNotifications(listener)`, and `subscribeMatchResults(listener)` deliver authoritative updates and notices. `subscribeConnectionStates(listener)` reports connect, wait, start, finish, and disconnect states.
- `resourceValue(resource)` supplies a display-only Recharge estimate using the current default Haskell config values. Server responses remain authoritative.

## View mapping

The adapter maps the server's snake_case `PlayerView` into the presentation fields used by `app.js`. It only maps the player's own position, cargo, storage, and known planets. Opponent position and private data are never added. `planet_here.stock` is shown only when the server includes it.

UI `MOVE` targets are converted to one cardinal direction. `MINE` and `RECHARGE` resources are converted to protocol enum strings. All accepted views replace the current UI view; rejected actions leave the current view intact.

The adapter maps `game_over` into a verified result using the server's winner/draw result and final summary. It does not derive a winner from a lost connection.
