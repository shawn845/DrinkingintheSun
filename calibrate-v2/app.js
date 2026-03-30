const CAMERA_HEADING_OFFSET_DEG = 0;
const LEVEL_REFERENCE_WINDOW_MS = 900;
const POINT_SAMPLE_WINDOW_MS = 350;
const MOTION_SAMPLE_KEEP_MS = 2500;
const MIN_MOTION_SAMPLES = 5;
const MAX_CAPTURE_SWEEP_DEG = 160;
const MIN_DOMINANT_CLUSTER_POINTS = 3;

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
  headingOffsetDeg: 0
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
  headingOffsetRange: document.getElementById("headingOffsetRange"),
  headingOffsetValue: document.getElementById("headingOffsetValue"),
  headingMinusBtn: document.getElementById("headingMinusBtn"),
  headingResetBtn: document.getElementById("headingResetBtn"),
  headingPlusBtn: document.getElementById("headingPlusBtn"),
  previewOutput: document.getElementById("previewOutput"),
  video: document.getElementById("video"),
  gpsStatus: document.getElementById("gpsStatus"),
  cameraStatus: document.getElementById("cameraStatus"),
  motionStatus: document.getElementById("motionStatus"),
  pointsList: document.getElementById("pointsList"),
  profileCanvas: document.getElementById("profileCanvas"),
  graphHint: document.getElementById("graphHint"),
  rangeInfo: document.getElementById("rangeInfo"),
  floatingPointsBadge: document.getElementById("floatingPointsBadge"),
  levelStatusLine: document.getElementById("levelStatusLine"),
  captureSummary: document.getElementById("captureSummary"),
  captureBar: document.getElementById("captureBar"),
  captureUtilityRow: document.getElementById("captureUtilityRow"),
  captureDebugLine: document.getElementById("captureDebugLine"),
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
  loadDraft();
  setDefaultPreviewDate();
  render();
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
  els.headingOffsetRange.addEventListener("input", onHeadingOffsetInput);
  els.headingMinusBtn.addEventListener("click", () => nudgeHeadingOffset(-1));
  els.headingResetBtn.addEventListener("click", resetHeadingOffset);
  els.headingPlusBtn.addEventListener("click", () => nudgeHeadingOffset(1));

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
  goToStep(2);
}

function goToStep(step) {
  state.currentStep = step;
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
  syncHeadingOffsetUI();
}

function dateToLocalInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function onHeadingOffsetInput() {
  state.headingOffsetDeg = round1(Number(els.headingOffsetRange.value) || 0);
  syncHeadingOffsetUI();
  updateReviewFromHeadingOffset();
}

function nudgeHeadingOffset(delta) {
  const next = clampHeadingOffset(state.headingOffsetDeg + delta);
  state.headingOffsetDeg = round1(next);
  syncHeadingOffsetUI();
  updateReviewFromHeadingOffset();
}

function resetHeadingOffset() {
  state.headingOffsetDeg = 0;
  syncHeadingOffsetUI();
  updateReviewFromHeadingOffset();
}

function clampHeadingOffset(value) {
  return Math.max(-40, Math.min(40, Number(value) || 0));
}

function syncHeadingOffsetUI() {
  if (els.headingOffsetRange) els.headingOffsetRange.value = String(state.headingOffsetDeg || 0);
  if (els.headingOffsetValue) {
    const val = Number(state.headingOffsetDeg) || 0;
    els.headingOffsetValue.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)}°`;
  }
}

function updateReviewFromHeadingOffset() {
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
  localStorage.removeItem("dits-calibration-draft-v2");
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

  const headingOffsetText = `${state.headingOffsetDeg > 0 ? '+' : ''}${(state.headingOffsetDeg || 0).toFixed(1)}°`;

  if (!sunPath.length) {
    els.previewOutput.innerHTML = `<strong>No sun above horizon</strong><br>No solar path was found above the horizon for this date at this location.<br><br><strong>Heading alignment:</strong> ${headingOffsetText}`;
    renderProfileGraph();
    return;
  }
  if (!overlap.hasOverlap) {
    els.previewOutput.innerHTML = `<strong>No overlap between the captured sweep and the sun path</strong><br>Captured sweep: ${capturedRange}<br>Sweep width: ${sweepWidth.toFixed(1)}°<br>Sun path on this date: ${sunRange}<br><strong>Heading alignment:</strong> ${headingOffsetText}`;
    renderProfileGraph();
    return;
  }
  if (!windows.length) {
    els.previewOutput.innerHTML = `<strong>No direct sun detected inside the captured sweep</strong><br>Captured sweep: ${capturedRange}<br>Sweep width: ${sweepWidth.toFixed(1)}°<br>Sun path on this date: ${sunRange}<br><strong>Heading alignment:</strong> ${headingOffsetText}`;
    renderProfileGraph();
    return;
  }

  const list = windows.map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`).join("<br>");
  els.previewOutput.innerHTML = `<strong>Sun windows</strong><br>${list}<br><br><strong>Captured sweep:</strong> ${capturedRange}<br><strong>Sweep width:</strong> ${sweepWidth.toFixed(1)}°<br><strong>Sun path:</strong> ${sunRange}<br><strong>Heading alignment:</strong> ${headingOffsetText}`;
  renderProfileGraph();
}

function buildProfile() {
  const entries = state.samples
    .map((sample) => ({
      rawHeadingDeg: normalizeDeg(sample.headingDeg + (state.headingOffsetDeg || 0)),
      originalHeadingDeg: normalizeDeg(sample.headingDeg),
      obstructionAltDeg: Number.isFinite(sample.relativeAltDeg)
        ? sample.relativeAltDeg
        : computeStoredRelativeAltitude(computeRawRelativeAltitude(state.levelPitch, sample.pitchDeg)),
      pitchDeg: sample.pitchDeg,
      sample
    }))
    .filter((entry) => Number.isFinite(entry.rawHeadingDeg) && Number.isFinite(entry.obstructionAltDeg));

  if (!entries.length) return [];
  if (entries.length === 1) {
    return [{
      originalHeadingDeg: entries[0].originalHeadingDeg,
      rawHeadingDeg: entries[0].rawHeadingDeg,
      adjustedHeadingDeg: entries[0].rawHeadingDeg,
      obstructionAltDeg: entries[0].obstructionAltDeg,
      pitchDeg: entries[0].pitchDeg
    }];
  }

  const wrapped = unwrapHeadingEntries(entries);
  const dominant = selectDominantHeadingCluster(wrapped);

  return dominant.map((entry) => ({
    originalHeadingDeg: normalizeDeg(entry.rawHeadingDeg - (state.headingOffsetDeg || 0)),
    rawHeadingDeg: entry.rawHeadingDeg,
    adjustedHeadingDeg: entry.adjustedHeadingDeg,
    obstructionAltDeg: entry.obstructionAltDeg,
    pitchDeg: entry.pitchDeg
  }));
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
  for (let minutes = 4 * 60; minutes <= 22 * 60; minutes += 5) {
    const dt = localDateAtMinutes(dateStr, minutes);
    const pos = window.SunCalc.getPosition(dt, state.lat, state.lng);
    const altDeg = radToDeg(pos.altitude);
    if (altDeg <= 0) continue;
    const rawHeadingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
    const adjustedHeadingDeg = profile && profile.length ? mapCompassToAdjustedHeading(rawHeadingDeg, profile) : rawHeadingDeg;
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
  const obstructionAltDeg = getObstructionAltitudeAtHeading(sunHeadingDeg, profileBins);
  if (obstructionAltDeg == null) return false;
  return sunAltDeg > obstructionAltDeg + 0.5;
}

function getObstructionAltitudeAtHeading(compassHeadingDeg, profileBins) {
  if (!profileBins || !profileBins.bins.length) return null;
  const targetAdjusted = mapCompassToAdjustedHeading(compassHeadingDeg, profileBins.profile);
  if (targetAdjusted < profileBins.minHeading || targetAdjusted > profileBins.maxHeading) return null;
  const idx = Math.round((targetAdjusted - profileBins.minHeading) / profileBins.binSizeDeg);
  const clampedIdx = Math.max(0, Math.min(profileBins.bins.length - 1, idx));
  return profileBins.bins[clampedIdx].obstructionAltDeg;
}

function mapCompassToAdjustedHeading(compassHeadingDeg, profile) {
  const candidates = [compassHeadingDeg - 720, compassHeadingDeg - 360, compassHeadingDeg, compassHeadingDeg + 360, compassHeadingDeg + 720];
  const min = profile[0].adjustedHeadingDeg;
  const max = profile[profile.length - 1].adjustedHeadingDeg;
  const margin = 24;
  const inRange = candidates.filter((candidate) => candidate >= min - margin && candidate <= max + margin);
  if (inRange.length) {
    const mid = (min + max) / 2;
    return inRange.reduce((best, candidate) => Math.abs(candidate - mid) < Math.abs(best - mid) ? candidate : best, inRange[0]);
  }
  const mid = (min + max) / 2;
  return candidates.reduce((best, candidate) => Math.abs(candidate - mid) < Math.abs(best - mid) ? candidate : best, candidates[0]);
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


function unwrapHeadingEntries(entries) {
  const sorted = [...entries].sort((a, b) => a.rawHeadingDeg - b.rawHeadingDeg);
  if (sorted.length <= 1) {
    return sorted.map((entry) => ({ ...entry, adjustedHeadingDeg: entry.rawHeadingDeg }));
  }

  let largestGap = -1;
  let cutIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i].rawHeadingDeg;
    const next = i === sorted.length - 1 ? sorted[0].rawHeadingDeg + 360 : sorted[i + 1].rawHeadingDeg;
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      cutIndex = i;
    }
  }

  const start = sorted[(cutIndex + 1) % sorted.length].rawHeadingDeg;
  return sorted
    .map((entry) => ({
      ...entry,
      adjustedHeadingDeg: entry.rawHeadingDeg < start ? entry.rawHeadingDeg + 360 : entry.rawHeadingDeg
    }))
    .sort((a, b) => a.adjustedHeadingDeg - b.adjustedHeadingDeg);
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
  screens.forEach((screen, idx) => screen.classList.toggle("hidden", idx + 1 !== state.currentStep));

  const chips = [els.chip1, els.chip2, els.chip3, els.chip4, els.chip5];
  chips.forEach((chip, idx) => {
    chip.classList.toggle("active", idx + 1 === state.currentStep);
    chip.classList.toggle("done", idx + 1 < state.currentStep);
  });

  document.body.classList.toggle("capture-focus", state.currentStep === 3 || state.currentStep === 4);

  els.stepSummary.textContent = `Step ${state.currentStep} of 5`;
  updateCalibrationDateText();
  syncHeadingOffsetUI();
  els.cameraStage.classList.toggle("hidden", !(state.currentStep === 3 || state.currentStep === 4));

  els.toStep3Btn.disabled = !(state.motionReady && state.gpsReady && state.cameraReady);
  els.setHorizonBtn.disabled = !(state.motionReady && state.pitchDeg != null);
  els.addPointBtn.disabled = !canCapture();
  els.undoPointBtn.disabled = state.samples.length === 0;
  els.clearBtn.disabled = state.samples.length === 0;
  els.toStep5Btn.disabled = state.samples.length < 2;
  els.previewBtn.disabled = !hasPreviewInputs();
  els.saveDraftBtn.disabled = !hasMinimumData();
  els.exportBtn.disabled = !hasMinimumData();

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

  renderPoints();
  renderProfileGraph();
  syncMirrorStatuses();
}

function renderPoints() {
  els.pointsList.innerHTML = "";
  state.samples.forEach((sample, index) => {
    const li = document.createElement("li");
    const rawInfo = Number.isFinite(sample.rawRelativeAltDeg) ? ` (raw ${formatSignedDeg(sample.rawRelativeAltDeg)})` : "";
    const alignedHeading = normalizeDeg(sample.headingDeg + (state.headingOffsetDeg || 0));
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
  els.rangeInfo.textContent = `Captured sweep: ${capturedRange} | Sweep width: ${sweepWidth.toFixed(1)}° | Sun path: ${sunRange} | Heading alignment: ${state.headingOffsetDeg > 0 ? '+' : ''}${(state.headingOffsetDeg || 0).toFixed(1)}° | Visible inside sweep: ${visibleWindows || (overlap.hasOverlap ? "None" : "No overlap")}`;
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
    headingOffsetDeg: state.headingOffsetDeg,
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
    localStorage.setItem("dits-calibration-draft-v2", JSON.stringify(draft));
    alert("Draft saved on this device.");
  } catch (err) {
    console.error(err);
    alert("Could not save draft.");
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem("dits-calibration-draft-v2");
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
    state.headingOffsetDeg = clampHeadingOffset(draft.headingOffsetDeg ?? 0);
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
    syncHeadingOffsetUI();
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
