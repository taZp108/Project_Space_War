# Space War client

The browser client is plain HTML, CSS, and JavaScript. Open `index.html` or serve the `client/` directory. By default, it connects to the Haskell WebSocket server at `ws://<page-host>:8080/` (or `wss://` on HTTPS).

The lobby has separate **VÀO TRẬN** and **VÀO TRẬN GIẢ** buttons. The mock button starts the fixture match without connecting to the server. You can also open `index.html?mock=1` to use mock mode directly.

Choose **NHIỀU NGƯỜI CHƠI**, then **VÀO TRẬN** to connect. The server pairs the first two clients automatically; the first client waits until the second joins. There are no room codes or room creation/join actions.

`network-adapter.js` sends the `join` message after opening the socket, translates the server's JSON views into the UI's view model, and forwards actions. The Haskell server remains authoritative for game state and action acceptance. When the socket closes, the client reports that the match result is unknown unless it received an authoritative `game_over` message.

The wire protocol reference is `Space War - Giao thức tin nhắn (WebSocket + JSON).txt`. The protocol's endpoint is the server root on port 8080. Do not load the mock fixture scripts for a real match.
