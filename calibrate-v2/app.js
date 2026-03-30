const CAMERA_HEADING_OFFSET_DEG = 0;
const LEVEL_REFERENCE_WINDOW_MS = 900;
const POINT_SAMPLE_WINDOW_MS = 350;
const MOTION_SAMPLE_KEEP_MS = 2500;
const MIN_MOTION_SAMPLES = 5;
const MAX_CAPTURE_SWEEP_DEG = 160;
const MIN_DOMINANT_CLUSTER_POINTS = 3;
const DRAFT_STORAGE_KEY = "dits-calibration-draft-v2";
const DEVICE_ALIGNMENT_STORAGE_KEY = "dits-heading-default-v1";
const SPOT_ALIGNMENT_STORAGE_KEY = "dits-spot-alignments-v1";
const CAMERA_OVERLAY_HORIZONTAL_FOV_DEG = 62;
const CAMERA_OVERLAY_ARC_STEP_MINUTES = 10;
const CAMERA_OVERLAY_TICK_MS = 30000;

const state = {
  pubName: "",
  seatName: "",
  notes: "",
  lat: null,
  lng: null,
  gpsAccuracyM: null,
  gpsTimestamp: null,
  headingDeg: null,
  pitchDeg: null,
  levelPitch: null,
  levelCapturedAt: null,
  motionReady: false,
  motionRequested: false,
  cameraReady: false,
  gpsReady: false,
  stream: null,
  samples: [],
  recentPitchSamples: [],
  recentHeadingSamples: [],
  currentStep: 1,
  calibrationDate: null,
  headingStartOffsetDeg: 0,
  headingEndOffsetDeg: 0,
  deviceDefaultHeadingStartOffsetDeg: null,
  deviceDefaultHeadingEndOffsetDeg: null,
  alignmentSource: "none",
  overlayPreviewMinutes: null
};

const els = {
  pubName: document.getElementById("pubName"),
  seatName: document.getElementById("seatName"),
  notes: document.getElementById("notes"),
  startBtn: document.getElementById("startBtn"),
  enableMotionBtn: document.getElementById("enableMotionBtn"),
  loadSiteBtn: document.getElementById("loadSiteBtn"),
  toStep3Btn: document.getElementById("toStep3Btn"),
  toStep5Btn: document.getElementById("toStep5Btn"),
  backTo1Btn: document.getElementById("backTo1Btn"),
  backTo2Btn: document.getElementById("backTo2Btn"),
  backTo3Btn: document.getElementById("backTo3Btn"),
  backTo4Btn: document.getElementById("backTo4Btn"),
  setHorizonBtn: document.getElementById("setHorizonBtn"),
  addPointBtn: document.getElementById("addPointBtn"),
  undoPointBtn: document.getElementById("undoPointBtn"),
  clearBtn: document.getElementById("clearBtn"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  exportBtn: document.getElementById("exportBtn"),
  previewBtn: document.getElementById("previewBtn"),
  previewDate: document.getElementById("previewDate"),
  calibrationDateText: document.getElementById("calibrationDateText"),
  headingStartRange: document.getElementById("headingStartRange"),
  headingStartValue: document.getElementById("headingStartValue"),
  headingStartMinusBtn: document.getElementById("headingStartMinusBtn"),
  headingStartResetBtn: document.getElementById("headingStartResetBtn"),
  headingStartPlusBtn: document.getElementById("headingStartPlusBtn"),
  headingEndRange: document.getElementById("headingEndRange"),
  headingEndValue: document.getElementById("headingEndValue"),
  headingEndMinusBtn: document.getElementById("headingEndMinusBtn"),
  headingEndResetBtn: document.getElementById("headingEndResetBtn"),
  headingEndPlusBtn: document.getElementById("headingEndPlusBtn"),
  saveSpotAlignmentBtn: document.getElementById("saveSpotAlignmentBtn"),
  saveDeviceDefaultBtn: document.getElementById("saveDeviceDefaultBtn"),
  alignmentSourceLine: document.getElementById("alignmentSourceLine"),
  previewOutput: document.getElementById("previewOutput"),
  video: document.getElementById("video"),
  gpsStatus: document.getElementById("gpsStatus"),
  cameraStatus: document.getElementById("cameraStatus"),
  motionStatus: document.getElementById("motionStatus"),
  pointsList: document.getElementById("pointsList"),
  profileCanvas: document.getElementById("profileCanvas"),
  cameraOverlay: document.getElementById("cameraOverlay"),
  sunOverlayBadge: document.getElementById("sunOverlayBadge"),
  cameraBackBtn: document.getElementById("cameraBackBtn"),
  graphHint: document.getElementById("graphHint"),
  rangeInfo: document.getElementById("rangeInfo"),
  floatingPointsBadge: document.getElementById("floatingPointsBadge"),
  levelStatusLine: document.getElementById("levelStatusLine"),
  captureSummary: document.getElementById("captureSummary"),
  captureBar: document.getElementById("captureBar"),
  captureUtilityRow: document.getElementById("captureUtilityRow"),
  captureDebugLine: document.getElementById("captureDebugLine"),
  arPreviewRow: document.getElementById("arPreviewRow"),
  arPreviewValue: document.getElementById("arPreviewValue"),
  arPreviewMinusBtn: document.getElementById("arPreviewMinusBtn"),
  arPreviewNowBtn: document.getElementById("arPreviewNowBtn"),
  arPreviewPlusBtn: document.getElementById("arPreviewPlusBtn"),
  overlayAlignRow: document.getElementById("overlayAlignRow"),
  overlayAlignValue: document.getElementById("overlayAlignValue"),
  overlayMinusBtn: document.getElementById("overlayMinusBtn"),
  overlayResetBtn: document.getElementById("overlayResetBtn"),
  overlayPlusBtn: document.getElementById("overlayPlusBtn"),
  cameraActions: document.getElementById("cameraActions"),
  stepSummary: document.getElementById("stepSummary"),
  screen1: document.getElementById("screen1"),
  screen2: document.getElementById("screen2"),
  screen3: document.getElementById("screen3"),
  screen4: document.getElementById("screen4"),
  screen5: document.getElementById("screen5"),
  chip1: document.getElementById("chip1"),
  chip2: document.getElementById("chip2"),
  chip3: document.getElementById("chip3"),
  chip4: document.getElementById("chip4"),
  chip5: document.getElementById("chip5"),
  cameraStage: document.getElementById("cameraStage")
};

document.addEventListener("DOMContentLoaded", init);

document.addEventListener("dblclick", (event) => {
  event.preventDefault();
}, { passive: false });

let lastTouchEndTs = 0;
document.addEventListener("touchend", (event) => {
  const now = Date.now();
  if (now - lastTouchEndTs < 300) {
    event.preventDefault();
  }
  lastTouchEndTs = now;
}, { passive: false });

document.addEventListener("gesturestart", (event) => {
  event.preventDefault();
}, { passive: false });

function init() {
  bindUI();
  loadSavedHeadingPreferences();
  loadDraft();
  setDefaultPreviewDate();
  if (state.alignmentSource !== "draft") {
    applySavedAlignmentForCurrentSpot({ preserveCurrent: false });
  }
  render();
  renderCameraOverlay();
}

function bindUI() {
  els.startBtn.addEventListener("click", startWizard);
  els.enableMotionBtn.addEventListener("click", enableMotionFromButton);
  els.loadSiteBtn.addEventListener("click", loadSiteRequirements);
  els.toStep3Btn.addEventListener("click", () => goToStep(3));
  els.toStep5Btn.addEventListener("click", () => goToStep(5));
  els.backTo1Btn.addEventListener("click", () => goToStep(1));
  els.backTo2Btn.addEventListener("click", () => goToStep(2));
  els.backTo3Btn.addEventListener("click", () => goToStep(3));
  els.backTo4Btn.addEventListener("click", () => goToStep(4));
  els.setHorizonBtn.addEventListener("click", setLevelReference);
  els.addPointBtn.addEventListener("click", addPoint);
  els.undoPointBtn.addEventListener("click", undoPoint);
  els.clearBtn.addEventListener("click", clearPoints);
  els.saveDraftBtn.addEventListener("click", saveDraft);
  els.exportBtn.addEventListener("click", exportJson);
  els.previewBtn.addEventListener("click", () => calculatePreview(false));
  els.headingStartRange.addEventListener("input", () => onAlignmentInput("start"));
  els.headingStartMinusBtn.addEventListener("click", () => nudgeAlignment("start", -1));
  els.headingStartResetBtn.addEventListener("click", () => resetAlignment("start"));
  els.headingStartPlusBtn.addEventListener("click", () => nudgeAlignment("start", 1));
  els.headingEndRange.addEventListener("input", () => onAlignmentInput("end"));
  els.headingEndMinusBtn.addEventListener("click", () => nudgeAlignment("end", -1));
  els.headingEndResetBtn.addEventListener("click", () => resetAlignment("end"));
  els.headingEndPlusBtn.addEventListener("click", () => nudgeAlignment("end", 1));
  els.saveSpotAlignmentBtn.addEventListener("click", saveSpotAlignment);
  els.saveDeviceDefaultBtn.addEventListener("click", saveDeviceDefaultAlignment);
  els.arPreviewMinusBtn.addEventListener("click", () => shiftOverlayPreview(-60));
  els.arPreviewNowBtn.addEventListener("click", resetOverlayPreviewToNow);
  els.arPreviewPlusBtn.addEventListener("click", () => shiftOverlayPreview(60));
  els.cameraBackBtn.addEventListener("click", () => goToStep(3));
  els.overlayMinusBtn.addEventListener("click", () => shiftOverlayAlignment(-1));
  els.overlayResetBtn.addEventListener("click", resetOverlayAlignment);
  els.overlayPlusBtn.addEventListener("click", () => shiftOverlayAlignment(1));

  els.pubName.addEventListener("input", () => {
    state.pubName = els.pubName.value.trim();
    render();
  });
  els.seatName.addEventListener("input", () => {
    state.seatName = els.seatName.value.trim();
    render();
  });
  els.notes.addEventListener("input", () => {
    state.notes = els.notes.value.trim();
  });
}

function startWizard() {
  state.pubName = els.pubName.value.trim();
  state.seatName = els.seatName.value.trim();
  state.notes = els.notes.value.trim();
  if (!state.pubName || !state.seatName) {
    alert("Add the pub name and seat name first.");
    return;
  }
  applySavedAlignmentForCurrentSpot({ preserveCurrent: false });
  goToStep(2);
}

function goToStep(step) {
  state.currentStep = step;
  if (step === 4) maybeSeedOverlayPreview();
  render();
  if (state.stream) {
    requestAnimationFrame(() => ensureVideoPlayback());
  }
}

function setDefaultPreviewDate() {
  if (!state.calibrationDate) {
    state.calibrationDate = dateToLocalInputValue(new Date());
  }
  if (els.previewDate) {
    els.previewDate.value = state.calibrationDate;
  }
  updateCalibrationDateText();
  syncAlignmentUI();
}

function dateToLocalInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


function maybeSeedOverlayPreview() {
  if (state.overlayPreviewMinutes != null) return;
  if (state.lat == null || state.lng == null || !window.SunCalc) return;
  const now = new Date();
  const pos = window.SunCalc.getPosition(now, state.lat, state.lng);
  const altDeg = radToDeg(pos.altitude);
  if (altDeg > 0) return;
  state.overlayPreviewMinutes = 14 * 60;
}

function getOverlayPreviewMinutes() {
  return Number.isFinite(state.overlayPreviewMinutes) ? state.overlayPreviewMinutes : null;
}

function getOverlayPreviewDate() {
  const previewMinutes = getOverlayPreviewMinutes();
  if (previewMinutes == null) return new Date();
  return localDateAtMinutes(state.calibrationDate || dateToLocalInputValue(new Date()), previewMinutes);
}

function syncOverlayPreviewUI() {
  if (!els.arPreviewValue) return;
  const previewMinutes = getOverlayPreviewMinutes();
  els.arPreviewValue.textContent = previewMinutes == null ? 'AR preview now' : `AR preview ${formatMinutesClock(previewMinutes)}`;
}

function shiftOverlayPreview(deltaMinutes) {
  const current = getOverlayPreviewMinutes();
  const base = current == null ? roundToNearestMinutes(new Date().getHours() * 60 + new Date().getMinutes(), 60) : current;
  state.overlayPreviewMinutes = clampPreviewMinutes(base + deltaMinutes);
  syncOverlayPreviewUI();
  renderCameraOverlay();
}

function resetOverlayPreviewToNow() {
  state.overlayPreviewMinutes = null;
  syncOverlayPreviewUI();
  renderCameraOverlay();
}

function clampPreviewMinutes(value) {
  return Math.max(5 * 60, Math.min(21 * 60, Math.round(Number(value) || 0)));
}

function roundToNearestMinutes(value, step) {
  return Math.round(value / step) * step;
}

function formatMinutesClock(totalMinutes) {
  const mins = ((totalMinutes % (24*60)) + 24*60) % (24*60);
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}
function onAlignmentInput(which) {
  if (which === "start") state.headingStartOffsetDeg = round1(clampAlignmentOffset(els.headingStartRange.value));
  else state.headingEndOffsetDeg = round1(clampAlignmentOffset(els.headingEndRange.value));
  state.alignmentSource = "manual";
  syncAlignmentUI();
  updateReviewFromAlignment();
}

function nudgeAlignment(which, delta) {
  if (which === "start") state.headingStartOffsetDeg = round1(clampAlignmentOffset(state.headingStartOffsetDeg + delta));
  else state.headingEndOffsetDeg = round1(clampAlignmentOffset(state.headingEndOffsetDeg + delta));
  state.alignmentSource = "manual";
  syncAlignmentUI();
  updateReviewFromAlignment();
}

function resetAlignment(which) {
  if (which === "start") state.headingStartOffsetDeg = 0;
  else state.headingEndOffsetDeg = 0;
  state.alignmentSource = "manual";
  syncAlignmentUI();
  updateReviewFromAlignment();
}

function clampAlignmentOffset(value) {
  return Math.max(-40, Math.min(40, Number(value) || 0));
}

function syncAlignmentUI() {
  if (els.headingStartRange) els.headingStartRange.value = String(state.headingStartOffsetDeg || 0);
  if (els.headingStartValue) {
    const val = Number(state.headingStartOffsetDeg) || 0;
    els.headingStartValue.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}°`;
  }
  if (els.headingEndRange) els.headingEndRange.value = String(state.headingEndOffsetDeg || 0);
  if (els.headingEndValue) {
    const val = Number(state.headingEndOffsetDeg) || 0;
    els.headingEndValue.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}°`;
  }
  syncOverlayAlignmentUI();
  syncOverlayPreviewUI();
  updateAlignmentSourceLine();
}

function updateAlignmentSourceLine() {
  if (!els.alignmentSourceLine) return;
  const current = `start ${formatOffsetLabel(state.headingStartOffsetDeg)}, end ${formatOffsetLabel(state.headingEndOffsetDeg)}`;
  const deviceSaved = Number.isFinite(state.deviceDefaultHeadingStartOffsetDeg) || Number.isFinite(state.deviceDefaultHeadingEndOffsetDeg)
    ? `start ${formatOffsetLabel(state.deviceDefaultHeadingStartOffsetDeg || 0)}, end ${formatOffsetLabel(state.deviceDefaultHeadingEndOffsetDeg || 0)}`
    : null;
  const spotSaved = getSavedSpotAlignment();
  const spotSavedLabel = spotSaved ? `start ${formatOffsetLabel(spotSaved.headingStartOffsetDeg)}, end ${formatOffsetLabel(spotSaved.headingEndOffsetDeg)}` : null;

  let text = `Current alignment ${current}. `;
  if (state.alignmentSource === "spot") {
    text += `Using saved spot alignment${spotSavedLabel ? ` (${spotSavedLabel})` : ""}.`;
  } else if (state.alignmentSource === "device") {
    text += `Using saved device default${deviceSaved ? ` (${deviceSaved})` : ""}.`;
  } else if (state.alignmentSource === "draft") {
    text += `Loaded from saved draft.`;
  } else if (state.alignmentSource === "manual") {
    text += `Adjusted manually.`;
    if (spotSavedLabel) text += ` Saved spot alignment: ${spotSavedLabel}.`;
    else if (deviceSaved) text += ` Saved device default: ${deviceSaved}.`;
  } else {
    if (spotSavedLabel) text += `Saved spot alignment available: ${spotSavedLabel}.`;
    else if (deviceSaved) text += `Saved device default available: ${deviceSaved}.`;
    else text += `No saved alignment yet.`;
  }
  els.alignmentSourceLine.textContent = text;
}

function formatOffsetLabel(value) {
  const val = round1(Number(value) || 0);
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}°`;
}

function getOverlayHeadingOffsetDeg() {
  return round1(((Number(state.headingStartOffsetDeg) || 0) + (Number(state.headingEndOffsetDeg) || 0)) / 2);
}

function syncOverlayAlignmentUI() {
  if (!els.overlayAlignValue) return;
  els.overlayAlignValue.textContent = `Overlay align ${formatOffsetLabel(getOverlayHeadingOffsetDeg())}`;
}

function shiftOverlayAlignment(delta) {
  state.headingStartOffsetDeg = round1(clampAlignmentOffset((Number(state.headingStartOffsetDeg) || 0) + delta));
  state.headingEndOffsetDeg = round1(clampAlignmentOffset((Number(state.headingEndOffsetDeg) || 0) + delta));
  state.alignmentSource = "manual";
  syncAlignmentUI();
  updateReviewFromAlignment();
}

function resetOverlayAlignment() {
  const center = getOverlayHeadingOffsetDeg();
  state.headingStartOffsetDeg = round1(clampAlignmentOffset((Number(state.headingStartOffsetDeg) || 0) - center));
  state.headingEndOffsetDeg = round1(clampAlignmentOffset((Number(state.headingEndOffsetDeg) || 0) - center));
  state.alignmentSource = "manual";
  syncAlignmentUI();
  updateReviewFromAlignment();
}

function makeSpotKey(pubName = state.pubName, seatName = state.seatName) {
  const pub = slugify(pubName || "");
  const seat = slugify(seatName || "");
  if (!pub || !seat) return "";
  return `${pub}__${seat}`;
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Storage read failed for ${key}`, err);
    return fallback;
  }
}

function loadSavedHeadingPreferences() {
  const deviceValue = readJsonStorage(DEVICE_ALIGNMENT_STORAGE_KEY, null);
  if (typeof deviceValue === "number" && Number.isFinite(deviceValue)) {
    state.deviceDefaultHeadingStartOffsetDeg = clampAlignmentOffset(deviceValue);
    state.deviceDefaultHeadingEndOffsetDeg = clampAlignmentOffset(deviceValue);
  } else if (deviceValue && (typeof deviceValue.headingStartOffsetDeg === "number" || typeof deviceValue.headingEndOffsetDeg === "number" || typeof deviceValue.headingOffsetDeg === "number")) {
    const legacy = typeof deviceValue.headingOffsetDeg === "number" ? deviceValue.headingOffsetDeg : 0;
    state.deviceDefaultHeadingStartOffsetDeg = clampAlignmentOffset(deviceValue.headingStartOffsetDeg ?? legacy);
    state.deviceDefaultHeadingEndOffsetDeg = clampAlignmentOffset(deviceValue.headingEndOffsetDeg ?? legacy);
  } else {
    state.deviceDefaultHeadingStartOffsetDeg = null;
    state.deviceDefaultHeadingEndOffsetDeg = null;
  }
}

function getSavedSpotAlignments() {
  const data = readJsonStorage(SPOT_ALIGNMENT_STORAGE_KEY, {});
  return data && typeof data === "object" ? data : {};
}

function getSavedSpotAlignment(pubName = state.pubName, seatName = state.seatName) {
  const key = makeSpotKey(pubName, seatName);
  if (!key) return null;
  const map = getSavedSpotAlignments();
  const entry = map[key];
  if (!entry) return null;
  const legacy = typeof entry.headingOffsetDeg === "number" ? entry.headingOffsetDeg : 0;
  return { ...entry, headingStartOffsetDeg: clampAlignmentOffset(entry.headingStartOffsetDeg ?? legacy), headingEndOffsetDeg: clampAlignmentOffset(entry.headingEndOffsetDeg ?? legacy) };
}

function applySavedAlignmentForCurrentSpot(options = {}) {
  const { preserveCurrent = false } = options;
  const spotSaved = getSavedSpotAlignment();
  if (spotSaved) {
    state.headingStartOffsetDeg = clampAlignmentOffset(spotSaved.headingStartOffsetDeg);
    state.headingEndOffsetDeg = clampAlignmentOffset(spotSaved.headingEndOffsetDeg);
    state.alignmentSource = "spot";
    syncAlignmentUI();
    return true;
  }
  if (Number.isFinite(state.deviceDefaultHeadingStartOffsetDeg) || Number.isFinite(state.deviceDefaultHeadingEndOffsetDeg)) {
    state.headingStartOffsetDeg = clampAlignmentOffset(state.deviceDefaultHeadingStartOffsetDeg || 0);
    state.headingEndOffsetDeg = clampAlignmentOffset(state.deviceDefaultHeadingEndOffsetDeg || 0);
    state.alignmentSource = "device";
    syncAlignmentUI();
    return true;
  }
  if (!preserveCurrent) {
    state.headingStartOffsetDeg = 0;
    state.headingEndOffsetDeg = 0;
    state.alignmentSource = "none";
    syncAlignmentUI();
  }
  return false;
}

function saveSpotAlignment() {
  const pubName = (state.pubName || els.pubName.value || "").trim();
  const seatName = (state.seatName || els.seatName.value || "").trim();
  if (!pubName || !seatName) {
    alert("Add the pub name and seat name first.");
    return;
  }
  try {
    const key = makeSpotKey(pubName, seatName);
    const map = getSavedSpotAlignments();
    map[key] = {
      pubName,
      seatName,
      headingStartOffsetDeg: clampAlignmentOffset(state.headingStartOffsetDeg),
      headingEndOffsetDeg: clampAlignmentOffset(state.headingEndOffsetDeg),
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(SPOT_ALIGNMENT_STORAGE_KEY, JSON.stringify(map));
    state.alignmentSource = "spot";
    syncAlignmentUI();
    alert(`Saved spot alignment: start ${formatOffsetLabel(state.headingStartOffsetDeg)}, end ${formatOffsetLabel(state.headingEndOffsetDeg)}.`);
  } catch (err) {
    console.error(err);
    alert("Could not save the spot alignment.");
  }
}

function saveDeviceDefaultAlignment() {
  try {
    const startValue = clampAlignmentOffset(state.headingStartOffsetDeg);
    const endValue = clampAlignmentOffset(state.headingEndOffsetDeg);
    localStorage.setItem(DEVICE_ALIGNMENT_STORAGE_KEY, JSON.stringify({ headingStartOffsetDeg: startValue, headingEndOffsetDeg: endValue, savedAt: new Date().toISOString() }));
    state.deviceDefaultHeadingStartOffsetDeg = startValue;
    state.deviceDefaultHeadingEndOffsetDeg = endValue;
    state.alignmentSource = "device";
    syncAlignmentUI();
    alert(`Saved device default: start ${formatOffsetLabel(startValue)}, end ${formatOffsetLabel(endValue)}.`);
  } catch (err) {
    console.error(err);
    alert("Could not save the device default.");
  }
}

function updateReviewFromAlignment() {
  renderProfileGraph();
  if (state.currentStep === 5 && hasPreviewInputs()) {
    calculatePreview(true);
  } else {
    render();
  }
}

function formatDateLabel(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return value;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function updateCalibrationDateText() {
  if (els.previewDate) els.previewDate.value = state.calibrationDate || "";
  if (els.calibrationDateText) {
    els.calibrationDateText.textContent = formatDateLabel(state.calibrationDate);
  }
}

async function enableMotionFromButton() {
  els.enableMotionBtn.disabled = true;
  els.motionStatus.textContent = "Requesting...";
  syncMirrorStatuses();
  try {
    await requestMotion();
    setTimeout(() => {
      if (state.motionReady && (state.headingDeg == null || state.pitchDeg == null)) {
        els.motionStatus.textContent = "Enabled - move phone slightly";
        syncMirrorStatuses();
      }
    }, 1500);
  } catch (err) {
    console.error(err);
    els.motionStatus.textContent = "Failed";
    syncMirrorStatuses();
    alert(err.message || "Could not enable motion.");
  } finally {
    els.enableMotionBtn.disabled = false;
    render();
  }
}

async function loadSiteRequirements() {
  els.loadSiteBtn.disabled = true;
  try {
    await requestLocation();
    await requestCamera();
    goToStep(3);
  } catch (err) {
    console.error(err);
    alert(err.message || "Could not load location and camera.");
  } finally {
    els.loadSiteBtn.disabled = false;
    render();
  }
}

function attachStreamToVideo(stream) {
  if (els.video && els.video.srcObject !== stream) {
    els.video.srcObject = stream;
  }
}

async function ensureVideoPlayback() {
  if (!els.video || !state.stream) return;
  attachStreamToVideo(state.stream);
  try { await els.video.play(); } catch (_) {}
}

function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported on this device/browser."));
      return;
    }
    els.gpsStatus.textContent = "Requesting...";
    syncMirrorStatuses();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.lat = pos.coords.latitude;
        state.lng = pos.coords.longitude;
        state.gpsAccuracyM = pos.coords.accuracy;
        state.gpsTimestamp = new Date(pos.timestamp).toISOString();
        state.gpsReady = true;
        const acc = Number.isFinite(state.gpsAccuracyM) ? `Ready (${Math.round(state.gpsAccuracyM)}m accuracy)` : "Ready";
        els.gpsStatus.textContent = acc;
        syncMirrorStatuses();
        render();
        resolve();
      },
      (err) => {
        els.gpsStatus.textContent = "Failed";
        syncMirrorStatuses();
        reject(new Error(`GPS failed: ${err.message}`));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

async function requestCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera access is not supported on this browser.");
  }
  els.cameraStatus.textContent = "Requesting...";
  syncMirrorStatuses();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });

  state.stream = stream;
  attachStreamToVideo(stream);
  await ensureVideoPlayback();
  state.cameraReady = true;
  els.cameraStatus.textContent = "Ready";
  syncMirrorStatuses();
}

async function requestMotion() {
  if (state.motionReady) return;
  if (state.motionRequested) return;

  if (typeof DeviceOrientationEvent === "undefined") {
    throw new Error("Device orientation is not supported on this device/browser.");
  }

  state.motionRequested = true;

  try {
    const isIOSPermissionFlow = typeof DeviceOrientationEvent.requestPermission === "function";
    if (isIOSPermissionFlow) {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== "granted") {
        throw new Error("Motion/orientation permission was denied.");
      }
    }

    window.addEventListener("deviceorientation", handleOrientation, true);
    state.motionReady = true;
    els.motionStatus.textContent = "Enabled";
    syncMirrorStatuses();
  } catch (err) {
    state.motionRequested = false;
    throw err;
  }
}

function handleOrientation(event) {
  const heading = getHeading(event);
  const pitch = getPitch(event);
  const now = Date.now();

  if (heading != null) {
    state.headingDeg = normalizeDeg(heading);
    state.recentHeadingSamples.push({ value: state.headingDeg, ts: now });
  }

  if (pitch != null) {
    state.pitchDeg = pitch;
    state.recentPitchSamples.push({ value: state.pitchDeg, ts: now });
  }

  pruneRecentMotionSamples(now);

  if (state.headingDeg != null || state.pitchDeg != null) {
    els.motionStatus.textContent = "Ready";
    syncMirrorStatuses();
    render();
  }
}

function getHeading(event) {
  let baseHeading = null;
  if (typeof event.webkitCompassHeading === "number") baseHeading = event.webkitCompassHeading;
  else if (typeof event.alpha === "number") baseHeading = 360 - event.alpha;
  if (baseHeading == null) return null;
  return normalizeDeg(baseHeading + CAMERA_HEADING_OFFSET_DEG);
}

function getPitch(event) {
  if (typeof event.beta !== "number") return null;
  return event.beta;
}

function normalizeDeg(value) {
  let out = value % 360;
  if (out < 0) out += 360;
  return out;
}

function pruneRecentMotionSamples(now = Date.now()) {
  const cutoff = now - MOTION_SAMPLE_KEEP_MS;
  state.recentPitchSamples = state.recentPitchSamples.filter((s) => s.ts >= cutoff);
  state.recentHeadingSamples = state.recentHeadingSamples.filter((s) => s.ts >= cutoff);
}

function getRecentSamples(samples, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  return samples.filter((s) => s.ts >= cutoff);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getRecentPitchMedian(windowMs = LEVEL_REFERENCE_WINDOW_MS) {
  const recent = getRecentSamples(state.recentPitchSamples, windowMs);
  if (recent.length < MIN_MOTION_SAMPLES) return null;
  return median(recent.map((s) => s.value));
}

function getRecentHeadingMean(windowMs = POINT_SAMPLE_WINDOW_MS) {
  const recent = getRecentSamples(state.recentHeadingSamples, windowMs);
  if (recent.length < MIN_MOTION_SAMPLES) return null;

  let sumX = 0;
  let sumY = 0;
  for (const sample of recent) {
    const rad = (sample.value * Math.PI) / 180;
    sumX += Math.cos(rad);
    sumY += Math.sin(rad);
  }
  if (sumX === 0 && sumY === 0) return null;
  return normalizeDeg((Math.atan2(sumY, sumX) * 180) / Math.PI);
}

function getStabilizedReading() {
  const pitch = getRecentPitchMedian(POINT_SAMPLE_WINDOW_MS);
  const heading = getRecentHeadingMean(POINT_SAMPLE_WINDOW_MS);
  return {
    pitchDeg: pitch ?? state.pitchDeg,
    headingDeg: heading ?? state.headingDeg
  };
}

function setLevelReference() {
  if (!state.motionReady) return alert("Enable motion first.");
  const levelPitch = getRecentPitchMedian(LEVEL_REFERENCE_WINDOW_MS);
  if (levelPitch == null) {
    return alert("Hold the phone level and steady for a moment, then try again.");
  }
  state.levelPitch = round1(levelPitch);
  state.levelCapturedAt = new Date().toISOString();
  els.previewOutput.textContent = "Eye-level reference set. You can now mark the skyline.";
  goToStep(4);
}

function addPoint() {
  if (!state.gpsReady || !state.cameraReady) return alert("Load location and camera first.");
  if (!state.motionReady) return alert("Enable motion first.");
  if (state.levelPitch == null) return alert("Set the eye-level reference first.");

  const reading = getStabilizedReading();
  if (reading.headingDeg == null || reading.pitchDeg == null) {
    return alert("Hold the phone steady for a moment and try again.");
  }

  const rawRelativeAltDeg = computeRawRelativeAltitude(state.levelPitch, reading.pitchDeg);
  const relativeAltDeg = computeStoredRelativeAltitude(rawRelativeAltDeg);
  state.samples.push({
    headingDeg: round1(reading.headingDeg),
    pitchDeg: round1(reading.pitchDeg),
    rawRelativeAltDeg,
    relativeAltDeg,
    capturedAt: new Date().toISOString()
  });
  els.previewOutput.textContent = "Points updated. Tap Preview sun times.";
  render();
  renderCameraOverlay();
}

function undoPoint() {
  if (!state.samples.length) return;
  state.samples.pop();
  render();
}

function clearPoints() {
  if (!state.samples.length) return;
  if (!confirm("Clear all captured points and start again?")) return;
  state.samples = [];
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  els.previewOutput.textContent = "Points cleared. Capture a new sweep.";
  render();
}

function calculatePreview(silent = false) {
  if (!window.SunCalc) {
    els.previewOutput.textContent = "SunCalc did not load.";
    return;
  }
  if (!hasPreviewInputs()) {
    if (!silent) alert("You need an eye-level reference, location, and at least 2 points before preview will work.");
    return;
  }
  const selectedDate = state.calibrationDate || els.previewDate.value;
  if (!selectedDate) {
    if (!silent) alert("No calibration date found.");
    return;
  }

  const profile = buildProfile();
  const profileBins = buildProfileBins(profile, 1);
  const sunPath = buildSunPath(selectedDate, profile);
  const overlap = getHeadingOverlap(profile, sunPath);
  const windows = getSunWindowsForDate(selectedDate, profileBins);

  const capturedRange = getCapturedRangeText(profile);
  const sweepWidth = getSweepWidthDeg(profile);
  const sunRange = sunPath.length ? formatHeadingArrow(sunPath[0].rawHeadingDeg, sunPath[sunPath.length - 1].rawHeadingDeg) : "No sun above horizon";

  const alignmentText = `start ${formatOffsetLabel(state.headingStartOffsetDeg)}, end ${formatOffsetLabel(state.headingEndOffsetDeg)}`;

  if (!sunPath.length) {
    els.previewOutput.innerHTML = `<strong>No sun above horizon</strong><br>No solar path was found above the horizon for this date at this location.<br><br><strong>Two-point alignment:</strong> ${alignmentText}`;
    renderProfileGraph();
    return;
  }
  if (!overlap.hasOverlap) {
    els.previewOutput.innerHTML = `<strong>No overlap between the captured sweep and the sun path</strong><br>Captured sweep: ${capturedRange}<br>Sweep width: ${sweepWidth.toFixed(1)}°<br>Sun path on this date: ${sunRange}<br><strong>Two-point alignment:</strong> ${alignmentText}`;
    renderProfileGraph();
    return;
  }
  if (!windows.length) {
    els.previewOutput.innerHTML = `<strong>No direct sun detected inside the captured sweep</strong><br>Captured sweep: ${capturedRange}<br>Sweep width: ${sweepWidth.toFixed(1)}°<br>Sun path on this date: ${sunRange}<br><strong>Two-point alignment:</strong> ${alignmentText}`;
    renderProfileGraph();
    return;
  }

  const list = windows.map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`).join("<br>");
  els.previewOutput.innerHTML = `<strong>Sun windows</strong><br>${list}<br><br><strong>Captured sweep:</strong> ${capturedRange}<br><strong>Sweep width:</strong> ${sweepWidth.toFixed(1)}°<br><strong>Sun path:</strong> ${sunRange}<br><strong>Two-point alignment:</strong> ${alignmentText}`;
  renderProfileGraph();
}

function buildProfile() {
  const entries = state.samples
    .map((sample, index) => ({
      rawHeadingDeg: normalizeDeg(sample.headingDeg),
      originalHeadingDeg: normalizeDeg(sample.headingDeg),
      obstructionAltDeg: Number.isFinite(sample.relativeAltDeg)
        ? sample.relativeAltDeg
        : computeStoredRelativeAltitude(computeRawRelativeAltitude(state.levelPitch, sample.pitchDeg)),
      pitchDeg: sample.pitchDeg,
      captureIndex: index,
      sample
    }))
    .filter((entry) => Number.isFinite(entry.rawHeadingDeg) && Number.isFinite(entry.obstructionAltDeg));

  if (!entries.length) return [];

  const sequenceUnwrapped = unwrapEntriesByCaptureSequence(entries);
  const ordered = [...sequenceUnwrapped].sort((a, b) => a.sequenceHeadingDeg - b.sequenceHeadingDeg);
  const baseStart = ordered[0].sequenceHeadingDeg;
  const baseEnd = ordered[ordered.length - 1].sequenceHeadingDeg;
  const baseSpan = Math.max(0.0001, baseEnd - baseStart);
  const alignedStart = baseStart + (state.headingStartOffsetDeg || 0);
  const alignedEnd = baseEnd + (state.headingEndOffsetDeg || 0);
  const alignedSpan = Math.max(0.0001, alignedEnd - alignedStart);

  return ordered.map((entry) => {
    const t = (entry.sequenceHeadingDeg - baseStart) / baseSpan;
    return {
      originalHeadingDeg: entry.originalHeadingDeg,
      rawHeadingDeg: entry.rawHeadingDeg,
      captureIndex: entry.captureIndex,
      baseAdjustedHeadingDeg: entry.sequenceHeadingDeg,
      adjustedHeadingDeg: alignedStart + t * alignedSpan,
      obstructionAltDeg: entry.obstructionAltDeg,
      pitchDeg: entry.pitchDeg
    };
  });
}

function buildProfileBins(profile, binSizeDeg = 1) {
  if (!profile || profile.length < 2) return null;
  const minHeading = Math.floor(profile[0].adjustedHeadingDeg);
  const maxHeading = Math.ceil(profile[profile.length - 1].adjustedHeadingDeg);
  const bins = [];
  for (let h = minHeading; h <= maxHeading; h += binSizeDeg) {
    bins.push({ heading: h, obstructionAltDeg: interpolateObstructionAtHeading(h, profile) });
  }
  return { minHeading, maxHeading, binSizeDeg, bins, profile };
}

function interpolateObstructionAtHeading(targetHeading, profile) {
  if (!profile.length) return 0;
  if (profile.length === 1) return profile[0].obstructionAltDeg;
  if (targetHeading <= profile[0].adjustedHeadingDeg) return profile[0].obstructionAltDeg;
  if (targetHeading >= profile[profile.length - 1].adjustedHeadingDeg) return profile[profile.length - 1].obstructionAltDeg;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    if (targetHeading >= a.adjustedHeadingDeg && targetHeading <= b.adjustedHeadingDeg) {
      const span = b.adjustedHeadingDeg - a.adjustedHeadingDeg;
      if (span === 0) return Math.max(a.obstructionAltDeg, b.obstructionAltDeg);
      const t = (targetHeading - a.adjustedHeadingDeg) / span;
      return a.obstructionAltDeg + (b.obstructionAltDeg - a.obstructionAltDeg) * t;
    }
  }
  return 0;
}

function buildSunPath(dateStr, profile) {
  if (!window.SunCalc || state.lat == null || state.lng == null) return [];
  const points = [];
  const worldCenter = profile && profile.length
    ? (profile[0].adjustedHeadingDeg + profile[profile.length - 1].adjustedHeadingDeg) / 2
    : 180;

  for (let minutes = 4 * 60; minutes <= 22 * 60; minutes += 5) {
    const dt = localDateAtMinutes(dateStr, minutes);
    const pos = window.SunCalc.getPosition(dt, state.lat, state.lng);
    const altDeg = radToDeg(pos.altitude);
    if (altDeg <= 0) continue;
    const rawHeadingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
    const adjustedHeadingDeg = unwrapHeadingNear(worldCenter, rawHeadingDeg);
    points.push({ date: dt, rawHeadingDeg, adjustedHeadingDeg, altDeg });
  }
  return points;
}

function getSunWindowsForDate(dateStr, profileBins) {
  if (!profileBins || !profileBins.bins.length) return [];
  const windows = [];
  let openWindow = null;
  for (let minutes = 4 * 60; minutes <= 22 * 60; minutes += 1) {
    const dt = localDateAtMinutes(dateStr, minutes);
    const visible = isSunVisibleAt(dt, profileBins);
    if (visible && !openWindow) openWindow = { start: dt, end: dt };
    else if (visible && openWindow) openWindow.end = dt;
    else if (!visible && openWindow) {
      windows.push({ ...openWindow });
      openWindow = null;
    }
  }
  if (openWindow) windows.push({ ...openWindow });
  return mergeTinyGaps(windows, 5);
}

function mergeTinyGaps(windows, maxGapMinutes = 5) {
  if (!windows.length) return [];
  const merged = [{ ...windows[0] }];
  for (let i = 1; i < windows.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = windows[i];
    const gapMinutes = (curr.start - prev.end) / 60000;
    if (gapMinutes <= maxGapMinutes) prev.end = curr.end;
    else merged.push({ ...curr });
  }
  return merged;
}

function isSunVisibleAt(dateObj, profileBins) {
  const pos = window.SunCalc.getPosition(dateObj, state.lat, state.lng);
  const sunAltDeg = radToDeg(pos.altitude);
  if (sunAltDeg <= 0) return false;
  const sunHeadingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
  const obstructionAltDeg = getObstructionAltitudeAtWorldHeading(sunHeadingDeg, profileBins);
  if (obstructionAltDeg == null) return false;
  return sunAltDeg > obstructionAltDeg + 0.5;
}

function getObstructionAltitudeAtWorldHeading(compassHeadingDeg, profileBins) {
  if (!profileBins || !profileBins.bins.length) return null;
  const worldCenter = (profileBins.minHeading + profileBins.maxHeading) / 2;
  const targetWorldHeading = unwrapHeadingNear(worldCenter, compassHeadingDeg);
  if (targetWorldHeading < profileBins.minHeading || targetWorldHeading > profileBins.maxHeading) return null;
  return interpolateObstructionAtHeading(targetWorldHeading, profileBins.profile);
}

function getHeadingOverlap(profile, sunPath) {
  if (!profile.length || !sunPath.length) return { hasOverlap: false };
  const profileMin = profile[0].adjustedHeadingDeg;
  const profileMax = profile[profile.length - 1].adjustedHeadingDeg;
  const sunMin = Math.min(...sunPath.map((p) => p.adjustedHeadingDeg));
  const sunMax = Math.max(...sunPath.map((p) => p.adjustedHeadingDeg));
  const start = Math.max(profileMin, sunMin);
  const end = Math.min(profileMax, sunMax);
  return { hasOverlap: end >= start, start, end };
}

function localDateAtMinutes(dateStr, totalMinutes) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function shortestAngleDelta(fromDeg, toDeg) {
  let delta = normalizeDeg(toDeg) - normalizeDeg(fromDeg);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function unwrapHeadingNear(referenceDeg, headingDeg) {
  const candidates = [headingDeg - 720, headingDeg - 360, headingDeg, headingDeg + 360, headingDeg + 720];
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate - referenceDeg) < Math.abs(best - referenceDeg) ? candidate : best
  ), candidates[0]);
}


function unwrapEntriesByCaptureSequence(entries) {
  if (entries.length <= 1) {
    return entries.map((entry) => ({ ...entry, sequenceHeadingDeg: entry.rawHeadingDeg }));
  }

  const unwrapped = [];
  let previousRaw = entries[0].rawHeadingDeg;
  let currentWorld = entries[0].rawHeadingDeg;
  unwrapped.push({ ...entries[0], sequenceHeadingDeg: currentWorld });

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    const delta = shortestAngleDelta(previousRaw, entry.rawHeadingDeg);
    currentWorld += delta;
    unwrapped.push({ ...entry, sequenceHeadingDeg: currentWorld });
    previousRaw = entry.rawHeadingDeg;
  }

  return unwrapped;
}

function selectDominantHeadingCluster(entries) {
  if (entries.length <= 2) return entries;

  const span = entries[entries.length - 1].adjustedHeadingDeg - entries[0].adjustedHeadingDeg;
  if (span <= MAX_CAPTURE_SWEEP_DEG) return entries;

  let bestStart = 0;
  let bestEnd = entries.length - 1;
  let bestCount = 0;
  let bestWidth = Infinity;

  for (let start = 0; start < entries.length; start++) {
    let end = start;
    while (end + 1 < entries.length && entries[end + 1].adjustedHeadingDeg - entries[start].adjustedHeadingDeg <= MAX_CAPTURE_SWEEP_DEG) {
      end += 1;
    }
    const count = end - start + 1;
    const width = entries[end].adjustedHeadingDeg - entries[start].adjustedHeadingDeg;
    if (count > bestCount || (count === bestCount && width < bestWidth)) {
      bestCount = count;
      bestWidth = width;
      bestStart = start;
      bestEnd = end;
    }
  }

  const minKeep = Math.max(MIN_DOMINANT_CLUSTER_POINTS, Math.ceil(entries.length * 0.6));
  if (bestCount >= minKeep) {
    return entries.slice(bestStart, bestEnd + 1);
  }
  return entries;
}

function getSweepWidthDeg(profile) {
  if (!profile || profile.length < 2) return 0;
  return round1(profile[profile.length - 1].adjustedHeadingDeg - profile[0].adjustedHeadingDeg);
}

function getCapturedRangeText(profile) {
  if (!profile || !profile.length) return "No captured sweep";
  return formatHeadingArrow(profile[0].rawHeadingDeg, profile[profile.length - 1].rawHeadingDeg);
}

function getQualitySummary() {
  if (state.samples.length < 4) return "Low";
  const profile = buildProfile();
  const sweepWidth = getSweepWidthDeg(profile);
  if (sweepWidth < 12) return "Low";
  if (hasLargeHeadingGap(profile)) return "Fair";
  return "Good";
}

function computeRawRelativeAltitude(levelPitch, pitchDeg) {
  if (!Number.isFinite(levelPitch) || !Number.isFinite(pitchDeg)) return null;
  return round1(pitchDeg - levelPitch);
}

function computeStoredRelativeAltitude(rawRelativeAltDeg) {
  if (!Number.isFinite(rawRelativeAltDeg)) return 0;
  return round1(clampRelativeAltitude(Math.abs(rawRelativeAltDeg)));
}

function clampCapturedRelativeAltitude(rawRelativeAltDeg) {
  if (!Number.isFinite(rawRelativeAltDeg)) return 0;
  return computeStoredRelativeAltitude(rawRelativeAltDeg);
}

function formatSignedDeg(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}°`;
}

function getAlignedHeadingForRawHeading(rawHeadingDeg) {
  const profile = buildProfile();
  if (!profile.length) return normalizeDeg(rawHeadingDeg);
  const baseStart = profile[0].baseAdjustedHeadingDeg ?? profile[0].adjustedHeadingDeg;
  const baseEnd = profile[profile.length - 1].baseAdjustedHeadingDeg ?? profile[profile.length - 1].adjustedHeadingDeg;
  const alignedStart = profile[0].adjustedHeadingDeg;
  const alignedEnd = profile[profile.length - 1].adjustedHeadingDeg;
  const baseCenter = (baseStart + baseEnd) / 2;
  const worldRawHeading = unwrapHeadingNear(baseCenter, normalizeDeg(rawHeadingDeg));
  const t = (worldRawHeading - baseStart) / Math.max(0.0001, baseEnd - baseStart);
  return normalizeDeg(alignedStart + t * (alignedEnd - alignedStart));
}

function getCaptureDebugLine() {
  const pitchText = Number.isFinite(state.pitchDeg) ? `${state.pitchDeg.toFixed(1)}°` : "—";
  if (state.currentStep === 3) {
    if (!Number.isFinite(state.levelPitch)) return `Live pitch <strong>${pitchText}</strong>. Set the reticle on the true eye-level horizon, then tap the button.`;
    const rawRelativeAltDeg = computeRawRelativeAltitude(state.levelPitch, state.pitchDeg);
    return `Level <strong>${state.levelPitch.toFixed(1)}°</strong> • live relative <strong>${formatSignedDeg(rawRelativeAltDeg)}</strong>`;
  }
  const rawRelativeAltDeg = computeRawRelativeAltitude(state.levelPitch, state.pitchDeg);
  return `Live relative <strong>${formatSignedDeg(rawRelativeAltDeg)}</strong> • level <strong>${Number.isFinite(state.levelPitch) ? state.levelPitch.toFixed(1) + "°" : "—"}</strong> • pitch <strong>${pitchText}</strong>`;
}

function hasLargeHeadingGap(profile) {
  for (let i = 1; i < profile.length; i++) {
    if (Math.abs(profile[i].adjustedHeadingDeg - profile[i - 1].adjustedHeadingDeg) > 12) return true;
  }
  return false;
}

function render() {
  const screens = [els.screen1, els.screen2, els.screen3, els.screen4, els.screen5];
  screens.forEach((screen, idx) => {
    const step = idx + 1;
    const shouldShow = step === state.currentStep && !(state.currentStep === 4 && step === 4);
    screen.classList.toggle("hidden", !shouldShow);
  });

  const chips = [els.chip1, els.chip2, els.chip3, els.chip4, els.chip5];
  chips.forEach((chip, idx) => {
    chip.classList.toggle("active", idx + 1 === state.currentStep);
    chip.classList.toggle("done", idx + 1 < state.currentStep);
  });

  document.body.classList.toggle("capture-focus", state.currentStep === 3 || state.currentStep === 4);
  document.body.classList.toggle("capture-step4", state.currentStep === 4);

  els.stepSummary.textContent = `Step ${state.currentStep} of 5`;
  updateCalibrationDateText();
  syncAlignmentUI();
  els.cameraStage.classList.toggle("hidden", !(state.currentStep === 3 || state.currentStep === 4));
  if (els.screen4) {
    els.screen4.style.display = state.currentStep === 4 ? "none" : "";
    if (state.currentStep === 4) els.screen4.setAttribute("hidden", "hidden");
    else els.screen4.removeAttribute("hidden");
  }

  els.toStep3Btn.disabled = !(state.motionReady && state.gpsReady && state.cameraReady);
  els.setHorizonBtn.disabled = !(state.motionReady && state.pitchDeg != null);
  els.addPointBtn.disabled = !canCapture();
  els.undoPointBtn.disabled = state.samples.length === 0;
  els.clearBtn.disabled = state.samples.length === 0;
  els.toStep5Btn.disabled = state.samples.length < 2;
  els.previewBtn.disabled = !hasPreviewInputs();
  els.saveDraftBtn.disabled = !hasMinimumData();
  els.exportBtn.disabled = !hasMinimumData();
  els.saveSpotAlignmentBtn.disabled = !(state.pubName && state.seatName);
  els.saveDeviceDefaultBtn.disabled = false;

  const quality = getQualitySummary();
  if (els.captureSummary) els.captureSummary.textContent = `${state.samples.length} point${state.samples.length === 1 ? "" : "s"} • ${quality}`;

  els.enableMotionBtn.disabled = state.motionReady;
  els.enableMotionBtn.textContent = state.motionReady ? "Motion enabled" : "Enable motion";

  if (els.floatingPointsBadge) {
    const label = `${state.samples.length} point${state.samples.length === 1 ? "" : "s"}`;
    els.floatingPointsBadge.textContent = label;
    els.floatingPointsBadge.classList.toggle("hidden", state.currentStep !== 4);
  }

  if (els.cameraActions) {
    els.cameraActions.classList.toggle("hidden", !(state.currentStep === 3 || state.currentStep === 4));
  }

  els.setHorizonBtn.classList.toggle("hidden", state.currentStep !== 3);
  els.captureBar.classList.toggle("hidden", state.currentStep !== 4);
  els.levelStatusLine.classList.toggle("hidden", state.currentStep !== 3);
  els.captureUtilityRow.classList.toggle("hidden", state.currentStep !== 4);
  if (els.captureDebugLine) {
    els.captureDebugLine.classList.toggle("hidden", !(state.currentStep === 3 || state.currentStep === 4));
    els.captureDebugLine.innerHTML = getCaptureDebugLine();
  }
  if (els.arPreviewRow) {
    els.arPreviewRow.classList.toggle("hidden", state.currentStep !== 4);
  }
  if (els.overlayAlignRow) {
    els.overlayAlignRow.classList.toggle("hidden", state.currentStep !== 4);
  }
  if (els.sunOverlayBadge) {
    els.sunOverlayBadge.classList.toggle("hidden", !(state.currentStep === 3 || state.currentStep === 4));
  }
  if (els.cameraBackBtn) {
    els.cameraBackBtn.classList.toggle("hidden", state.currentStep !== 4);
  }

  renderPoints();
  renderProfileGraph();
  syncMirrorStatuses();
  renderCameraOverlay();
}

function renderPoints() {
  els.pointsList.innerHTML = "";
  state.samples.forEach((sample, index) => {
    const li = document.createElement("li");
    const rawInfo = Number.isFinite(sample.rawRelativeAltDeg) ? ` (raw ${formatSignedDeg(sample.rawRelativeAltDeg)})` : "";
    const alignedHeading = getAlignedHeadingForRawHeading(sample.headingDeg);
    li.innerHTML = `<div><strong>Point ${index + 1}</strong></div><div class="meta-line">Heading ${sample.headingDeg.toFixed(1)}° → aligned ${alignedHeading.toFixed(1)}°, pitch ${sample.pitchDeg.toFixed(1)}°</div><div class="meta-line">Relative obstruction ${sample.relativeAltDeg.toFixed(1)}°${rawInfo}</div><div class="meta-line">${formatTime(sample.capturedAt)}</div>`;
    els.pointsList.appendChild(li);
  });
}

function renderProfileGraph() {
  const canvas = els.profileCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#faf8f2";
  ctx.fillRect(0, 0, width, height);

  const profile = state.samples.length >= 2 ? buildProfile() : [];
  const previewDate = els.previewDate.value;
  const sunPath = profile.length >= 2 && previewDate && state.lat != null && state.lng != null ? buildSunPath(previewDate, profile) : [];
  drawGraphFrame(ctx, width, height);

  if (profile.length < 2) {
    els.graphHint.textContent = "Add at least 2 points to draw the skyline outline.";
    els.rangeInfo.textContent = "No heading ranges yet.";
    drawGraphText(ctx, width, height, "Add at least 2 points");
    return;
  }

  const pad = { top: 18, right: 18, bottom: 34, left: 42 };
  const graphW = width - pad.left - pad.right;
  const graphH = height - pad.top - pad.bottom;
  const xMin = profile[0].adjustedHeadingDeg;
  const xMax = profile[profile.length - 1].adjustedHeadingDeg;
  const sunInSweep = sunPath.filter((p) => p.adjustedHeadingDeg >= xMin && p.adjustedHeadingDeg <= xMax);

  let yMax = 0;
  for (const p of profile) yMax = Math.max(yMax, p.obstructionAltDeg);
  for (const p of sunInSweep) yMax = Math.max(yMax, p.altDeg);
  yMax = Math.max(10, Math.ceil(yMax / 5) * 5);

  drawGraphGrid(ctx, pad, graphW, graphH, yMax);
  drawHeadingLabels(ctx, profile, pad, graphW, graphH);
  drawSkylineFill(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH);
  drawSkylineLine(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH);

  if (sunInSweep.length) {
    drawSunPathLine(ctx, sunInSweep, xMin, xMax, yMax, pad, graphW, graphH);
    drawVisibleSunSegments(ctx, sunInSweep, profile, xMin, xMax, yMax, pad, graphW, graphH);
    drawSunHourMarkers(ctx, sunInSweep, xMin, xMax, yMax, pad, graphW, graphH);
  }

  const capturedRange = getCapturedRangeText(profile);
  const sweepWidth = getSweepWidthDeg(profile);
  const sunRange = sunPath.length ? formatHeadingArrow(sunPath[0].rawHeadingDeg, sunPath[sunPath.length - 1].rawHeadingDeg) : "No sun above horizon";
  const overlap = getHeadingOverlap(profile, sunPath);
  const visibleWindows = buildVisibleWindowSummary(sunInSweep, profile);
  els.graphHint.textContent = "Skyline points are joined into the black outline. The dashed line is the full sun path. The gold line shows where the sun stays above the skyline.";
  els.rangeInfo.textContent = `Captured sweep: ${capturedRange} | Sweep width: ${sweepWidth.toFixed(1)}° | Sun path: ${sunRange} | Start align: ${formatOffsetLabel(state.headingStartOffsetDeg)} | End align: ${formatOffsetLabel(state.headingEndOffsetDeg)} | Visible inside sweep: ${visibleWindows || (overlap.hasOverlap ? "None" : "No overlap")}`;
}

function toGraphX(value, min, max, left, width) {
  const span = Math.max(1, max - min);
  return left + ((value - min) / span) * width;
}

function toGraphY(value, yMax, top, height) {
  return top + height - (value / Math.max(1, yMax)) * height;
}

function drawGraphFrame(ctx, width, height) {
  ctx.strokeStyle = "#d8d0c1";
  ctx.lineWidth = 1;
  ctx.strokeRect(42, 18, width - 60, height - 52);
}

function drawGraphText(ctx, width, height, text) {
  ctx.fillStyle = "#6c6c6c";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
}

function drawGraphGrid(ctx, pad, graphW, graphH, yMax) {
  ctx.fillStyle = "#6c6c6c";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const value = (yMax / 4) * i;
    const y = pad.top + graphH - (value / yMax) * graphH;
    ctx.strokeStyle = "#eee7d9";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + graphW, y);
    ctx.stroke();
    ctx.fillStyle = "#6c6c6c";
    ctx.fillText(`${Math.round(value)}°`, pad.left - 6, y);
  }
}

function drawHeadingLabels(ctx, profile, pad, graphW, graphH) {
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#6c6c6c";
  ctx.fillText(`${normalizeDeg(profile[0].rawHeadingDeg).toFixed(0)}°`, pad.left, pad.top + graphH + 8);
  ctx.fillText(`${normalizeDeg(profile[profile.length - 1].rawHeadingDeg).toFixed(0)}°`, pad.left + graphW, pad.top + graphH + 8);
  const midHeading = (profile[0].adjustedHeadingDeg + profile[profile.length - 1].adjustedHeadingDeg) / 2;
  const midX = toGraphX(midHeading, profile[0].adjustedHeadingDeg, profile[profile.length - 1].adjustedHeadingDeg, pad.left, graphW);
  ctx.fillText(`${normalizeDeg(midHeading).toFixed(0)}°`, midX, pad.top + graphH + 8);
}

function drawSkylineFill(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  ctx.beginPath();
  profile.forEach((p, i) => {
    const x = toGraphX(p.adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(p.obstructionAltDeg, yMax, pad.top, graphH);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const lastX = toGraphX(profile[profile.length - 1].adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
  const firstX = toGraphX(profile[0].adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
  ctx.lineTo(lastX, pad.top + graphH);
  ctx.lineTo(firstX, pad.top + graphH);
  ctx.closePath();
  ctx.fillStyle = "rgba(31, 31, 31, 0.14)";
  ctx.fill();
}

function drawSkylineLine(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  for (const p of profile) {
    const x = toGraphX(p.adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
    ctx.strokeStyle = "rgba(31,31,31,0.08)";
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + graphH);
    ctx.stroke();
  }

  ctx.beginPath();
  profile.forEach((p, i) => {
    const x = toGraphX(p.adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(p.obstructionAltDeg, yMax, pad.top, graphH);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 2.25;
  ctx.stroke();
  ctx.lineWidth = 1;

  for (const p of profile) {
    const x = toGraphX(p.adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(p.obstructionAltDeg, yMax, pad.top, graphH);
    ctx.beginPath();
    ctx.arc(x, y, 3.25, 0, Math.PI * 2);
    ctx.fillStyle = "#1f1f1f";
    ctx.fill();
  }
}

function drawSunPathLine(ctx, sunInSweep, xMin, xMax, yMax, pad, graphW, graphH) {
  ctx.beginPath();
  sunInSweep.forEach((p, i) => {
    const x = toGraphX(p.adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(p.altDeg, yMax, pad.top, graphH);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#d06a00";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function drawVisibleSunSegments(ctx, sunInSweep, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  const segments = getVisibleSunSegments(sunInSweep, profile);
  for (const segment of segments) {
    if (segment.length < 2) continue;
    ctx.beginPath();
    segment.forEach((p, i) => {
      const x = toGraphX(p.adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
      const y = toGraphY(p.altDeg, yMax, pad.top, graphH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#f1c74c";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawSunHourMarkers(ctx, sunInSweep, xMin, xMax, yMax, pad, graphW, graphH) {
  const hourPoints = sunInSweep.filter((p) => p.date.getMinutes() === 0);
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const p of hourPoints) {
    const x = toGraphX(p.adjustedHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(p.altDeg, yMax, pad.top, graphH);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#d06a00";
    ctx.fill();
    ctx.fillStyle = "#8b5200";
    ctx.fillText(`${String(p.date.getHours()).padStart(2, "0")}:00`, x, y - 6);
  }
}

function getVisibleSunSegments(sunInSweep, profile) {
  const segments = [];
  let current = [];
  for (const p of sunInSweep) {
    const obstruction = interpolateObstructionAtHeading(p.adjustedHeadingDeg, profile);
    const visible = p.altDeg > obstruction + 0.5;
    if (visible) current.push(p);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function buildVisibleWindowSummary(sunInSweep, profile) {
  const segments = getVisibleSunSegments(sunInSweep, profile);
  if (!segments.length) return "";
  return segments.map((segment) => `${formatClock(segment[0].date)}–${formatClock(segment[segment.length - 1].date)}`).join(", ");
}


function drawOverlayAlwaysOnUI(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(96, 201, 255, 0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  roundRect(ctx, 10, 10, 86, 24, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = "700 12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("AR overlay live", 20, 22);
  ctx.restore();
  return visibleCount;
}

function drawOverlayStatusRibbon(ctx, width, text) {
  if (!text) return;
  ctx.save();
  const padX = 10;
  const y = 42;
  ctx.font = "600 12px sans-serif";
  const textW = Math.min(width - 20, ctx.measureText(text).width + 20);
  const x = (width - textW) / 2;
  ctx.fillStyle = "rgba(0,0,0,0.46)";
  roundRect(ctx, x, y, textW, 24, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, y + 12);
  ctx.restore();
}

function renderCameraOverlay() {
  const canvas = els.cameraOverlay;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = Math.max(1, Math.round(canvas.clientWidth || 0));
  const height = Math.max(1, Math.round(canvas.clientHeight || 0));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.clearRect(0, 0, width, height);

  if (!(state.currentStep === 3 || state.currentStep === 4)) return;

  drawOverlayAlwaysOnUI(ctx, width, height);
  const badge = els.sunOverlayBadge;
  if (!state.motionReady || !state.gpsReady || !state.cameraReady) {
    drawOverlayStatusRibbon(ctx, width, "Enable motion, GPS and camera");
    if (badge) badge.textContent = "Enable motion, GPS and camera for live sun overlay.";
    return;
  }
  if (state.headingDeg == null || state.pitchDeg == null) {
    drawOverlayStatusRibbon(ctx, width, "Move the phone to wake the overlay");
    if (badge) badge.textContent = "Move the phone slightly to wake the live overlay.";
    return;
  }
  if (state.levelPitch == null) {
    drawCaptureGuide(ctx, width, height);
    drawOverlayStatusRibbon(ctx, width, "Set eye-level reference first");
    if (badge) badge.textContent = "Set eye-level reference to unlock today’s sun overlay.";
    return;
  }
  if (!window.SunCalc) {
    drawOverlayStatusRibbon(ctx, width, "SunCalc failed to load");
    if (badge) badge.textContent = "Sun overlay unavailable: SunCalc did not load.";
    return;
  }

  const overlayHeadingOffsetDeg = getOverlayHeadingOffsetDeg();
  const viewHeadingDeg = normalizeDeg(state.headingDeg + overlayHeadingOffsetDeg);
  const cameraRelativeAltDeg = computeRawRelativeAltitude(state.levelPitch, state.pitchDeg) || 0;
  const view = {
    headingDeg: viewHeadingDeg,
    cameraRelativeAltDeg,
    width,
    height,
    hFovDeg: CAMERA_OVERLAY_HORIZONTAL_FOV_DEG,
    vFovDeg: getOverlayVerticalFovDeg(width, height)
  };

  drawCaptureGuide(ctx, width, height);
  drawOverlayStatusRibbon(ctx, width, "Use AR preview or align overlay");
  const todayStr = state.calibrationDate || dateToLocalInputValue(new Date());
  const arcPoints = buildCameraOverlaySunArc(todayStr, overlayHeadingOffsetDeg);
  const visibleArcCount = drawCameraOverlaySunArc(ctx, arcPoints, view);
  if (!visibleArcCount) {
    drawOverlayStatusRibbon(ctx, width, "Sun arc off screen — tilt or turn");
  }

  const previewDate = getOverlayPreviewDate();
  const previewLabel = getOverlayPreviewMinutes() == null ? `Sun ${formatClock(previewDate)}` : `Preview ${formatClock(previewDate)}`;
  const previewColor = getOverlayPreviewMinutes() == null ? "rgba(241, 199, 76, 1)" : "rgba(96, 201, 255, 0.98)";
  const previewMeta = drawCameraOverlaySunMarker(ctx, view, previewDate, {
    label: previewLabel,
    markerColor: previewColor,
    glowColor: getOverlayPreviewMinutes() == null ? "rgba(241, 199, 76, 0.22)" : "rgba(96, 201, 255, 0.20)",
    arrowColor: previewColor
  });
  drawOverlayBearingStrip(ctx, view, previewMeta, previewLabel, previewColor);

  if (state.currentStep === 4) drawCameraOverlaySkyline(ctx, view, overlayHeadingOffsetDeg);

  if (badge) {
    const previewMinutes = getOverlayPreviewMinutes();
    const previewMode = previewMinutes == null ? "now" : `preview ${formatMinutesClock(previewMinutes)}`;
    if (!previewMeta) {
      badge.textContent = `Overlay ${previewMode} • no sun position available • align ${formatOffsetLabel(overlayHeadingOffsetDeg)}`;
    } else if (previewMeta.altDeg <= 0) {
      badge.textContent = `Overlay ${previewMode} • sun below horizon • align ${formatOffsetLabel(overlayHeadingOffsetDeg)}`;
    } else if (previewMeta.visible) {
      badge.textContent = `${previewMode} • ${previewMeta.headingDeg.toFixed(0)}° • ${previewMeta.altDeg.toFixed(0)}° • align ${formatOffsetLabel(overlayHeadingOffsetDeg)}`;
    } else {
      badge.textContent = `${previewMode} • off screen ${previewMeta.dxDeg > 0 ? 'right' : 'left'} • ${previewMeta.altDeg.toFixed(0)}° • align ${formatOffsetLabel(overlayHeadingOffsetDeg)}`;
    }
  }
}

function getOverlayVerticalFovDeg(width, height) {
  const hFovRad = (CAMERA_OVERLAY_HORIZONTAL_FOV_DEG * Math.PI) / 180;
  const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) * (height / Math.max(1, width)));
  return (vFovRad * 180) / Math.PI;
}

function buildCameraOverlaySunArc(dateStr, overlayHeadingOffsetDeg = 0) {
  const points = [];
  if (state.lat == null || state.lng == null || !window.SunCalc) return points;
  for (let minutes = 0; minutes <= 24 * 60; minutes += CAMERA_OVERLAY_ARC_STEP_MINUTES) {
    const date = localDateAtMinutes(dateStr, Math.min(minutes, 23 * 60 + 59));
    const pos = window.SunCalc.getPosition(date, state.lat, state.lng);
    const altDeg = radToDeg(pos.altitude);
    if (altDeg <= -1) continue;
    const headingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
    points.push({
      date,
      headingDeg,
      displayHeadingDeg: normalizeDeg(headingDeg),
      altDeg
    });
  }
  return points;
}

function projectOverlayPoint(view, targetHeadingDeg, targetAltDeg) {
  const dxDeg = shortestAngleDelta(view.headingDeg, targetHeadingDeg);
  const dyDeg = targetAltDeg - view.cameraRelativeAltDeg;
  const halfH = view.hFovDeg / 2;
  const halfV = view.vFovDeg / 2;
  const x = view.width / 2 + (dxDeg / halfH) * (view.width / 2);
  const y = view.height / 2 - (dyDeg / halfV) * (view.height / 2);
  return {
    x,
    y,
    dxDeg,
    dyDeg,
    visible: Math.abs(dxDeg) <= halfH * 1.1 && Math.abs(dyDeg) <= halfV * 1.2
  };
}

function drawOverlayBearingStrip(ctx, view, meta, label, color) {
  if (!meta) return;
  const pad = 12;
  const barW = Math.max(140, Math.min(view.width - 24, 260));
  const barH = 22;
  const x = (view.width - barW) / 2;
  const y = 12;
  const halfH = view.hFovDeg / 2;
  const ratio = Math.max(-1, Math.min(1, meta.dxDeg / Math.max(1, halfH)));
  const markerX = x + ((ratio + 1) / 2) * barW;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.36)";
  roundRect(ctx, x, y, barW, barH, 11);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, barW, barH, 11);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + barW / 2, y + 4);
  ctx.lineTo(x + barW / 2, y + barH - 4);
  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(markerX, y + barH / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();

  if (!meta.visible) {
    ctx.fillStyle = color;
    if (ratio < 0) {
      ctx.beginPath();
      ctx.moveTo(x + 5, y + barH / 2);
      ctx.lineTo(x + 14, y + 5);
      ctx.lineTo(x + 14, y + barH - 5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + barW - 5, y + barH / 2);
      ctx.lineTo(x + barW - 14, y + 5);
      ctx.lineTo(x + barW - 14, y + barH - 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const status = meta.altDeg <= 0 ? `${label} below horizon` : meta.visible ? label : `${label} off screen`;
  ctx.fillText(status, view.width / 2, y + barH + 4);
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCaptureGuide(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 12, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(96, 201, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawCameraOverlaySunArc(ctx, arcPoints, view) {
  if (!arcPoints.length) return 0;
  let visibleCount = 0;
  let started = false;
  ctx.save();
  ctx.strokeStyle = "rgba(241, 199, 76, 0.95)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  for (const point of arcPoints) {
    const p = projectOverlayPoint(view, point.headingDeg, point.altDeg);
    if (!p.visible) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (const point of arcPoints) {
    if (point.date.getMinutes() !== 0) continue;
    const p = projectOverlayPoint(view, point.headingDeg, point.altDeg);
    if (!p.visible) continue;
    visibleCount += 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(208, 106, 0, 0.95)";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(`${String(point.date.getHours()).padStart(2, "0")}:00`, p.x, p.y - 6);
  }
  ctx.restore();
}

function drawCameraOverlaySunMarker(ctx, view, dateObj, options = {}) {
  const pos = window.SunCalc.getPosition(dateObj, state.lat, state.lng);
  const altDeg = radToDeg(pos.altitude);
  const headingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
  const projected = projectOverlayPoint(view, headingDeg, altDeg);
  const label = options.label || `Sun ${formatClock(dateObj)}`;
  const markerColor = options.markerColor || "rgba(241, 199, 76, 1)";
  const glowColor = options.glowColor || "rgba(241, 199, 76, 0.22)";
  const arrowColor = options.arrowColor || markerColor;

  if (altDeg <= 0) {
    drawOffscreenIndicator(ctx, view, projected, `${label} below`, arrowColor);
    return { headingDeg, altDeg, visible: false, dxDeg: projected.dxDeg, dyDeg: projected.dyDeg };
  }

  if (!projected.visible) {
    drawOffscreenIndicator(ctx, view, projected, label, arrowColor);
    return { headingDeg, altDeg, visible: false, dxDeg: projected.dxDeg, dyDeg: projected.dyDeg };
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = glowColor;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = markerColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = projected.x > view.width - 80 ? "right" : "left";
  ctx.textBaseline = "middle";
  const labelX = projected.x > view.width - 80 ? projected.x - 12 : projected.x + 12;
  ctx.fillText(label, labelX, projected.y);
  ctx.restore();
  return { headingDeg, altDeg, visible: true, dxDeg: projected.dxDeg, dyDeg: projected.dyDeg };
}

function drawOffscreenIndicator(ctx, view, projected, label, color) {
  const margin = 28;
  const x = Math.min(view.width - margin, Math.max(margin, projected.x));
  const y = Math.min(view.height - margin, Math.max(margin, projected.y));
  const angle = Math.atan2(projected.y - view.height / 2, projected.x - view.width / 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-9, -9);
  ctx.lineTo(-9, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = "700 12px sans-serif";
  const textW = Math.min(view.width - 20, ctx.measureText(label).width + 18);
  const labelX = x > view.width / 2 ? Math.max(10, x - textW - 16) : Math.min(view.width - textW - 10, x + 16);
  const labelY = y > view.height / 2 ? y - 24 : y + 8;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(ctx, labelX, labelY, textW, 22, 11);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX + textW / 2, labelY + 11);
  ctx.restore();
}

function drawCameraOverlaySkyline(ctx, view, overlayHeadingOffsetDeg) {
  if (!state.samples.length) return;
  const projected = state.samples.map((sample) => {
    const headingDeg = normalizeDeg(sample.headingDeg + overlayHeadingOffsetDeg);
    const altDeg = Number.isFinite(sample.relativeAltDeg)
      ? sample.relativeAltDeg
      : computeStoredRelativeAltitude(computeRawRelativeAltitude(state.levelPitch, sample.pitchDeg));
    return {
      sample,
      headingDeg,
      altDeg,
      point: projectOverlayPoint(view, headingDeg, altDeg)
    };
  });

  ctx.save();
  ctx.strokeStyle = "rgba(52, 208, 235, 0.95)";
  ctx.lineWidth = 2.5;
  let started = false;
  ctx.beginPath();
  for (const item of projected) {
    if (!item.point.visible) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(item.point.x, item.point.y);
      started = true;
    } else {
      ctx.lineTo(item.point.x, item.point.y);
    }
  }
  ctx.stroke();

  for (const item of projected) {
    if (!item.point.visible) continue;
    ctx.beginPath();
    ctx.arc(item.point.x, item.point.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(52, 208, 235, 0.98)";
    ctx.fill();
  }

  const liveRelativeAltDeg = computeRawRelativeAltitude(state.levelPitch, state.pitchDeg);
  if (Number.isFinite(liveRelativeAltDeg) && Number.isFinite(state.headingDeg)) {
    const targetHeadingDeg = normalizeDeg(state.headingDeg + overlayHeadingOffsetDeg);
    const point = projectOverlayPoint(view, targetHeadingDeg, clampCapturedRelativeAltitude(liveRelativeAltDeg));
    if (point.visible) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(52, 208, 235, 0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function syncMirrorStatuses() {
  if (!els.levelStatusLine) return;
  const readyCount = [state.motionReady, state.gpsReady, state.cameraReady].filter(Boolean).length;
  if (state.motionReady && state.gpsReady && state.cameraReady) {
    if (state.pitchDeg == null || state.headingDeg == null) {
      els.levelStatusLine.textContent = "Ready. Move the phone slightly if the reticle feels stuck.";
    } else {
      els.levelStatusLine.textContent = "Ready. Hold steady at eye level, then tap Set eye-level reference.";
    }
    return;
  }
  const missing = [];
  if (!state.motionReady) missing.push("motion");
  if (!state.gpsReady) missing.push("GPS");
  if (!state.cameraReady) missing.push("camera");
  if (!readyCount) {
    els.levelStatusLine.textContent = "Waiting for motion, GPS and camera.";
  } else {
    els.levelStatusLine.textContent = `Still needed: ${missing.join(", ")}.`;
  }
}

function canCapture() {
  return state.gpsReady && state.cameraReady && state.motionReady && state.levelPitch != null && state.headingDeg != null && state.pitchDeg != null;
}

function hasMinimumData() {
  return state.pubName && state.seatName && state.lat != null && state.lng != null && state.samples.length > 0;
}

function hasPreviewInputs() {
  return hasMinimumData() && state.levelPitch != null && state.samples.length >= 2;
}

function buildRecord() {
  return {
    pubName: state.pubName,
    seatName: state.seatName,
    notes: state.notes,
    lat: state.lat,
    lng: state.lng,
    gpsAccuracyM: state.gpsAccuracyM,
    gpsTimestamp: state.gpsTimestamp,
    calibrationDate: state.calibrationDate,
    headingStartOffsetDeg: state.headingStartOffsetDeg,
    headingEndOffsetDeg: state.headingEndOffsetDeg,
    headingAlignmentSource: state.alignmentSource,
    deviceDefaultHeadingStartOffsetDeg: state.deviceDefaultHeadingStartOffsetDeg,
    deviceDefaultHeadingEndOffsetDeg: state.deviceDefaultHeadingEndOffsetDeg,
    createdAt: new Date().toISOString(),
    deviceOrientationAvailable: state.motionReady,
    levelPitch: state.levelPitch,
    levelCapturedAt: state.levelCapturedAt,
    samples: [...state.samples]
  };
}

function saveDraft() {
  try {
    const draft = buildRecord();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    alert("Draft saved on this device.");
  } catch (err) {
    console.error(err);
    alert("Could not save draft.");
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    state.pubName = draft.pubName || "";
    state.seatName = draft.seatName || "";
    state.notes = draft.notes || "";
    state.lat = draft.lat ?? null;
    state.lng = draft.lng ?? null;
    state.gpsAccuracyM = draft.gpsAccuracyM ?? null;
    state.gpsTimestamp = draft.gpsTimestamp ?? null;
    state.calibrationDate = draft.calibrationDate || state.calibrationDate || dateToLocalInputValue(new Date());
    const legacyOffset = draft.headingOffsetDeg ?? 0;
    state.headingStartOffsetDeg = clampAlignmentOffset(draft.headingStartOffsetDeg ?? legacyOffset);
    state.headingEndOffsetDeg = clampAlignmentOffset(draft.headingEndOffsetDeg ?? legacyOffset);
    state.alignmentSource = draft.headingAlignmentSource || "draft";
    state.levelPitch = draft.levelPitch ?? null;
    state.levelCapturedAt = draft.levelCapturedAt ?? null;
    state.samples = Array.isArray(draft.samples) ? draft.samples : [];
    state.gpsReady = state.lat != null && state.lng != null;
    els.pubName.value = state.pubName;
    els.seatName.value = state.seatName;
    els.notes.value = state.notes;
    if (state.gpsReady) {
      const acc = Number.isFinite(state.gpsAccuracyM) ? `${Math.round(state.gpsAccuracyM)}m accuracy` : "saved";
      els.gpsStatus.textContent = `Draft loaded (${acc})`;
    }
    updateCalibrationDateText();
    syncAlignmentUI();
  } catch (err) {
    console.error("Draft load failed", err);
  }
}

function exportJson() {
  try {
    const record = buildRecord();
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(record.pubName || "pub")}-${slugify(record.seatName || "seat")}-calibration-v2.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Could not export JSON.");
  }
}

function slugify(input) {
  return String(input).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clampRelativeAltitude(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function formatClock(dateObj) {
  return dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHeadingArrow(startDeg, endDeg) {
  return `${normalizeDeg(startDeg).toFixed(0)}° → ${normalizeDeg(endDeg).toFixed(0)}°`;
}
