const LEVEL_SAMPLE_MS = 500;
const POINT_SAMPLE_MS = 450;
const SAMPLE_KEEP_MS = 2500;
const MIN_SAMPLES = 5;
const TRIM_LIMIT_DEG = 8;
const CAMERA_HEADING_OFFSET_DEG = 0;
const DRAFT_KEY = 'dits-skyline-mapper-v3-draft';

const state = {
  pubName: '',
  seatName: '',
  notes: '',
  currentStep: 1,
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
  gpsReady: false,
  cameraReady: false,
  stream: null,
  recentHeadingSamples: [],
  recentPitchSamples: [],
  samples: [],
  trimDeg: 0,
  calibrationDate: localDateValue(new Date()),
  setupStates: { motion: 'waiting', gps: 'waiting', camera: 'waiting' }
};

const els = {};

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

afterAnimation();

function init() {
  bindEls();
  bindUI();
  loadDraft();
  render();
}

function bindEls() {
  [
    'pageHeader','stepLine','pill1','pill2','pill3','pill4','pill5','screen1','screen2','captureShell','screen5',
    'pubName','seatName','notes','startBtn','enableMotionBtn','loadCameraGpsBtn','continueToLevelBtn','backTo1Btn',
    'backToSetupBtn','backToLevelBtn','setLevelBtn','undoPointBtn','clearPointsBtn','markPointBtn','toReviewBtn',
    'captureTitle','captureMeta','captureInstruction','captureReading','levelActions','skylineActions','skylineFooterActions',
    'motionChip','gpsChip','cameraChip','setupHint','video','reviewCanvas','reviewSummary','trimRange','trimValue','trimHint',
    'calibrationDateText','confidenceText','pointCountText','gpsAccuracyText','windowOutput','pointsList','backToSkylineBtn',
    'saveDraftBtn','exportBtn'
  ].forEach(id => { els[id] = document.getElementById(id); });
}

function bindUI() {
  els.pubName.addEventListener('input', () => state.pubName = els.pubName.value.trim());
  els.seatName.addEventListener('input', () => state.seatName = els.seatName.value.trim());
  els.notes.addEventListener('input', () => state.notes = els.notes.value.trim());
  els.startBtn.addEventListener('click', () => {
    state.pubName = els.pubName.value.trim();
    state.seatName = els.seatName.value.trim();
    state.notes = els.notes.value.trim();
    if (!state.pubName || !state.seatName) {
      alert('Add the pub name and seating area first.');
      return;
    }
    goToStep(2);
  });
  els.backTo1Btn.addEventListener('click', () => goToStep(1));
  els.enableMotionBtn.addEventListener('click', enableMotion);
  els.loadCameraGpsBtn.addEventListener('click', loadCameraAndGps);
  els.continueToLevelBtn.addEventListener('click', () => goToStep(3));
  els.backToSetupBtn.addEventListener('click', () => goToStep(2));
  els.backToLevelBtn.addEventListener('click', () => goToStep(3));
  els.setLevelBtn.addEventListener('click', setLevelReference);
  els.markPointBtn.addEventListener('click', addSkylinePoint);
  els.undoPointBtn.addEventListener('click', undoPoint);
  els.clearPointsBtn.addEventListener('click', clearPoints);
  els.toReviewBtn.addEventListener('click', () => goToStep(5));
  els.backToSkylineBtn.addEventListener('click', () => goToStep(4));
  els.trimRange.addEventListener('input', () => {
    state.trimDeg = clamp(Number(els.trimRange.value) || 0, -TRIM_LIMIT_DEG, TRIM_LIMIT_DEG);
    renderReview();
  });
  els.saveDraftBtn.addEventListener('click', saveDraft);
  els.exportBtn.addEventListener('click', exportJson);
}

function goToStep(step) {
  state.currentStep = step;
  document.body.classList.toggle('capture-mode', step === 3 || step === 4);
  if (step === 5) renderReview();
  render();
  if (state.stream) ensureVideoPlayback();
}

function render() {
  const normalSteps = [els.screen1, els.screen2, els.screen5];
  normalSteps.forEach(el => el.classList.add('hidden'));
  els.captureShell.classList.add('hidden');
  if (state.currentStep === 1) els.screen1.classList.remove('hidden');
  if (state.currentStep === 2) els.screen2.classList.remove('hidden');
  if (state.currentStep === 5) els.screen5.classList.remove('hidden');
  if (state.currentStep === 3 || state.currentStep === 4) els.captureShell.classList.remove('hidden');

  els.stepLine.textContent = `Step ${state.currentStep} of 5`;
  for (let i = 1; i <= 5; i++) {
    const pill = els[`pill${i}`];
    pill.classList.toggle('active', i === state.currentStep);
    pill.classList.toggle('done', i < state.currentStep);
  }

  updateStatusChips();
  els.continueToLevelBtn.disabled = !(state.motionReady && state.gpsReady && state.cameraReady);

  if (state.currentStep === 3 || state.currentStep === 4) renderCaptureStep();
}

function renderCaptureStep() {
  const inLevel = state.currentStep === 3;
  els.captureTitle.textContent = inLevel ? 'Set eye-level reference' : 'Map skyline';
  els.captureMeta.textContent = inLevel ? 'Portrait only • seated eye level' : `${state.samples.length} point${state.samples.length === 1 ? '' : 's'}`;
  els.captureInstruction.textContent = inLevel
    ? 'Hold the phone at seated eye level and aim the reticle at the true level reference.'
    : 'Mark the relevant skyline opposite the seating area. Keep it simple and add points where the shape changes.';
  els.levelActions.classList.toggle('hidden', !inLevel);
  els.skylineActions.classList.toggle('hidden', inLevel);
  els.skylineFooterActions.classList.toggle('hidden', inLevel);
  els.toReviewBtn.disabled = state.samples.length < 2;
  els.undoPointBtn.disabled = state.samples.length === 0;
  els.clearPointsBtn.disabled = state.samples.length === 0;

  if (!state.motionReady) {
    els.captureReading.textContent = 'Enable motion first.';
  } else if (state.pitchDeg == null || state.headingDeg == null) {
    els.captureReading.textContent = 'Move the phone slightly to wake the sensors.';
  } else if (inLevel) {
    els.captureReading.textContent = `Live pitch ${fmtSigned(state.pitchDeg)} • tap once when the phone is level.`;
  } else {
    const liveRelative = Number.isFinite(state.levelPitch) && Number.isFinite(state.pitchDeg)
      ? Math.abs(state.pitchDeg - state.levelPitch)
      : null;
    els.captureReading.textContent = liveRelative == null
      ? 'Level reference missing.'
      : `Live heading ${fmtDeg(state.headingDeg)} • skyline angle ${fmtDeg(liveRelative)}`;
  }
}

function updateStatusChips() {
  setChip(els.motionChip, 'Motion', state.setupStates.motion);
  setChip(els.gpsChip, 'GPS', state.setupStates.gps, state.gpsReady && Number.isFinite(state.gpsAccuracyM) ? `${Math.round(state.gpsAccuracyM)}m` : null);
  setChip(els.cameraChip, 'Camera', state.setupStates.camera);
  if (state.motionReady && state.gpsReady && state.cameraReady) {
    els.setupHint.textContent = 'Everything is ready. Continue to set the eye-level reference.';
  } else {
    els.setupHint.textContent = 'Enable motion, then use your location and camera.';
  }
}

function setChip(el, label, status, extra = null) {
  el.className = 'status-chip';
  el.classList.add(status || 'waiting');
  let text = `${label} • ${status || 'waiting'}`;
  if (extra) text += ` (${extra})`;
  el.textContent = text;
}

async function enableMotion() {
  if (state.motionReady) return;
  els.enableMotionBtn.disabled = true;
  state.setupStates.motion = 'waiting';
  updateStatusChips();
  try {
    if (typeof DeviceOrientationEvent === 'undefined') {
      throw new Error('Device orientation is not supported on this device/browser.');
    }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== 'granted') throw new Error('Motion permission was denied.');
    }
    window.addEventListener('deviceorientation', onOrientation, true);
    state.motionReady = true;
    state.setupStates.motion = 'ready';
  } catch (err) {
    state.setupStates.motion = 'error';
    alert(err.message || 'Could not enable motion.');
  } finally {
    els.enableMotionBtn.disabled = false;
    render();
  }
}

function onOrientation(event) {
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
  if (state.motionReady) state.setupStates.motion = 'ready';
  if (state.currentStep === 3 || state.currentStep === 4) renderCaptureStep();
}

async function loadCameraAndGps() {
  els.loadCameraGpsBtn.disabled = true;
  try {
    await Promise.all([requestLocation(), requestCamera()]);
  } catch (err) {
    alert(err.message || 'Could not load camera and GPS.');
  } finally {
    els.loadCameraGpsBtn.disabled = false;
    render();
  }
}

function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      state.setupStates.gps = 'error';
      reject(new Error('Geolocation is not supported here.'));
      return;
    }
    state.setupStates.gps = 'waiting';
    updateStatusChips();
    navigator.geolocation.getCurrentPosition(pos => {
      state.lat = pos.coords.latitude;
      state.lng = pos.coords.longitude;
      state.gpsAccuracyM = pos.coords.accuracy;
      state.gpsTimestamp = new Date(pos.timestamp).toISOString();
      state.gpsReady = true;
      state.setupStates.gps = 'ready';
      render();
      resolve();
    }, err => {
      state.setupStates.gps = 'error';
      render();
      reject(new Error(`GPS failed: ${err.message}`));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    state.setupStates.camera = 'error';
    throw new Error('Camera access is not supported here.');
  }
  state.setupStates.camera = 'waiting';
  updateStatusChips();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  state.stream = stream;
  els.video.srcObject = stream;
  await ensureVideoPlayback();
  state.cameraReady = true;
  state.setupStates.camera = 'ready';
  render();
}

async function ensureVideoPlayback() {
  if (!state.stream) return;
  try { await els.video.play(); } catch (_) {}
}

function setLevelReference() {
  if (!state.motionReady) {
    alert('Enable motion first.');
    return;
  }
  const value = getMedian(state.recentPitchSamples, LEVEL_SAMPLE_MS) ?? state.pitchDeg;
  if (!Number.isFinite(value)) {
    alert('Move the phone slightly and try again.');
    return;
  }
  state.levelPitch = round1(value);
  state.levelCapturedAt = new Date().toISOString();
  goToStep(4);
}

function addSkylinePoint() {
  if (!state.motionReady || !state.cameraReady || !state.gpsReady || !Number.isFinite(state.levelPitch)) {
    alert('Finish setup and set the eye-level reference first.');
    return;
  }
  const headingMedian = getMedian(state.recentHeadingSamples, POINT_SAMPLE_MS) ?? state.headingDeg;
  const pitchMedian = getMedian(state.recentPitchSamples, POINT_SAMPLE_MS) ?? state.pitchDeg;
  if (!Number.isFinite(headingMedian) || !Number.isFinite(pitchMedian)) {
    alert('Move the phone slightly and try again.');
    return;
  }
  const headingSpread = getSpread(state.recentHeadingSamples, POINT_SAMPLE_MS, true);
  const pitchSpread = getSpread(state.recentPitchSamples, POINT_SAMPLE_MS, false);
  state.samples.push({
    headingDeg: round1(normalizeDeg(headingMedian)),
    pitchDeg: round1(pitchMedian),
    levelPitch: round1(state.levelPitch),
    relativeAltDeg: round1(Math.max(0, Math.abs(pitchMedian - state.levelPitch))),
    headingSpreadDeg: round1(headingSpread ?? 0),
    pitchSpreadDeg: round1(pitchSpread ?? 0),
    capturedAt: new Date().toISOString()
  });
  renderCaptureStep();
}

function undoPoint() {
  if (!state.samples.length) return;
  state.samples.pop();
  renderCaptureStep();
}

function clearPoints() {
  if (!state.samples.length) return;
  if (!confirm('Clear all skyline points and start again?')) return;
  state.samples = [];
  renderCaptureStep();
}

function renderReview() {
  els.trimValue.textContent = fmtSigned(state.trimDeg);
  els.calibrationDateText.textContent = formatDateLabel(state.calibrationDate);
  els.pointCountText.textContent = String(state.samples.length);
  els.gpsAccuracyText.textContent = Number.isFinite(state.gpsAccuracyM) ? `${Math.round(state.gpsAccuracyM)}m` : '—';
  els.reviewSummary.textContent = `${state.pubName || 'Pub'} • ${state.seatName || 'Seating area'} • relevant skyline only.`;
  renderPointsList();
  drawReviewGraph();
}

function renderPointsList() {
  els.pointsList.innerHTML = '';
  state.samples.forEach((sample, index) => {
    const li = document.createElement('li');
    li.textContent = `Point ${index + 1}: heading ${fmtDeg(sample.headingDeg)}, pitch ${fmtSigned(sample.pitchDeg)}, skyline ${fmtDeg(sample.relativeAltDeg)}, heading spread ${fmtDeg(sample.headingSpreadDeg)}, pitch spread ${fmtDeg(sample.pitchSpreadDeg)}`;
    els.pointsList.appendChild(li);
  });
}

function drawReviewGraph() {
  const canvas = els.reviewCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  if (state.samples.length < 2 || !state.lat || !state.lng || !window.SunCalc) {
    els.windowOutput.textContent = 'Add at least two points to calculate the sun window.';
    els.confidenceText.textContent = 'Low';
    drawGraphMessage(ctx, width, height, 'Add at least two skyline points');
    return;
  }

  const profile = buildProfile(state.trimDeg);
  const sunPath = buildSunPath(state.calibrationDate, profile);
  const windows = computeWindows(state.calibrationDate, profile);
  const confidence = buildConfidence(profile, windows);
  els.confidenceText.textContent = confidence.label;
  els.trimHint.textContent = confidence.trimWarning;
  els.windowOutput.innerHTML = formatWindowOutput(windows, confidence, profile, sunPath);

  const pad = { top: 20, right: 18, bottom: 38, left: 46 };
  const graphW = width - pad.left - pad.right;
  const graphH = height - pad.top - pad.bottom;
  const xMin = profile[0].worldHeading;
  const xMax = profile[profile.length - 1].worldHeading;
  const yMax = Math.max(12, Math.ceil(Math.max(...profile.map(p => p.altDeg), ...sunPath.map(p => p.altDeg)) / 5) * 5);

  drawFrameAndGrid(ctx, pad, graphW, graphH, yMax);
  drawSkylineFill(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH);
  drawSkylineLine(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH);
  drawSunPath(ctx, sunPath, xMin, xMax, yMax, pad, graphW, graphH);
  drawVisibleSegments(ctx, sunPath, profile, xMin, xMax, yMax, pad, graphW, graphH);
  drawXAxisLabels(ctx, profile, pad, graphW, graphH);
}

function buildProfile(trimDeg = 0) {
  const entries = state.samples.map((sample, idx) => ({
    rawHeading: normalizeDeg(sample.headingDeg),
    altDeg: Number(sample.relativeAltDeg) || 0,
    index: idx,
    sample
  }));
  const unwrapped = [];
  let world = entries[0].rawHeading;
  unwrapped.push({ ...entries[0], worldHeading: world + trimDeg });
  for (let i = 1; i < entries.length; i++) {
    const delta = shortestAngleDelta(entries[i - 1].rawHeading, entries[i].rawHeading);
    world += delta;
    unwrapped.push({ ...entries[i], worldHeading: world + trimDeg });
  }
  return unwrapped.sort((a, b) => a.worldHeading - b.worldHeading);
}

function buildSunPath(dateStr, profile) {
  const center = (profile[0].worldHeading + profile[profile.length - 1].worldHeading) / 2;
  const points = [];
  for (let mins = 4 * 60; mins <= 22 * 60; mins += 5) {
    const dt = localDateAtMinutes(dateStr, mins);
    const pos = window.SunCalc.getPosition(dt, state.lat, state.lng);
    const altDeg = radToDeg(pos.altitude);
    if (altDeg <= 0) continue;
    const headingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
    const worldHeading = unwrapNear(center, headingDeg);
    points.push({ dt, altDeg, headingDeg, worldHeading });
  }
  return points;
}

function computeWindows(dateStr, profile) {
  const windows = [];
  let open = null;
  for (let mins = 4 * 60; mins <= 22 * 60; mins++) {
    const dt = localDateAtMinutes(dateStr, mins);
    const pos = window.SunCalc.getPosition(dt, state.lat, state.lng);
    const altDeg = radToDeg(pos.altitude);
    if (altDeg <= 0) {
      if (open) { windows.push(open); open = null; }
      continue;
    }
    const headingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
    const worldHeading = unwrapNear((profile[0].worldHeading + profile[profile.length - 1].worldHeading) / 2, headingDeg);
    if (worldHeading < profile[0].worldHeading || worldHeading > profile[profile.length - 1].worldHeading) {
      if (open) { windows.push(open); open = null; }
      continue;
    }
    const skylineAlt = interpolateSkyline(worldHeading, profile);
    const visible = altDeg > skylineAlt + 0.5;
    if (visible && !open) open = { start: dt, end: dt };
    else if (visible && open) open.end = dt;
    else if (!visible && open) { windows.push(open); open = null; }
  }
  if (open) windows.push(open);
  return windows;
}

function buildConfidence(profile, windows) {
  const avgHeadingSpread = avg(state.samples.map(s => s.headingSpreadDeg || 0));
  const avgPitchSpread = avg(state.samples.map(s => s.pitchSpreadDeg || 0));
  let label = 'High';
  if (state.samples.length < 4 || avgHeadingSpread > 6 || avgPitchSpread > 3 || Math.abs(state.trimDeg) > 5) label = 'Medium';
  if (state.samples.length < 3 || avgHeadingSpread > 10 || avgPitchSpread > 5 || Math.abs(state.trimDeg) > 8 || !windows.length) label = 'Low';
  const trimWarning = Math.abs(state.trimDeg) > 5
    ? 'Large trim needed. If you keep needing this much correction, the capture is unreliable.'
    : 'Use this only for a small final correction.';
  return { label, trimWarning, avgHeadingSpread, avgPitchSpread };
}

function formatWindowOutput(windows, confidence, profile, sunPath) {
  const captured = `${fmtDeg(normalizeDeg(profile[0].sample.headingDeg))} → ${fmtDeg(normalizeDeg(profile[profile.length - 1].sample.headingDeg))}`;
  const sunRange = sunPath.length ? `${fmtDeg(sunPath[0].headingDeg)} → ${fmtDeg(sunPath[sunPath.length - 1].headingDeg)}` : '—';
  if (!windows.length) {
    return `<strong>No direct sun found inside the mapped skyline.</strong><br>Captured skyline: ${captured}<br>Sun path: ${sunRange}<br>Confidence: ${confidence.label}`;
  }
  const list = windows.map(w => `${clock(w.start)}–${clock(w.end)}`).join('<br>');
  return `<strong>Sun windows</strong><br>${list}<br><br>Captured skyline: ${captured}<br>Sun path: ${sunRange}<br>Trim: ${fmtSigned(state.trimDeg)}<br>Confidence: ${confidence.label}`;
}

function drawGraphMessage(ctx, width, height, text) {
  ctx.fillStyle = '#6b665d';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
}

function drawFrameAndGrid(ctx, pad, graphW, graphH, yMax) {
  ctx.strokeStyle = '#d8ceb8';
  ctx.strokeRect(pad.left, pad.top, graphW, graphH);
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const value = (yMax / 4) * i;
    const y = pad.top + graphH - (value / yMax) * graphH;
    ctx.strokeStyle = '#efe7d5';
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + graphW, y); ctx.stroke();
    ctx.fillStyle = '#6b665d';
    ctx.fillText(`${Math.round(value)}°`, pad.left - 8, y);
  }
}

function drawSkylineFill(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  ctx.beginPath();
  profile.forEach((p, i) => {
    const x = graphX(p.worldHeading, xMin, xMax, pad.left, graphW);
    const y = graphY(p.altDeg, yMax, pad.top, graphH);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  const lastX = graphX(profile[profile.length - 1].worldHeading, xMin, xMax, pad.left, graphW);
  const firstX = graphX(profile[0].worldHeading, xMin, xMax, pad.left, graphW);
  ctx.lineTo(lastX, pad.top + graphH);
  ctx.lineTo(firstX, pad.top + graphH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(31,31,31,0.12)';
  ctx.fill();
}

function drawSkylineLine(ctx, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  ctx.beginPath();
  profile.forEach((p, i) => {
    const x = graphX(p.worldHeading, xMin, xMax, pad.left, graphW);
    const y = graphY(p.altDeg, yMax, pad.top, graphH);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.lineWidth = 1;
  profile.forEach(p => {
    const x = graphX(p.worldHeading, xMin, xMax, pad.left, graphW);
    const y = graphY(p.altDeg, yMax, pad.top, graphH);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = '#1f1f1f'; ctx.fill();
  });
}

function drawSunPath(ctx, sunPath, xMin, xMax, yMax, pad, graphW, graphH) {
  const filtered = sunPath.filter(p => p.worldHeading >= xMin && p.worldHeading <= xMax);
  if (!filtered.length) return;
  ctx.beginPath();
  filtered.forEach((p, i) => {
    const x = graphX(p.worldHeading, xMin, xMax, pad.left, graphW);
    const y = graphY(p.altDeg, yMax, pad.top, graphH);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#d06a00';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function drawVisibleSegments(ctx, sunPath, profile, xMin, xMax, yMax, pad, graphW, graphH) {
  const filtered = sunPath.filter(p => p.worldHeading >= xMin && p.worldHeading <= xMax);
  let segment = [];
  const flush = () => {
    if (segment.length < 2) { segment = []; return; }
    ctx.beginPath();
    segment.forEach((p, i) => {
      const x = graphX(p.worldHeading, xMin, xMax, pad.left, graphW);
      const y = graphY(p.altDeg, yMax, pad.top, graphH);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#efc44d';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;
    segment = [];
  };
  filtered.forEach(p => {
    const skylineAlt = interpolateSkyline(p.worldHeading, profile);
    if (p.altDeg > skylineAlt + 0.5) segment.push(p); else flush();
  });
  flush();
}

function drawXAxisLabels(ctx, profile, pad, graphW, graphH) {
  ctx.fillStyle = '#6b665d';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const first = profile[0].sample.headingDeg;
  const last = profile[profile.length - 1].sample.headingDeg;
  const mid = normalizeDeg(first + shortestAngleDelta(first, last) / 2);
  ctx.fillText(fmtDeg(normalizeDeg(first)), pad.left, pad.top + graphH + 8);
  ctx.fillText(fmtDeg(mid), pad.left + graphW / 2, pad.top + graphH + 8);
  ctx.fillText(fmtDeg(normalizeDeg(last)), pad.left + graphW, pad.top + graphH + 8);
}

function interpolateSkyline(worldHeading, profile) {
  if (worldHeading <= profile[0].worldHeading) return profile[0].altDeg;
  if (worldHeading >= profile[profile.length - 1].worldHeading) return profile[profile.length - 1].altDeg;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    if (worldHeading >= a.worldHeading && worldHeading <= b.worldHeading) {
      const span = b.worldHeading - a.worldHeading || 1;
      const t = (worldHeading - a.worldHeading) / span;
      return a.altDeg + (b.altDeg - a.altDeg) * t;
    }
  }
  return profile[0].altDeg;
}

function graphX(value, min, max, left, width) {
  return left + ((value - min) / Math.max(1, max - min)) * width;
}

function graphY(value, yMax, top, height) {
  return top + height - (value / Math.max(1, yMax)) * height;
}

function getMedian(arr, windowMs) {
  const values = arr.filter(s => s.ts >= Date.now() - windowMs).map(s => s.value);
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function getSpread(arr, windowMs, circular = false) {
  const values = arr.filter(s => s.ts >= Date.now() - windowMs).map(s => s.value);
  if (!values.length) return null;
  if (!circular) return Math.max(...values) - Math.min(...values);
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      min = Math.min(min, Math.abs(shortestAngleDelta(values[i], values[j])));
    }
  }
  return Number.isFinite(min) ? min : 0;
}

function pruneSamples(now) {
  const cutoff = now - SAMPLE_KEEP_MS;
  state.recentHeadingSamples = state.recentHeadingSamples.filter(s => s.ts >= cutoff);
  state.recentPitchSamples = state.recentPitchSamples.filter(s => s.ts >= cutoff);
}

function getHeading(event) {
  let base = null;
  if (typeof event.webkitCompassHeading === 'number') base = event.webkitCompassHeading;
  else if (typeof event.alpha === 'number') base = 360 - event.alpha;
  if (base == null) return null;
  return normalizeDeg(base + CAMERA_HEADING_OFFSET_DEG);
}

function getPitch(event) {
  return typeof event.beta === 'number' ? event.beta : null;
}

function saveDraft() {
  const record = buildRecord();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
  alert('Draft saved on this device.');
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    state.pubName = draft.pubName || '';
    state.seatName = draft.seatName || '';
    state.notes = draft.notes || '';
    state.lat = draft.lat ?? null;
    state.lng = draft.lng ?? null;
    state.gpsAccuracyM = draft.gpsAccuracyM ?? null;
    state.gpsTimestamp = draft.gpsTimestamp ?? null;
    state.samples = Array.isArray(draft.samples) ? draft.samples : [];
    state.levelPitch = draft.levelPitch ?? null;
    state.levelCapturedAt = draft.levelCapturedAt ?? null;
    state.trimDeg = draft.trimDeg ?? 0;
    state.calibrationDate = draft.calibrationDate || state.calibrationDate;
    els.pubName.value = state.pubName;
    els.seatName.value = state.seatName;
    els.notes.value = state.notes;
    els.trimRange.value = String(state.trimDeg);
    if (state.lat != null && state.lng != null) {
      state.gpsReady = true;
      state.setupStates.gps = 'ready';
    }
  } catch (err) {
    console.error(err);
  }
}

function exportJson() {
  const record = buildRecord();
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(state.pubName || 'pub')}-${slug(state.seatName || 'seat')}-skyline.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildRecord() {
  return {
    pubName: state.pubName,
    seatName: state.seatName,
    notes: state.notes,
    calibrationDate: state.calibrationDate,
    lat: state.lat,
    lng: state.lng,
    gpsAccuracyM: state.gpsAccuracyM,
    gpsTimestamp: state.gpsTimestamp,
    levelPitch: state.levelPitch,
    levelCapturedAt: state.levelCapturedAt,
    trimDeg: state.trimDeg,
    samples: state.samples,
    exportedAt: new Date().toISOString()
  };
}

function normalizeDeg(value) {
  let out = value % 360;
  if (out < 0) out += 360;
  return out;
}
function shortestAngleDelta(from, to) {
  let d = normalizeDeg(to) - normalizeDeg(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function unwrapNear(reference, value) {
  const candidates = [value - 720, value - 360, value, value + 360, value + 720];
  return candidates.reduce((best, cand) => Math.abs(cand - reference) < Math.abs(best - reference) ? cand : best, candidates[0]);
}
function localDateAtMinutes(dateStr, minutes) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
function localDateValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatDateLabel(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}
function clock(date) { return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function radToDeg(rad) { return rad * 180 / Math.PI; }
function round1(v) { return Math.round(v * 10) / 10; }
function fmtDeg(v) { return `${round1(v).toFixed(1)}°`; }
function fmtSigned(v) { const n = round1(v); return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}°`; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function avg(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function slug(str) { return String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function afterAnimation() { requestAnimationFrame(() => {}); }
