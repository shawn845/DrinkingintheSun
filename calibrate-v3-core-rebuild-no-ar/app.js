const LEVEL_SAMPLE_MS = 700;
const POINT_SAMPLE_MS = 550;
const MOTION_KEEP_MS = 2500;
const MIN_SAMPLE_COUNT = 5;
const MAX_POINT_HEADING_SPREAD_DEG = 6;
const MAX_POINT_PITCH_SPREAD_DEG = 3;
const MAX_LEVEL_PITCH_SPREAD_DEG = 2.5;
const MAX_TOTAL_SWEEP_DEG = 160;
const DRAFT_STORAGE_KEY = "dits-calibration-rebuild-draft-v1";
const CAMERA_HEADING_OFFSET_DEG = 0;

const state = {
  pubName: "",
  seatName: "",
  notes: "",
  currentStep: 1,
  motionReady: false,
  motionRequested: false,
  gpsReady: false,
  cameraReady: false,
  headingDeg: null,
  pitchDeg: null,
  lat: null,
  lng: null,
  gpsAccuracyM: null,
  gpsTimestamp: null,
  stream: null,
  recentHeadingSamples: [],
  recentPitchSamples: [],
  levelPitch: null,
  levelCapturedAt: null,
  calibrationDate: null,
  points: [],
  trimDeg: 0,
  lastMessage: "No capture yet.",
  directionLock: 0, // 0 none, 1 positive, -1 negative
  reversedCount: 0,
  rejectedCount: 0,
  lastPreviewHtml: "No preview yet.",
  previewWindows: [],
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

document.addEventListener("dblclick", (event) => {
  event.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener("touchend", (event) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

document.addEventListener("gesturestart", (event) => {
  event.preventDefault();
}, { passive: false });

function init() {
  bindEls();
  bindUI();
  state.calibrationDate = toLocalDateValue(new Date());
  loadDraft();
  syncTrimUI();
  updateCalibrationDateText();
  render();
}

function bindEls() {
  const ids = [
    "stepSummary", "chip1", "chip2", "chip3", "chip4", "chip5",
    "screen1", "screen2", "screen5", "cameraScreen",
    "pubName", "seatName", "notes", "startBtn",
    "motionStatus", "gpsStatus", "cameraStatus", "setupStatus",
    "enableMotionBtn", "loadSiteBtn", "backTo1Btn", "toStep3Btn",
    "cameraStepLabel", "cameraHelp", "cameraBackBtn",
    "video", "floatingBadge", "sensorLine", "directionLine",
    "levelActions", "setLevelBtn", "retakeLevelBtn",
    "captureActions", "markPointBtn", "toReviewBtn", "undoBtn", "clearBtn",
    "captureMessage", "liveReadout",
    "calibrationDateText", "confidenceValue", "previewDate", "previewBtn", "previewOutput",
    "profileCanvas", "trimRange", "trimValue", "trimMinusBtn", "trimResetBtn", "trimPlusBtn",
    "trimWarning", "graphHint", "rangeInfo", "pointsList", "saveDraftBtn", "exportBtn", "backTo4Btn"
  ];
  ids.forEach((id) => { els[id] = document.getElementById(id); });
}

function bindUI() {
  els.startBtn.addEventListener("click", onStart);
  els.enableMotionBtn.addEventListener("click", enableMotionFromButton);
  els.loadSiteBtn.addEventListener("click", loadSiteRequirements);
  els.backTo1Btn.addEventListener("click", () => goToStep(1));
  els.toStep3Btn.addEventListener("click", () => goToStep(3));
  els.cameraBackBtn.addEventListener("click", onCameraBack);
  els.setLevelBtn.addEventListener("click", setLevelReference);
  els.retakeLevelBtn.addEventListener("click", retakeLevelReference);
  els.markPointBtn.addEventListener("click", addSkylinePoint);
  els.undoBtn.addEventListener("click", undoPoint);
  els.clearBtn.addEventListener("click", clearPoints);
  els.toReviewBtn.addEventListener("click", () => goToStep(5));
  els.previewBtn.addEventListener("click", () => calculatePreview(false));
  els.trimRange.addEventListener("input", onTrimInput);
  els.trimMinusBtn.addEventListener("click", () => nudgeTrim(-1));
  els.trimResetBtn.addEventListener("click", resetTrim);
  els.trimPlusBtn.addEventListener("click", () => nudgeTrim(1));
  els.saveDraftBtn.addEventListener("click", saveDraft);
  els.exportBtn.addEventListener("click", exportJson);
  els.backTo4Btn.addEventListener("click", () => goToStep(4));

  els.pubName.addEventListener("input", () => { state.pubName = els.pubName.value.trim(); });
  els.seatName.addEventListener("input", () => { state.seatName = els.seatName.value.trim(); });
  els.notes.addEventListener("input", () => { state.notes = els.notes.value.trim(); });
}

function onStart() {
  state.pubName = els.pubName.value.trim();
  state.seatName = els.seatName.value.trim();
  state.notes = els.notes.value.trim();
  if (!state.pubName || !state.seatName) {
    alert("Add the pub name and seat name first.");
    return;
  }
  goToStep(2);
}

function onCameraBack() {
  if (state.currentStep === 3) goToStep(2);
  else goToStep(3);
}

function goToStep(step) {
  state.currentStep = step;
  render();
  if (state.stream) requestAnimationFrame(ensureVideoPlayback);
}

function render() {
  const step = state.currentStep;
  els.screen1.classList.toggle("hidden", step !== 1);
  els.screen2.classList.toggle("hidden", step !== 2);
  els.cameraScreen.classList.toggle("hidden", !(step === 3 || step === 4));
  els.screen5.classList.toggle("hidden", step !== 5);

  const chips = [els.chip1, els.chip2, els.chip3, els.chip4, els.chip5];
  chips.forEach((chip, index) => {
    const chipStep = index + 1;
    chip.classList.toggle("active", chipStep === step);
    chip.classList.toggle("done", chipStep < step);
  });

  els.stepSummary.textContent = `Step ${step} of 5`;
  document.body.classList.toggle("capture-mode", step === 3 || step === 4);

  els.toStep3Btn.disabled = !(state.motionReady && state.gpsReady && state.cameraReady);
  els.setLevelBtn.disabled = !(state.motionReady && state.gpsReady && state.cameraReady && Number.isFinite(state.pitchDeg));
  els.markPointBtn.disabled = !canCapturePoint();
  els.toReviewBtn.disabled = state.points.length < 2;
  els.undoBtn.disabled = state.points.length === 0;
  els.clearBtn.disabled = state.points.length === 0;
  els.previewBtn.disabled = state.points.length < 2 || state.lat == null || state.lng == null || state.levelPitch == null;

  els.levelActions.classList.toggle("hidden", step !== 3);
  els.captureActions.classList.toggle("hidden", step !== 4);
  els.retakeLevelBtn.classList.toggle("hidden", !Number.isFinite(state.levelPitch));

  if (step === 3) {
    els.cameraStepLabel.textContent = "Set eye-level";
    els.cameraHelp.textContent = "Hold the phone straight ahead at eye level, then tap the button.";
  } else if (step === 4) {
    els.cameraStepLabel.textContent = "Trace skyline";
    els.cameraHelp.textContent = "Keep scanning in the same direction. Tap the skyline where its shape changes.";
  }

  els.sensorLine.textContent = buildSensorLine();
  els.directionLine.textContent = buildDirectionLine();
  els.captureMessage.textContent = state.lastMessage;
  els.liveReadout.textContent = buildLiveReadout();
  els.floatingBadge.textContent = `${state.points.length} point${state.points.length === 1 ? "" : "s"}`;
  els.setupStatus.textContent = buildSetupStatus();
  els.previewOutput.innerHTML = state.lastPreviewHtml;

  updateCalibrationDateText();
  updateConfidenceText();
  syncTrimUI();
  renderPointsList();
  renderProfileGraph();
}

function buildSensorLine() {
  const parts = [];
  parts.push(state.motionReady ? "Motion ready" : "Motion needed");
  parts.push(state.gpsReady ? `GPS ${Number.isFinite(state.gpsAccuracyM) ? Math.round(state.gpsAccuracyM) + "m" : "ready"}` : "GPS needed");
  parts.push(state.cameraReady ? "Camera ready" : "Camera needed");
  if (Number.isFinite(state.levelPitch)) parts.push(`Level ${state.levelPitch.toFixed(1)}°`);
  return parts.join(" • ");
}

function buildDirectionLine() {
  if (state.points.length < 2) return "Direction not locked yet.";
  const sweep = getSweepWidthFromPoints(state.points);
  if (state.directionLock === 0) return `Direction still settling • sweep ${sweep.toFixed(1)}° • keep moving one way.`;
  return `Direction locked • sweep ${sweep.toFixed(1)}° • keep scanning the same way.`;
}

function buildSetupStatus() {
  if (state.motionReady && state.gpsReady && state.cameraReady) return "Everything is ready. Continue to eye-level capture.";
  if (state.motionReady && !state.gpsReady && !state.cameraReady) return "Motion is ready. Now load location and camera.";
  if (!state.motionReady) return "Enable motion first. iPhone requires a tap for this permission.";
  return "Finish the remaining permissions, then continue.";
}

function buildLiveReadout() {
  const heading = Number.isFinite(state.headingDeg) ? `${normalizeDeg(state.headingDeg).toFixed(1)}°` : "—";
  const pitch = Number.isFinite(state.pitchDeg) ? `${state.pitchDeg.toFixed(1)}°` : "—";
  const relative = Number.isFinite(state.levelPitch) && Number.isFinite(state.pitchDeg)
    ? `${computeRawRelativeAltitude(state.levelPitch, state.pitchDeg).toFixed(1)}°`
    : "—";
  return `Live heading ${heading} • pitch ${pitch} • relative ${relative}`;
}

async function enableMotionFromButton() {
  els.enableMotionBtn.disabled = true;
  try {
    await requestMotion();
    render();
  } catch (error) {
    alert(error.message || "Could not enable motion.");
  } finally {
    els.enableMotionBtn.disabled = false;
  }
}

async function loadSiteRequirements() {
  els.loadSiteBtn.disabled = true;
  try {
    await requestLocation();
    await requestCamera();
    render();
  } catch (error) {
    alert(error.message || "Could not load location and camera.");
  } finally {
    els.loadSiteBtn.disabled = false;
  }
}

async function requestMotion() {
  if (state.motionReady) return;
  if (typeof DeviceOrientationEvent === "undefined") {
    throw new Error("Device orientation is not supported on this browser.");
  }
  if (state.motionRequested) return;
  state.motionRequested = true;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== "granted") throw new Error("Motion/orientation permission was denied.");
    }
    window.addEventListener("deviceorientation", handleOrientation, true);
    state.motionReady = true;
  } catch (error) {
    state.motionRequested = false;
    throw error;
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
  pruneSamples(now);
  if (state.currentStep === 3 || state.currentStep === 4) {
    els.liveReadout.textContent = buildLiveReadout();
  }
}

function getHeading(event) {
  let base = null;
  if (typeof event.webkitCompassHeading === "number") base = event.webkitCompassHeading;
  else if (typeof event.alpha === "number") base = 360 - event.alpha;
  if (base == null) return null;
  return normalizeDeg(base + CAMERA_HEADING_OFFSET_DEG);
}

function getPitch(event) {
  if (typeof event.beta !== "number") return null;
  return event.beta;
}

function pruneSamples(now = Date.now()) {
  const cutoff = now - MOTION_KEEP_MS;
  state.recentHeadingSamples = state.recentHeadingSamples.filter((sample) => sample.ts >= cutoff);
  state.recentPitchSamples = state.recentPitchSamples.filter((sample) => sample.ts >= cutoff);
}

function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported on this device/browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.lat = position.coords.latitude;
        state.lng = position.coords.longitude;
        state.gpsAccuracyM = position.coords.accuracy;
        state.gpsTimestamp = new Date(position.timestamp).toISOString();
        state.gpsReady = true;
        resolve();
      },
      (error) => reject(new Error(`GPS failed: ${error.message}`)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

async function requestCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera access is not supported on this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  state.stream = stream;
  state.cameraReady = true;
  els.video.srcObject = stream;
  await ensureVideoPlayback();
}

async function ensureVideoPlayback() {
  if (!els.video || !state.stream) return;
  if (els.video.srcObject !== state.stream) els.video.srcObject = state.stream;
  try {
    await els.video.play();
  } catch (_) {
    // ignored
  }
}

async function setLevelReference() {
  if (!(state.motionReady && state.gpsReady && state.cameraReady)) {
    alert("Enable motion, GPS and camera first.");
    return;
  }
  const sample = collectStableSample(LEVEL_SAMPLE_MS);
  if (!sample.ok) {
    state.lastMessage = sample.message;
    render();
    alert(sample.message);
    return;
  }
  if (sample.pitchSpreadDeg > MAX_LEVEL_PITCH_SPREAD_DEG) {
    const msg = `Level reference rejected. Hold the phone steadier. Pitch spread was ${sample.pitchSpreadDeg.toFixed(1)}°.`;
    state.lastMessage = msg;
    render();
    alert(msg);
    return;
  }
  state.levelPitch = round1(sample.pitchMedianDeg);
  state.levelCapturedAt = new Date().toISOString();
  state.lastMessage = `Eye-level reference saved at ${state.levelPitch.toFixed(1)}°.`;
  goToStep(4);
}

function retakeLevelReference() {
  state.levelPitch = null;
  state.levelCapturedAt = null;
  state.lastMessage = "Level reference cleared. Capture it again.";
  render();
}

function addSkylinePoint() {
  if (!canCapturePoint()) {
    alert("Load motion, GPS, camera and eye-level first.");
    return;
  }
  const sample = collectStableSample(POINT_SAMPLE_MS);
  if (!sample.ok) {
    state.lastMessage = sample.message;
    state.rejectedCount += 1;
    render();
    alert(sample.message);
    return;
  }
  if (sample.headingSpreadDeg > MAX_POINT_HEADING_SPREAD_DEG || sample.pitchSpreadDeg > MAX_POINT_PITCH_SPREAD_DEG) {
    const msg = `Point rejected. Hold the phone steadier. Heading spread ${sample.headingSpreadDeg.toFixed(1)}°, pitch spread ${sample.pitchSpreadDeg.toFixed(1)}°.`;
    state.lastMessage = msg;
    state.rejectedCount += 1;
    render();
    alert(msg);
    return;
  }

  const point = {
    capturedAt: new Date().toISOString(),
    rawHeadingDeg: round1(sample.headingMedianDeg),
    rawPitchDeg: round1(sample.pitchMedianDeg),
    eyeLevelPitchDeg: round1(state.levelPitch),
    rawRelativeAltDeg: round1(computeRawRelativeAltitude(state.levelPitch, sample.pitchMedianDeg)),
    relativeAltDeg: round1(clampRelativeAltitude(computeRawRelativeAltitude(state.levelPitch, sample.pitchMedianDeg))),
    headingSpreadDeg: round1(sample.headingSpreadDeg),
    pitchSpreadDeg: round1(sample.pitchSpreadDeg),
    sampleCount: sample.count,
  };

  const directionCheck = validateDirectionForNewPoint(point);
  if (!directionCheck.ok) {
    state.lastMessage = directionCheck.message;
    state.reversedCount += 1;
    render();
    alert(directionCheck.message);
    return;
  }

  state.points.push(point);
  if (directionCheck.lockDirection) state.directionLock = directionCheck.lockDirection;
  state.lastMessage = `Point ${state.points.length} saved. Heading spread ${point.headingSpreadDeg.toFixed(1)}°, pitch spread ${point.pitchSpreadDeg.toFixed(1)}°.`;
  calculatePreview(true);
  render();
}

function validateDirectionForNewPoint(point) {
  if (state.points.length === 0) return { ok: true, lockDirection: 0 };

  const candidate = [...state.points, point];
  const unwrapped = unwrapHeadingSequence(candidate.map((entry) => entry.rawHeadingDeg));
  const totalSweep = Math.abs(unwrapped[unwrapped.length - 1] - unwrapped[0]);
  if (totalSweep > MAX_TOTAL_SWEEP_DEG) {
    return { ok: false, message: `Capture rejected. Total sweep would be ${totalSweep.toFixed(1)}°, which is too wide.` };
  }

  const prevUnwrapped = unwrapHeadingSequence(state.points.map((entry) => entry.rawHeadingDeg));
  const prevLast = prevUnwrapped[prevUnwrapped.length - 1];
  const nextLast = unwrapped[unwrapped.length - 1];
  const delta = nextLast - prevLast;

  if (Math.abs(delta) < 0.8) {
    return { ok: false, message: "Point rejected. Move a bit further along the skyline before saving another point." };
  }

  if (state.points.length === 1) {
    return { ok: true, lockDirection: 0 };
  }

  if (state.points.length === 2) {
    const candidateLock = inferDirectionLockFromPoints(candidate);
    return { ok: true, lockDirection: candidateLock };
  }

  const direction = state.directionLock || inferDirectionLockFromPoints(state.points);
  if (!direction) {
    return { ok: true, lockDirection: inferDirectionLockFromPoints(candidate) };
  }

  const reverseThreshold = 2.0;
  if (direction === 1 && delta < -reverseThreshold) {
    return { ok: false, message: "Direction reversed. Keep scanning the same way or start again." };
  }
  if (direction === -1 && delta > reverseThreshold) {
    return { ok: false, message: "Direction reversed. Keep scanning the same way or start again." };
  }

  return { ok: true, lockDirection: direction };
}

function undoPoint() {
  if (!state.points.length) return;
  state.points.pop();
  if (state.points.length < 2) state.directionLock = 0;
  else state.directionLock = inferDirectionLockFromPoints(state.points);
  state.lastMessage = "Last point removed.";
  calculatePreview(true);
  render();
}

function clearPoints() {
  if (!state.points.length) return;
  if (!confirm("Clear all skyline points and start again?")) return;
  state.points = [];
  state.directionLock = 0;
  state.trimDeg = 0;
  state.previewWindows = [];
  state.lastPreviewHtml = "No preview yet.";
  state.lastMessage = "All points cleared.";
  render();
}

function canCapturePoint() {
  return state.motionReady && state.gpsReady && state.cameraReady && Number.isFinite(state.levelPitch) && Number.isFinite(state.headingDeg) && Number.isFinite(state.pitchDeg);
}

function collectStableSample(windowMs) {
  const headingSamples = recentWithin(state.recentHeadingSamples, windowMs);
  const pitchSamples = recentWithin(state.recentPitchSamples, windowMs);

  const count = Math.min(headingSamples.length, pitchSamples.length);
  if (count < MIN_SAMPLE_COUNT) {
    return { ok: false, message: "Not enough fresh motion samples. Hold the phone steady for a moment and try again." };
  }

  const headingValues = headingSamples.map((sample) => sample.value);
  const pitchValues = pitchSamples.map((sample) => sample.value);

  const headingMedianDeg = circularMeanDeg(headingValues);
  const pitchMedianDeg = median(pitchValues);
  const headingSpreadDeg = circularSpreadDeg(headingValues, headingMedianDeg);
  const pitchSpreadDeg = spreadDeg(pitchValues);

  return {
    ok: true,
    count,
    headingMedianDeg,
    pitchMedianDeg,
    headingSpreadDeg,
    pitchSpreadDeg,
  };
}

function recentWithin(samples, windowMs) {
  const cutoff = Date.now() - windowMs;
  return samples.filter((sample) => sample.ts >= cutoff);
}

function calculatePreview(silent = false) {
  if (!window.SunCalc) {
    state.lastPreviewHtml = "SunCalc failed to load.";
    els.previewOutput.textContent = state.lastPreviewHtml;
    return;
  }
  if (state.points.length < 2 || state.lat == null || state.lng == null || state.levelPitch == null) {
    if (!silent) alert("You need an eye-level reference, location, and at least 2 skyline points first.");
    return;
  }

  const profile = buildProfile();
  const sunPath = buildSunPath(state.calibrationDate, profile, state.trimDeg);
  const windows = buildSunWindows(state.calibrationDate, profile, state.trimDeg);
  state.previewWindows = windows;

  const sweepText = `${normalizeDeg(profile[0].rawHeadingDeg).toFixed(0)}° → ${normalizeDeg(profile[profile.length - 1].rawHeadingDeg).toFixed(0)}°`;
  const sweepWidth = (profile[profile.length - 1].worldHeadingDeg - profile[0].worldHeadingDeg).toFixed(1);
  const trimText = formatSignedDeg(state.trimDeg);
  const confidence = getConfidenceSummary();

  let html = "";
  if (!sunPath.length) {
    html = `<strong>No sun above horizon</strong><br>No solar path was found above the horizon for this date at this location.`;
  } else if (!windows.length) {
    html = `<strong>No direct sun inside this skyline sweep</strong><br>Captured sweep: ${sweepText}<br>Sweep width: ${sweepWidth}°<br>Trim: ${trimText}<br>Confidence: ${confidence.label}`;
  } else {
    const list = windows.map((window) => `${formatClock(window.start)}–${formatClock(window.end)}`).join("<br>");
    html = `<strong>Sun windows</strong><br>${list}<br><br>Captured sweep: ${sweepText}<br>Sweep width: ${sweepWidth}°<br>Trim: ${trimText}<br>Confidence: ${confidence.label}`;
  }
  state.lastPreviewHtml = html;
  els.previewOutput.innerHTML = html;
  renderProfileGraph();
}

function buildProfile() {
  const rawHeadings = state.points.map((point) => point.rawHeadingDeg);
  const unwrapped = unwrapHeadingSequence(rawHeadings);
  return state.points.map((point, index) => ({
    ...point,
    rawHeadingDeg: normalizeDeg(point.rawHeadingDeg),
    worldHeadingDeg: unwrapped[index],
    obstructionAltDeg: point.relativeAltDeg,
  }));
}

function buildSunPath(dateStr, profile, trimDeg = 0) {
  if (!window.SunCalc || !profile.length || state.lat == null || state.lng == null) return [];
  const minWorld = profile[0].worldHeadingDeg;
  const maxWorld = profile[profile.length - 1].worldHeadingDeg;
  const center = (minWorld + maxWorld) / 2;
  const points = [];

  for (let minutes = 4 * 60; minutes <= 22 * 60; minutes += 5) {
    const date = localDateAtMinutes(dateStr, minutes);
    const pos = window.SunCalc.getPosition(date, state.lat, state.lng);
    const altDeg = radToDeg(pos.altitude);
    if (altDeg <= 0) continue;
    const rawHeadingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
    const worldHeadingDeg = unwrapHeadingNear(center, rawHeadingDeg) + trimDeg;
    points.push({ date, rawHeadingDeg, worldHeadingDeg, altDeg });
  }
  return points;
}

function buildSunWindows(dateStr, profile, trimDeg = 0) {
  const windows = [];
  let openWindow = null;
  for (let minutes = 4 * 60; minutes <= 22 * 60; minutes += 1) {
    const date = localDateAtMinutes(dateStr, minutes);
    const visible = isSunVisibleAt(date, profile, trimDeg);
    if (visible && !openWindow) openWindow = { start: date, end: date };
    else if (visible && openWindow) openWindow.end = date;
    else if (!visible && openWindow) {
      windows.push({ ...openWindow });
      openWindow = null;
    }
  }
  if (openWindow) windows.push({ ...openWindow });
  return mergeTinyGaps(windows, 5);
}

function isSunVisibleAt(date, profile, trimDeg = 0) {
  const pos = window.SunCalc.getPosition(date, state.lat, state.lng);
  const altDeg = radToDeg(pos.altitude);
  if (altDeg <= 0) return false;
  const center = (profile[0].worldHeadingDeg + profile[profile.length - 1].worldHeadingDeg) / 2;
  const rawHeadingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
  const worldHeadingDeg = unwrapHeadingNear(center, rawHeadingDeg) + trimDeg;
  if (worldHeadingDeg < profile[0].worldHeadingDeg || worldHeadingDeg > profile[profile.length - 1].worldHeadingDeg) return false;
  const obstructionAlt = interpolateObstructionAtHeading(worldHeadingDeg, profile);
  return altDeg > obstructionAlt + 0.5;
}

function interpolateObstructionAtHeading(target, profile) {
  if (profile.length === 1) return profile[0].obstructionAltDeg;
  if (target <= profile[0].worldHeadingDeg) return profile[0].obstructionAltDeg;
  if (target >= profile[profile.length - 1].worldHeadingDeg) return profile[profile.length - 1].obstructionAltDeg;
  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    if (target >= a.worldHeadingDeg && target <= b.worldHeadingDeg) {
      const span = b.worldHeadingDeg - a.worldHeadingDeg || 0.0001;
      const t = (target - a.worldHeadingDeg) / span;
      return a.obstructionAltDeg + (b.obstructionAltDeg - a.obstructionAltDeg) * t;
    }
  }
  return 0;
}

function renderProfileGraph() {
  const canvas = els.profileCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#faf7ef";
  ctx.fillRect(0, 0, width, height);

  const profile = state.points.length >= 2 ? buildProfile() : [];
  if (profile.length < 2) {
    drawCenterText(ctx, width, height, "Add at least 2 skyline points");
    els.graphHint.textContent = "Add at least 2 points to draw the skyline profile.";
    els.rangeInfo.textContent = "No heading ranges yet.";
    return;
  }

  const sunPath = buildSunPath(state.calibrationDate, profile, state.trimDeg);
  const visibleSegments = getVisibleSegments(sunPath, profile);
  const pad = { top: 18, right: 18, bottom: 34, left: 42 };
  const graphW = width - pad.left - pad.right;
  const graphH = height - pad.top - pad.bottom;
  const xMin = profile[0].worldHeadingDeg;
  const xMax = profile[profile.length - 1].worldHeadingDeg;
  const sunInside = sunPath.filter((point) => point.worldHeadingDeg >= xMin && point.worldHeadingDeg <= xMax);
  let yMax = 10;
  profile.forEach((point) => { yMax = Math.max(yMax, point.obstructionAltDeg); });
  sunInside.forEach((point) => { yMax = Math.max(yMax, point.altDeg); });
  yMax = Math.max(10, Math.ceil(yMax / 5) * 5);

  drawFrameAndGrid(ctx, pad, graphW, graphH, yMax);
  drawHeadingLabels(ctx, profile, pad, graphW, graphH);
  drawSkylineFill(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH);
  drawSkylineLine(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH);
  drawSunPathLine(ctx, sunInside, xMin, xMax, yMax, pad, graphW, graphH);
  drawVisibleSegments(ctx, visibleSegments, xMin, xMax, yMax, pad, graphW, graphH);
  drawHourMarkers(ctx, sunInside, xMin, xMax, yMax, pad, graphW, graphH);

  const sweepText = `${normalizeDeg(profile[0].rawHeadingDeg).toFixed(0)}° → ${normalizeDeg(profile[profile.length - 1].rawHeadingDeg).toFixed(0)}°`;
  const sweepWidth = (profile[profile.length - 1].worldHeadingDeg - profile[0].worldHeadingDeg).toFixed(1);
  const visibleText = visibleSegments.length
    ? visibleSegments.map((segment) => `${formatClock(segment[0].date)}–${formatClock(segment[segment.length - 1].date)}`).join(", ")
    : "None";

  els.graphHint.textContent = "Black is the skyline. Dashed orange is the full sun path. Gold is the visible sun above the skyline.";
  els.rangeInfo.textContent = `Captured sweep: ${sweepText} • Sweep width: ${sweepWidth}° • Trim: ${formatSignedDeg(state.trimDeg)} • Visible inside sweep: ${visibleText}`;
}

function drawCenterText(ctx, width, height, text) {
  ctx.fillStyle = "#6f6a60";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
}

function drawFrameAndGrid(ctx, pad, graphW, graphH, yMax) {
  ctx.strokeStyle = "#d8d0c1";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, graphW, graphH);

  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = (yMax / 4) * i;
    const y = pad.top + graphH - (value / yMax) * graphH;
    ctx.strokeStyle = "#ece3d3";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + graphW, y);
    ctx.stroke();
    ctx.fillStyle = "#6f6a60";
    ctx.fillText(`${Math.round(value)}°`, pad.left - 6, y);
  }
}

function drawHeadingLabels(ctx, profile, pad, graphW, graphH) {
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#6f6a60";
  ctx.font = "12px sans-serif";
  const start = normalizeDeg(profile[0].rawHeadingDeg).toFixed(0);
  const end = normalizeDeg(profile[profile.length - 1].rawHeadingDeg).toFixed(0);
  const mid = normalizeDeg((profile[0].rawHeadingDeg + profile[profile.length - 1].rawHeadingDeg) / 2).toFixed(0);
  ctx.fillText(`${start}°`, pad.left, pad.top + graphH + 8);
  ctx.fillText(`${mid}°`, pad.left + graphW / 2, pad.top + graphH + 8);
  ctx.fillText(`${end}°`, pad.left + graphW, pad.top + graphH + 8);
}

function drawSkylineFill(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  if (!profile.length) return;
  ctx.beginPath();
  profile.forEach((point, index) => {
    const x = toGraphX(point.worldHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(point.obstructionAltDeg, yMax, pad.top, graphH);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const lastX = toGraphX(profile[profile.length - 1].worldHeadingDeg, xMin, xMax, pad.left, graphW);
  const firstX = toGraphX(profile[0].worldHeadingDeg, xMin, xMax, pad.left, graphW);
  ctx.lineTo(lastX, pad.top + graphH);
  ctx.lineTo(firstX, pad.top + graphH);
  ctx.closePath();
  ctx.fillStyle = "rgba(31, 31, 31, 0.14)";
  ctx.fill();
}

function drawSkylineLine(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  ctx.beginPath();
  profile.forEach((point, index) => {
    const x = toGraphX(point.worldHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(point.obstructionAltDeg, yMax, pad.top, graphH);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.lineWidth = 1;

  profile.forEach((point) => {
    const x = toGraphX(point.worldHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(point.obstructionAltDeg, yMax, pad.top, graphH);
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#1f1f1f";
    ctx.fill();
  });
}

function drawSunPathLine(ctx, sunInside, xMin, xMax, yMax, pad, graphW, graphH) {
  if (!sunInside.length) return;
  ctx.beginPath();
  sunInside.forEach((point, index) => {
    const x = toGraphX(point.worldHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(point.altDeg, yMax, pad.top, graphH);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#d06a00";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function drawVisibleSegments(ctx, segments, xMin, xMax, yMax, pad, graphW, graphH) {
  segments.forEach((segment) => {
    if (segment.length < 2) return;
    ctx.beginPath();
    segment.forEach((point, index) => {
      const x = toGraphX(point.worldHeadingDeg, xMin, xMax, pad.left, graphW);
      const y = toGraphY(point.altDeg, yMax, pad.top, graphH);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#f1c74c";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;
  });
}

function drawHourMarkers(ctx, sunInside, xMin, xMax, yMax, pad, graphW, graphH) {
  const hourPoints = sunInside.filter((point) => point.date.getMinutes() === 0);
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  hourPoints.forEach((point) => {
    const x = toGraphX(point.worldHeadingDeg, xMin, xMax, pad.left, graphW);
    const y = toGraphY(point.altDeg, yMax, pad.top, graphH);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#d06a00";
    ctx.fill();
    ctx.fillStyle = "#8b5200";
    ctx.fillText(`${String(point.date.getHours()).padStart(2, "0")}:00`, x, y - 6);
  });
}

function getVisibleSegments(sunPath, profile) {
  const segments = [];
  let current = [];
  sunPath.forEach((point) => {
    if (point.worldHeadingDeg < profile[0].worldHeadingDeg || point.worldHeadingDeg > profile[profile.length - 1].worldHeadingDeg) {
      if (current.length) {
        segments.push(current);
        current = [];
      }
      return;
    }
    const obstruction = interpolateObstructionAtHeading(point.worldHeadingDeg, profile);
    const visible = point.altDeg > obstruction + 0.5;
    if (visible) current.push(point);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);
  return segments;
}

function toGraphX(value, min, max, left, width) {
  const span = Math.max(0.0001, max - min);
  return left + ((value - min) / span) * width;
}

function toGraphY(value, yMax, top, height) {
  return top + height - (value / Math.max(1, yMax)) * height;
}

function onTrimInput() {
  state.trimDeg = round1(Number(els.trimRange.value) || 0);
  syncTrimUI();
  calculatePreview(true);
  render();
}

function nudgeTrim(delta) {
  state.trimDeg = round1(clampTrim((state.trimDeg || 0) + delta));
  syncTrimUI();
  calculatePreview(true);
  render();
}

function resetTrim() {
  state.trimDeg = 0;
  syncTrimUI();
  calculatePreview(true);
  render();
}

function syncTrimUI() {
  els.trimRange.value = String(state.trimDeg || 0);
  els.trimValue.textContent = formatSignedDeg(state.trimDeg || 0);
  const absTrim = Math.abs(state.trimDeg || 0);
  if (absTrim <= 3) els.trimWarning.textContent = "Trim within a few degrees is acceptable.";
  else if (absTrim <= 5) els.trimWarning.textContent = "Moderate trim. Check the skyline against a known reference.";
  else els.trimWarning.textContent = "Large trim needed. Treat this calibration as unreliable.";
}

function getConfidenceSummary() {
  if (state.points.length < 2) {
    return { score: 0, label: "Not enough data", notes: ["At least 2 skyline points needed."] };
  }
  const notes = [];
  let score = 0;

  if (state.points.length >= 8) score += 25;
  else if (state.points.length >= 5) score += 18;
  else score += 10;

  const avgHeadingSpread = average(state.points.map((point) => point.headingSpreadDeg));
  const avgPitchSpread = average(state.points.map((point) => point.pitchSpreadDeg));
  if (avgHeadingSpread <= 2.5) score += 18;
  else if (avgHeadingSpread <= 4) score += 10;
  else notes.push("Heading stability was weak.");

  if (avgPitchSpread <= 1.5) score += 18;
  else if (avgPitchSpread <= 2.5) score += 10;
  else notes.push("Pitch stability was weak.");

  const sweep = getSweepWidthFromPoints(state.points);
  if (sweep >= 20 && sweep <= 120) score += 16;
  else if (sweep >= 10 && sweep <= 140) score += 10;
  else notes.push("Sweep width is unusual.");

  if (state.reversedCount === 0) score += 8;
  else notes.push("Direction was reversed during capture.");

  if (state.rejectedCount === 0) score += 5;
  else if (state.rejectedCount > 2) notes.push("Several unstable points were rejected.");

  const absTrim = Math.abs(state.trimDeg || 0);
  if (absTrim <= 3) score += 10;
  else if (absTrim <= 5) score += 5;
  else notes.push("Large trim was needed.");

  let label = "Low";
  if (score >= 75) label = "High";
  else if (score >= 55) label = "Medium";

  if (absTrim > 5 && label === "High") label = "Medium";
  if (absTrim > 6 && label === "Medium") label = "Low";

  return { score, label, notes, avgHeadingSpread, avgPitchSpread, sweep };
}

function updateConfidenceText() {
  const confidence = getConfidenceSummary();
  els.confidenceValue.textContent = confidence.label;
}

function renderPointsList() {
  els.pointsList.innerHTML = "";
  state.points.forEach((point, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div><strong>Point ${index + 1}</strong></div>
      <div class="meta-line">Heading ${point.rawHeadingDeg.toFixed(1)}° • pitch ${point.rawPitchDeg.toFixed(1)}° • relative ${point.relativeAltDeg.toFixed(1)}°${Number.isFinite(point.rawRelativeAltDeg) ? ` (raw ${formatSignedDeg(point.rawRelativeAltDeg)})` : ""}</div>
      <div class="meta-line">Heading spread ${point.headingSpreadDeg.toFixed(1)}° • pitch spread ${point.pitchSpreadDeg.toFixed(1)}° • ${point.sampleCount} samples</div>
      <div class="meta-line">${formatTime(point.capturedAt)}</div>
    `;
    els.pointsList.appendChild(li);
  });
}

function saveDraft() {
  try {
    const payload = buildRecord();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    alert("Draft saved on this device.");
  } catch (error) {
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
    state.gpsReady = state.lat != null && state.lng != null;
    state.calibrationDate = draft.calibrationDate || toLocalDateValue(new Date());
    state.levelPitch = draft.levelPitch ?? null;
    state.levelCapturedAt = draft.levelCapturedAt ?? null;
    state.points = Array.isArray(draft.points) ? draft.points : [];
    state.trimDeg = clampTrim(draft.trimDeg ?? 0);
    state.reversedCount = draft.reversedCount ?? 0;
    state.rejectedCount = draft.rejectedCount ?? 0;
    state.directionLock = inferDirectionLockFromPoints(state.points);
    state.lastPreviewHtml = draft.lastPreviewHtml || "No preview yet.";
    els.previewOutput.innerHTML = state.lastPreviewHtml;
    els.pubName.value = state.pubName;
    els.seatName.value = state.seatName;
    els.notes.value = state.notes;
  } catch (error) {
    console.error("Draft load failed", error);
  }
}

function exportJson() {
  try {
    const payload = buildRecord();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(state.pubName || "pub")}-${slugify(state.seatName || "spot")}-calibration-rebuild.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert("Could not export JSON.");
  }
}

function buildRecord() {
  const confidence = getConfidenceSummary();
  return {
    version: "calibration-rebuild-v1",
    pubName: state.pubName,
    seatName: state.seatName,
    notes: state.notes,
    lat: state.lat,
    lng: state.lng,
    gpsAccuracyM: state.gpsAccuracyM,
    gpsTimestamp: state.gpsTimestamp,
    calibrationDate: state.calibrationDate,
    levelPitch: state.levelPitch,
    levelCapturedAt: state.levelCapturedAt,
    trimDeg: state.trimDeg,
    directionLock: state.directionLock,
    reversedCount: state.reversedCount,
    rejectedCount: state.rejectedCount,
    confidence,
    points: state.points,
    exportedAt: new Date().toISOString(),
  };
}

function inferDirectionLockFromPoints(points) {
  if (!points || points.length < 3) return 0;
  const unwrapped = unwrapHeadingSequence(points.map((point) => point.rawHeadingDeg));
  let positive = 0;
  let negative = 0;
  for (let i = 1; i < unwrapped.length; i += 1) {
    const delta = unwrapped[i] - unwrapped[i - 1];
    if (delta >= 1) positive += 1;
    else if (delta <= -1) negative += 1;
  }
  const overall = unwrapped[unwrapped.length - 1] - unwrapped[0];
  if (Math.abs(overall) < 3) return 0;
  if (positive >= 2 && negative === 0) return 1;
  if (negative >= 2 && positive === 0) return -1;
  if (positive > negative + 1) return 1;
  if (negative > positive + 1) return -1;
  return 0;
}

function getSweepWidthFromPoints(points) {
  if (!points || points.length < 2) return 0;
  const unwrapped = unwrapHeadingSequence(points.map((point) => point.rawHeadingDeg));
  return Math.abs(unwrapped[unwrapped.length - 1] - unwrapped[0]);
}

function unwrapHeadingSequence(headings) {
  if (!headings.length) return [];
  const result = [normalizeDeg(headings[0])];
  let prevRaw = normalizeDeg(headings[0]);
  let current = normalizeDeg(headings[0]);
  for (let i = 1; i < headings.length; i += 1) {
    const raw = normalizeDeg(headings[i]);
    const delta = shortestAngleDelta(prevRaw, raw);
    current += delta;
    result.push(current);
    prevRaw = raw;
  }
  return result;
}

function normalizeDeg(value) {
  let out = value % 360;
  if (out < 0) out += 360;
  return out;
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

function clampRelativeAltitude(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, Math.abs(value)));
}

function computeRawRelativeAltitude(levelPitch, pitchDeg) {
  if (!Number.isFinite(levelPitch) || !Number.isFinite(pitchDeg)) return 0;
  return pitchDeg - levelPitch;
}

function circularMeanDeg(values) {
  let sumX = 0;
  let sumY = 0;
  values.forEach((value) => {
    const rad = (normalizeDeg(value) * Math.PI) / 180;
    sumX += Math.cos(rad);
    sumY += Math.sin(rad);
  });
  return normalizeDeg((Math.atan2(sumY, sumX) * 180) / Math.PI);
}

function circularSpreadDeg(values, centerDeg) {
  if (!values.length) return 0;
  const deltas = values.map((value) => Math.abs(shortestAngleDelta(centerDeg, value)));
  return spreadDeg(deltas);
}

function spreadDeg(values) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toLocalDateValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localDateAtMinutes(dateStr, totalMinutes) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return new Date(y, m - 1, d, hours, mins, 0, 0);
}

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleString(); }
  catch (_) { return String(iso); }
}

function formatSignedDeg(value) {
  const number = round1(Number(value) || 0);
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${Math.abs(number).toFixed(1)}°`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clampTrim(value) {
  return Math.max(-8, Math.min(8, Number(value) || 0));
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function mergeTinyGaps(windows, maxGapMinutes) {
  if (!windows.length) return [];
  const merged = [{ ...windows[0] }];
  for (let i = 1; i < windows.length; i += 1) {
    const prev = merged[merged.length - 1];
    const current = windows[i];
    const gap = (current.start - prev.end) / 60000;
    if (gap <= maxGapMinutes) prev.end = current.end;
    else merged.push({ ...current });
  }
  return merged;
}

function updateCalibrationDateText() {
  els.previewDate.value = state.calibrationDate || toLocalDateValue(new Date());
  els.calibrationDateText.textContent = formatDateLong(state.calibrationDate || toLocalDateValue(new Date()));
}

function formatDateLong(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return String(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function slugify(input) {
  return String(input).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
