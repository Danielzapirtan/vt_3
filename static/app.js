const state = {
  mediaId: null,
  duration: 0,
  startMs: 0,
  endMs: 0,
  transcriptId: null,
  engines: null,
};

const el = (id) => document.getElementById(id);
const statusEl = el("status");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#ff6b6b" : "#f0c34a";
}

function msToTs(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(msPart, 3)}`;
}

function tsToMs(ts) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(ts.trim());
  if (!match) return null;
  const [, h, m, s, ms] = match;
  const millis = ms ? parseInt(ms.padEnd(3, "0"), 10) : 0;
  return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s)) * 1000 + millis;
}

// --- tabs ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    el(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

// --- load engine capabilities ---
async function loadEngines() {
  const res = await fetch("/api/engines");
  state.engines = await res.json();
  const engineSelect = el("engineSelect");
  const mlxOpt = engineSelect.querySelector('option[value="whisper_mlx"]');
  if (!state.engines.whisper_mlx.available) {
    mlxOpt.disabled = true;
    mlxOpt.textContent = "Whisper MLX (unavailable: Apple Silicon only)";
  }
  updateSizeOptions();
}
el("engineSelect").addEventListener("change", updateSizeOptions);

function updateSizeOptions() {
  const engine = el("engineSelect").value;
  const sizes = state.engines[engine].sizes.length
    ? state.engines[engine].sizes
    : ["tiny", "base", "small", "medium", "large-v3"];
  const sizeSelect = el("sizeSelect");
  sizeSelect.innerHTML = "";
  sizes.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    sizeSelect.appendChild(opt);
  });
}

// --- loading media ---
async function onMediaLoaded(data) {
  state.mediaId = data.id;
  state.duration = data.duration;
  state.startMs = 0;
  state.endMs = Math.round(data.duration * 1000);

  const video = el("preview");
  video.src = data.url;
  el("videoSection").classList.remove("hidden");
  el("resultSection").classList.add("hidden");

  updateTimeInputs();
  layoutHandles();
}

el("loadYoutubeBtn").addEventListener("click", async () => {
  const url = el("youtubeUrl").value.trim();
  if (!url) return setStatus("Enter a YouTube URL.", true);
  setStatus("Downloading video...");
  el("loadYoutubeBtn").disabled = true;
  try {
    const res = await fetch("/api/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, use_chrome_cookies: el("useCookies").checked }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load video.");
    await onMediaLoaded(data);
    setStatus("Video loaded.");
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    el("loadYoutubeBtn").disabled = false;
  }
});

el("fileInput").addEventListener("change", async () => {
  const file = el("fileInput").files[0];
  if (!file) return;
  setStatus("Uploading video...");
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    await onMediaLoaded(data);
    setStatus("Video loaded.");
  } catch (e) {
    setStatus(e.message, true);
  }
});

// --- range slider ---
const slider = el("slider");
const track = el("sliderTrack");
const handleStart = el("handleStart");
const handleEnd = el("handleEnd");

function layoutHandles() {
  if (!state.duration) return;
  const width = slider.clientWidth;
  const startX = (state.startMs / 1000 / state.duration) * width;
  const endX = (state.endMs / 1000 / state.duration) * width;
  handleStart.style.left = `${startX}px`;
  handleEnd.style.left = `${endX}px`;
  track.style.left = `${startX}px`;
  track.style.width = `${Math.max(0, endX - startX)}px`;
}

function updateTimeInputs() {
  el("startInput").value = msToTs(state.startMs);
  el("endInput").value = msToTs(state.endMs);
}

function makeDraggable(handleEl, isStart) {
  handleEl.addEventListener("pointerdown", (e) => {
    handleEl.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const rect = slider.getBoundingClientRect();
      let ratio = (ev.clientX - rect.left) / rect.width;
      ratio = Math.min(1, Math.max(0, ratio));
      const ms = Math.round(ratio * state.duration * 1000);
      if (isStart) {
        state.startMs = Math.min(ms, state.endMs);
      } else {
        state.endMs = Math.max(ms, state.startMs);
      }
      layoutHandles();
      updateTimeInputs();
      el("preview").currentTime = ms / 1000;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}
makeDraggable(handleStart, true);
makeDraggable(handleEnd, false);
window.addEventListener("resize", layoutHandles);

el("startInput").addEventListener("change", () => {
  const ms = tsToMs(el("startInput").value);
  if (ms === null) return setStatus("Invalid start time format.", true);
  state.startMs = Math.min(ms, state.endMs);
  layoutHandles();
  updateTimeInputs();
});
el("endInput").addEventListener("change", () => {
  const ms = tsToMs(el("endInput").value);
  if (ms === null) return setStatus("Invalid end time format.", true);
  state.endMs = Math.max(ms, state.startMs);
  layoutHandles();
  updateTimeInputs();
});

// --- transcription ---
el("transcribeBtn").addEventListener("click", async () => {
  if (!state.mediaId) return;
  setStatus("Transcribing selected range...");
  el("transcribeBtn").disabled = true;
  el("resultSection").classList.add("hidden");
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: state.mediaId,
        engine: el("engineSelect").value,
        language: el("languageSelect").value,
        model_size: el("sizeSelect").value,
        start_ms: state.startMs,
        end_ms: state.endMs,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Transcription failed.");
    state.transcriptId = data.transcript_id;
    el("resultText").value = data.text;
    el("resultSection").classList.remove("hidden");
    setStatus("Done.");
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    el("transcribeBtn").disabled = false;
  }
});

el("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(el("resultText").value);
  setStatus("Copied to clipboard.");
});
el("downloadTxtBtn").addEventListener("click", () => {
  if (state.transcriptId) window.location = `/api/download/${state.transcriptId}?format=txt`;
});
el("downloadSrtBtn").addEventListener("click", () => {
  if (state.transcriptId) window.location = `/api/download/${state.transcriptId}?format=srt`;
});

loadEngines();
