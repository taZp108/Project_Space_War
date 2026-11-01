"use strict";

// SFX engine using Web Audio API + fetch.
// Supports overlapping sounds, throttling, volume, and fallback to .wav/.ogg.
(() => {
  const BASE_PATH = "assets/audio/sfx/";
  const EXTS = [".mp3", ".wav", ".ogg"];

  const cache = new Map();          // path -> AudioBuffer | null
  const loading = new Map();        // path -> Promise<AudioBuffer|null>
  const playing = new Map();        // path -> [AudioBufferSourceNode]
  const lastPlayedAt = new Map();   // path -> ms timestamp

  let ctx = null;
  let masterGain = null;
  let enabled = true;
  let volume = 0.7;

  const LIMITS = {
    throttle: 40,     // ms — same sound within 40ms → skip
    perSound: 4,      // max concurrent instances per sound
    global: 8,        // max concurrent sounds total
  };

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = enabled ? volume : 0;
      masterGain.connect(ctx.destination);
    } catch (err) {
      console.warn("[SFX] Cannot create AudioContext:", err);
      return null;
    }
    return ctx;
  }

  // Create AudioContext on the first user gesture (autoplay policy).
  const initOnGesture = () => { ensureContext(); };
  window.addEventListener("pointerdown", initOnGesture, { once: true, capture: true });
  window.addEventListener("keydown", initOnGesture, { once: true, capture: true });


    // ─────────────────────────────────────────────────────────────
  // LOUDNESS NORMALIZATION
  // All SFX are normalized to the same perceived level regardless of
  // their source peak/RMS. Target RMS ≈ -16.5 dBFS, peak ceiling
  // -0.9 dBFS prevents clipping after gain is applied.
  // Gain is computed once per buffer and cached.
  // ─────────────────────────────────────────────────────────────
  const TARGET_RMS = 0.15;       // ~ -16.5 dBFS, typical for game SFX
  const PEAK_CEILING = 0.9;      // ~ -0.9 dBFS, leaves headroom
  const MAX_GAIN = 8;            // cap boost for near-silent sources
  const MIN_GAIN = 0.05;         // cap cut for extremely loud sources
  const normGainCache = new Map();   // path -> { buffer, gain }

  function computeStats(buffer) {
    let sumSq = 0, peak = 0, count = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        sumSq += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        count++;
      }
    }
    return {
      rms: count > 0 ? Math.sqrt(sumSq / count) : 0,
      peak,
    };
  }

  function normalizeGain(path, buffer) {
    const cached = normGainCache.get(path);
    if (cached && cached.buffer === buffer) return cached.gain;

    const { rms, peak } = computeStats(buffer);
    let gain = 1;
    if (rms > 1e-4) {
      // Primary: RMS-normalize to target perceived loudness
      gain = TARGET_RMS / rms;
      // Safety: never exceed peak ceiling (prevents clipping on transients)
      if (peak > 0) {
        const peakSafe = PEAK_CEILING / peak;
        if (gain > peakSafe) gain = peakSafe;
      }
      // Clamp extremes
      if (gain > MAX_GAIN) gain = MAX_GAIN;
      if (gain < MIN_GAIN) gain = MIN_GAIN;
    }
    normGainCache.set(path, { buffer, gain });
    // console.debug("[SFX] norm", path, "rms=" + rms.toFixed(3), "peak=" + peak.toFixed(3), "gain=" + gain.toFixed(2));
    return gain;
  }

  async function load(path) {
    if (cache.has(path)) return cache.get(path);
    if (loading.has(path)) return loading.get(path);

    const c = ensureContext();
    if (!c) { cache.set(path, null); return null; }

    const promise = (async () => {
      try {
        let buffer = null;
        for (const ext of EXTS) {
          try {
            const res = await fetch(BASE_PATH + path + ext);
            if (!res.ok) continue;
            const arr = await res.arrayBuffer();
            buffer = await c.decodeAudioData(arr);
            break;
          } catch { /* try next ext */ }
        }
        if (!buffer) console.warn("[SFX] Missing file:", path);
        cache.set(path, buffer);
        return buffer;
      } catch (err) {
        console.warn("[SFX] Load error:", path, err);
        cache.set(path, null);
        return null;
      } finally {
        loading.delete(path);
      }
    })();
    loading.set(path, promise);
    return promise;
  }

  function countPlaying(path) {
    const arr = playing.get(path);
    if (!arr) return 0;
    let n = 0;
    for (const s of arr) if (s._playing) n++;
    return n;
  }
  function totalPlaying() {
    let n = 0;
    for (const arr of playing.values()) {
      for (const s of arr) if (s._playing) n++;
    }
    return n;
  }

  async function play(name, opts = {}) {
    if (!enabled || volume <= 0 || !name) return;

    // primaryPath = logical sound ID (throttle/concurrency key).
    // loadedPath  = actual file loaded (may differ if fallback used).
    const primaryPath = String(name).replace(/\.(mp3|wav|ogg)$/i, "").replace(/^\/+/, "");
    const now = performance.now();
    const last = lastPlayedAt.get(primaryPath) || 0;
    if (!opts.force && now - last < LIMITS.throttle) return;
    lastPlayedAt.set(primaryPath, now);

    if (countPlaying(primaryPath) >= (opts.perSound ?? LIMITS.perSound)) return;
    if (totalPlaying() >= LIMITS.global) return;

    const c = ensureContext();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});

    // Try primary first, then fallbacks in order.
    let loadedPath = primaryPath;
    let buffer = await load(loadedPath);
    if (!buffer && Array.isArray(opts.fallback) && opts.fallback.length) {
      for (const alt of opts.fallback) {
        const altPath = String(alt).replace(/\.(mp3|wav|ogg)$/i, "").replace(/^\/+/, "");
        if (!altPath || altPath === primaryPath) continue;
        buffer = await load(altPath);
        if (buffer) { loadedPath = altPath; break; }
      }
    }
    if (!buffer) return;

    try {
      const src = c.createBufferSource();
      src.buffer = buffer;

      const normGain = normalizeGain(loadedPath, buffer);
      const instanceGain = c.createGain();
      instanceGain.gain.value = normGain;
      src.connect(instanceGain);
      instanceGain.connect(masterGain);

      src._playing = true;
      src.onended = () => { src._playing = false; };

      const startAt = c.currentTime;
      const maxSec = opts.maxDurationMs ? opts.maxDurationMs / 1000 : 0;

      if (maxSec > 0 && buffer.duration > maxSec) {
        const fadeDur = Math.min(0.3, maxSec * 0.35);
        const stopAt = startAt + maxSec;
        const fadeStart = stopAt - fadeDur;
        instanceGain.gain.setValueAtTime(normGain, startAt);
        instanceGain.gain.setValueAtTime(normGain, fadeStart);
        instanceGain.gain.linearRampToValueAtTime(0.0001, stopAt);
        src.start(startAt);
        src.stop(stopAt + 0.02);
      } else if (maxSec > 0 && buffer.duration > maxSec - 0.25) {
        const stopAt = startAt + maxSec;
        const fadeStart = Math.max(startAt, stopAt - 0.2);
        instanceGain.gain.setValueAtTime(normGain, fadeStart);
        instanceGain.gain.linearRampToValueAtTime(0.0001, stopAt);
        src.start(startAt);
        src.stop(stopAt + 0.02);
      } else {
        src.start(startAt);
      }

      if (!playing.has(primaryPath)) playing.set(primaryPath, []);
      playing.get(primaryPath).push(src);
      if (playing.get(primaryPath).length > 12) {
        playing.set(primaryPath, playing.get(primaryPath).filter((s) => s._playing));
      }
    } catch (err) {
      console.warn("[SFX] Play error:", loadedPath, err);
    }
  }

  async function playBounded(name, maxDurationMs, opts = {}) {
    return play(name, { ...opts, maxDurationMs });
  }

  function preload(names) {
    ensureContext();
    names.forEach((n) => {
      const path = String(n).replace(/\.(mp3|wav|ogg)$/i, "");
      load(path).then((buf) => {
        if (buf) normalizeGain(path, buf);
      });
    });
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (masterGain) masterGain.gain.value = enabled ? volume : 0;
  }
  function setEnabled(e) {
    enabled = !!e;
    if (masterGain) masterGain.gain.value = enabled ? volume : 0;
  }
  function suspend() { if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); }
  function resume()  { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); }

  window.SFX = { play, playBounded, preload, setVolume, setEnabled, suspend, resume };
})();