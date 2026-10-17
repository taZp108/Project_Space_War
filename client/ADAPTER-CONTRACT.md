# UI Adapter Contract (UI-10)

The UI calls `window.gameAdapter`. The mock implementation lives in `game-adapter.js` and delegates to the fixture-only `mock-actions.js`, `mock-lobby.js`, and `mock-data.js`. A future transport adapter must implement the same methods and return the normalized shapes below; render functions must not read mock globals or transport messages.

No WebSocket transport or Haskell protocol changes are part of this phase. Field names below describe the current UI contract, not a claim about the final server wire format.

## Adapter methods

| Method | Input | Result |
| --- | --- | --- |
| `startMatch()` | none | `{ ok: true, playerView }` or `{ ok: false, error }` |
| `submitAction(action, args)` | action name and action-specific arguments | `ActionResponse` |
| `createRoom()` | none | `LobbyResponse<{ roomCode }>` |
| `joinRoom(roomCode)` | room code string | `LobbyResponse<{ roomCode, playersConnected }>` |
| `leaveRoom()` | none | `LobbyResponse<{ released }>` |
| `reconnectRoom()` | none | `LobbyResponse<{ connection }>` |
| `getMatchResult()` | none | `{ ok: true, data: { result } }` or `{ ok: false, error }` |
| `subscribePlayerViews(listener)` | callback receiving an authoritative `PlayerView` | unsubscribe function |
| `subscribeNotifications(listener)` | callback receiving a normalized notification | unsubscribe function |
| `subscribeMatchResults(listener)` | callback receiving a normalized `MatchResult` | unsubscribe function |
| `resourceValue(resourceType)` | resource name | number used for the local Recharge preview |

Demo fixture controls are deliberately separate in the optional `window.mockDemoAdapter`: `advanceOpponentTurn()`, `simulateOpponentJoin(roomCode)`, `simulateLobbyLinkLoss()`, and `getResultFixture(outcome)`. They are shown only when that mock-only object exists and are not methods on the production adapter.

The demo methods return the same normalized `{ ok, playerView?, data?, result?, error?, notifications? }` envelope; demo behavior is not part of the production contract.

## Normalized responses

Successful action response:

```js
{
  ok: true,
  playerView: PlayerView,
  actionReport: { action, code, message, result? },
  notifications: [{ code, level, title, message }],
  matchResult?: MatchResult
}
```

Rejected action response:

```js
{ ok: false, error: UiError, notifications: [] }
```

`UiError` is `{ code, message, retryable, details? }`. `details` may contain display hints such as a title or corrective instruction. The UI must preserve the current PlayerView on rejection. Transport errors must use the same shape and must not be presented as an authoritative game result.

Lobby and result lookup methods return `{ ok: true, data }` or `{ ok: false, error: UiError }`; result lookup uses `data.result`. `startMatch()` returns the initial authoritative PlayerView in its success response. Subsequent authoritative views can arrive in action responses or through `subscribePlayerViews`.

`ActionReport.result` is a discriminated object. The current view uses `kind` values `Moved`, `PlanetsFound`, `NearestPlanetSignal`, `OpponentSignal`, `Mined`, `Deposited`, `Recharged`, and `TurnEnded`. Result-specific fields are optional and must not be fabricated by the UI. A final match result may arrive in an action response or via `subscribeMatchResults`.

Current action inputs are `MOVE { target: { x, y } }`, `RECHARGE { resource, amount }`, and empty objects for `OBSERVE`, `SCAN_AREA`, `SCAN_NEAREST`, `SCAN_OPPONENT`, `MINE`, `DEPOSIT`, and `END_TURN`. The adapter forwards these intents; validation and state changes remain authoritative outside the UI.

Notification levels are `info`, `success`, `warning`, or `error`. Each item needs a stable `code` for deduplication and user-facing `title` and `message`. A production notification may arrive independently of an action response; the production adapter must deliver it through `subscribeNotifications` using the same normalized shape.

## PlayerView fields currently needed by the UI

- `player.position.{x,y}`, `ap`, `apMax`, `battery`, `batteryMax`, `cargo` (resource-to-unit counts), `cargoUsed`, `cargoCapacity`, `earthStorage` (resource-to-unit counts), `earthScore`, and `earthScoreTarget`.
- `player.currentPlanetStock` is optional and is displayed only when provided for the player's current planet.
- `earth.{x,y}` and `knownPlanets[]` with `id`, `type`, `position.{x,y}`, and `discoveredBy`. This list is player-scoped; undiscovered planets and remote stock must not be included.
- `turn.activePlayer`, `turn.round`, `turn.roundMax`, and `turn.isMyTurn`.
- Public opponent information only: `opponent.connection` and `opponent.publicStatus`. Never include private opponent coordinates, cargo, battery, or storage.
- `recentEvents[]` with `time`, `kind`, `code`, and `text`. These are player-visible events; UI-local validation errors may be kept separately.
- `gameStatus` to indicate whether actions remain available.

Fields not listed here should not be added to the network contract solely because a mock fixture happens to contain them. If rendering later needs more data, review this contract first.

## Open items for server-contract review

- Confirm how Haskell `PlayerView`, `ActionReport`, and any match-finished event map to these UI names and optional fields; no wire-format equivalence is assumed.
- The command catalog and action costs in the current UI are presentation metadata. Confirm whether they are stable product rules or should be supplied as server-owned action metadata.
- Confirm the Recharge conversion and score-preview rule exposed by `resourceValue`; the client preview is not authoritative.
- Confirm the exact public opponent connection/status vocabulary, notification codes, and which events carry a final MatchResult.

## MatchResult fields

The result screen accepts `{ verified, outcome, reason, eventCode, playerScore, opponentScore, rounds, totalDeposited }`. Only `verified === true` plus an explicit `outcome` may show Victory, Defeat, or Draw. All numeric fields are optional and appear only when provided. Missing or unverified result data means the UI shows an unverified state and no winner. A local disconnect alone never establishes a match result.

## Current boundary

`app.js` owns presentation state and reads the normalized `gameAdapter` interface for authoritative views, action reports, lobby responses, match results, notifications, and resource values. It calls `mockDemoAdapter` only for optional mock controls. Mock timing, fixture values, mock costs, stock, and response construction remain in mock modules. `resourceValue` supplies only the local Recharge preview; the final server contract must confirm the conversion rule. Replace `game-adapter.js` only after reviewing the real server contract; do not assume the Haskell types and these UI convenience fields are wire-compatible.
