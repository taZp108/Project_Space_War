# Space War client (mock UI)

The client is plain HTML, CSS, and JavaScript. Open `index.html` directly or serve the `client/` directory with a local static server. No Haskell server, package install, or network connection is required for the mock screens.

## Lobby demo

- Choose **MULTIPLAYER → CREATE ROOM** to get the fixed mock code `MOCK-7K2Q`.
- **COPY CODE** uses the browser clipboard when available. If permission or browser support is missing, select and copy the displayed code manually.
- Choose **SIMULATE PLAYER JOIN** to see the connected and initializing states.
- Choose **JOIN ROOM** and enter `MOCK-7K2Q` to demo a successful join. Fixture codes `FULL-0000` and `LINK-0000` demonstrate room-full and connection errors. Other correctly formatted codes demonstrate room-not-found; malformed codes demonstrate invalid-code errors.
- The waiting screen also has controls to simulate link loss and a retry. These are local mock responses, not server events.
- **CANCEL ROOM** returns to the lobby only after the mock adapter confirms the request. A simulated link loss never claims that the room was released.

Every room code, response, and lobby event is mock data in `mock-lobby.js`. The room-code pattern and fixture values are only for this demo; they do not define the eventual server protocol. No WebSocket or real network request is made.

## Match UI preview

From the waiting screen, choose **SIMULATE PLAYER JOIN**. The match screen uses the player-scoped view in `mock-data.js`, with HUD, target panel, public opponent status, command console, and event log. Every action goes through `mock-actions.js`; it is a local simulation and sends no network request.

## Tactical map demo

- On the match screen, hover cells to inspect coordinates/status and click to select a target. Selection only updates the map and Target Panel; it never moves the ship or sends a command.
- Drag the map to pan, use the mouse wheel to zoom, and choose **RESET TO SHIP** to return the camera to the mock ship.
- **SECTOR OVERVIEW** displays the full 100×100 grid. It shows only Earth, your ship, and the two discovered demo planets. The overview cannot select cells.
- Choose **CLEAR TARGET** to clear the selection. Arrow keys pan the focused tactical canvas; Enter selects its center cell.

## Command demo (UI-6)

- Select a command to review its target and AP/battery cost. **MOVE** uses the selected cell and the mock adapter rejects anything except one adjacent cardinal cell; selecting a cell never sends an action by itself.
- **DEPOSIT**, **RECHARGE**, and **END TURN** require a confirmation. Cancel keeps the selected command and target.
- Every submitted action shows a pending state and locks other gameplay commands. A successful mock response replaces the displayed player view; a rejected response leaves it unchanged.
- The starting ship is next to Earth, so **DEPOSIT** can demonstrate the remote deposit cost. Move onto Earth to use **RECHARGE**; choose a resource type and whole-unit amount from the mock Earth storage. The preview follows the UI spec conversion rate and clamps battery at its maximum.
- **END TURN** waits for the mock response, then **SIMULATE OPPONENT TURN** advances the demo to your next turn. AP reaching zero never ends the turn automatically.
- `mock-actions.js` contains fixture stock and mock rules only. Recharge's resource-and-amount controls align with the current `Recharge ResourceType Int` Haskell data constructor; the final server contract and interaction still need review before network integration.

All of these outcomes are mock responses. They do not establish server behavior, validate the final Haskell rules, or change the Haskell modules.

## Feedback demo (UI-7)

- Successful Move plays a short ship slide and trail. Successful scan actions play a decorative map sweep that does not indicate scan range; newly discovered demo planets pulse only after the returned PlayerView includes them.
- Each action response adds a Command Echo, a queued status toast, and a tone when **Sound** is enabled. Rejected actions show warning feedback but never animate as successful.
- Repeated identical warning toasts are deduplicated for a short interval. The Event Log starts with the latest entries and **EXPAND** reveals more of the mock session history.
- **Reduced motion** skips map motion and keeps response text, toasts, and logs. **Volume** controls the brief generated interface tone; sound is off by default.
- Discovery fixture planets live only in the mock action adapter and are added to the player view only after an accepted Observe/ScanArea response. They do not represent production map data.

## Result and disconnect demo (UI-8)

- The match demo controls show explicit mock fixtures for Victory, Defeat, Draw, and an unverified result. Only verified fixtures show an outcome; scores, rounds, and deposited totals appear only when the result response supplies them.
- **COPY MATCH SUMMARY** copies the fields in the displayed result. If the browser blocks clipboard access, the page selects a fallback text field so it can be copied manually.
- **SIMULATE LINK LOST** shows that match outcome is unknown. **CHECK MATCH RESULT** returns a mock unavailable response; the UI keeps the outcome unknown and does not assign a winner based on disconnect.
- These controls exercise UI fixtures only and do not represent server events or production match data.

## Responsive and accessibility pass (UI-9)

- The match view reflows from three columns to two, then to one at narrower widths. HUD, map, target, command console, and event log remain available in a scrollable page; the map and command controls stay usable on small screens.
- Menu, help, settings, lobby, waiting, match, result, and disconnect layouts wrap at narrow widths. Keyboard focus is visible, the brand link returns to the menu, and native dialogs retain Escape behavior.
- Settings font scaling, reduced motion preference, text labels, and non-color result states remain in place. These breakpoints are a reversible baseline because the specification leaves exact breakpoint choices open.
- Visual viewport review is still needed at 1440×900, 1920×1080, and a narrow window before calling the UI-9 acceptance checklist complete.

## Adapter boundary (UI-10)

- `app.js` talks to `game-adapter.js` for PlayerView, action responses, lobby operations, match results, notifications, and Recharge preview values.
- Optional `mockDemoAdapter` controls are separated from the production-facing adapter and disappear when that mock-only object is not loaded.
- The adapter normalizes the fixture modules into the UI response shapes. Fixture values, mock timing, and mock rules remain in the mock modules.
- See [`ADAPTER-CONTRACT.md`](ADAPTER-CONTRACT.md) for methods, response envelopes, PlayerView fields, notification/error conventions, result fields, and the open server-contract boundary.
- No WebSocket or Haskell protocol implementation was added.
