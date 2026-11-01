"use strict";

// Use ?mock=1 to load the local fixtures; the default remains the real server.
(() => {
  const mockMode = new URLSearchParams(window.location.search).get("mock") === "1";
  const files = mockMode
    ? ["mock-data.js", "mock-lobby.js", "mock-actions.js", "game-adapter.js"]
    : ["network-adapter.js"];

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${file}?v=${Date.now()}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Không tải được ${file}.`));
      document.head.append(script);
    });
  }

  (async () => {
    for (const file of files) await loadScript(file);
    await loadScript("app.js");
    if (mockMode) document.documentElement.dataset.adapterMode = "mock";
  })().catch((error) => {
    console.error("Không thể khởi chạy giao diện Space War:", error);
  });
})();
