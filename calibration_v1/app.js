const app = {
  elements: {},
  stream: null,
  animationFrame: 0,
  mode: 'align',
  tracePoints: [],
  draggingSun: false,
  lastSunScreen: null,
  dims: { width: 0, height: 0 },
  permissionsReady: false,
  orientationReady: false,
  locationReady: false,
  headingRaw: null,
  pitchRaw: null,
  rollRaw: null,
  headingSmoothed: null,
  pitchSmoothed: null,
  rollSmoothed: null,
  lat: null,
  lng: null,
  headingOffset: 0,
  pitchOffset: 0,
  vFovDeg: 70,
  hFovDeg: 40,
  pathDate: new Date(),
  alignLocked: false,
  usingWebkitCompass: false,
  snapshotCanvas: document.createElement('canvas')
};

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

window.addEventListener('load', init);
window.addEventListener('resize', handleResize);
window.addEventListener('beforeunload', stopCamera);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(app.animationFrame);
  } else if (app.permissionsReady) {
    app.animationFrame = requestAnimationFrame(renderLoop);
  }
});

function init() {
  const $ = (id) => document.getElementById(id);
  app.elements = {
    setupCard: $('setupCard'),
    viewerSection: $('viewerSection'),
    pubName: $('pubName'),
    spotName: $('spotName'),
    pathDate: $('pathDate'),
    vFovSelect: $('vFovSelect'),
    startBtn: $('startBtn'),
    helpBtn: $('helpBtn'),
    helpDialog: $('helpDialog'),
    video: $('video'),
    overlay: $('overlay'),
    statusPill: $('statusPill'),
    alignModeBtn: $('alignModeBtn'),
    traceModeBtn: $('traceModeBtn'),
    alignControls: $('alignControls'),
    traceControls: $('traceControls'),
    lockAlignBtn: $('lockAlignBtn'),
    zeroOffsetBtn: $('zeroOffsetBtn'),
    undoBtn: $('undoBtn'),
    clearBtn: $('clearBtn'),
    saveBtn: $('saveBtn'),
    headingReadout: $('headingReadout'),
    pitchReadout: $('pitchReadout'),
    offsetReadout: $('offsetReadout'),
    pointsReadout: $('pointsReadout')
  };

  const today = new Date();
  app.elements.pathDate.value = toDateInputValue(today);
  app.pathDate = startOfDay(today);

  app.elements.helpBtn.addEventListener('click', () => app.elements.helpDialog.showModal());
  app.elements.startBtn.addEventListener('click', startExperience);
  app.elements.alignModeBtn.addEventListener('click', () => setMode('align'));
  app.elements.traceModeBtn.addEventListener('click', () => setMode('trace'));
  app.elements.lockAlignBtn.addEventListener('click', toggleAlignLock);
  app.elements.zeroOffsetBtn.addEventListener('click', () => {
    app.headingOffset = 0;
    app.pitchOffset = 0;
    updateReadouts();
  });
  app.elements.undoBtn.addEventListener('click', () => {
    app.tracePoints.pop();
    updateReadouts();
  });
  app.elements.clearBtn.addEventListener('click', () => {
    app.tracePoints = [];
    updateReadouts();
  });
  app.elements.saveBtn.addEventListener('click', saveDraft);
  app.elements.pathDate.addEventListener('change', (e) => {
    app.pathDate = startOfDay(new Date(e.target.value + 'T12:00:00'));
  });
  app.elements.vFovSelect.addEventListener('change', (e) => {
    app.vFovDeg = Number(e.target.value || 70);
    updateFov();
  });

  document.querySelectorAll('.nudge-btn').forEach((btn) => {
    btn.addEventListener('click', () => nudge(btn.dataset.nudge));
  });

  const canvas = app.elements.overlay;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  handleResize();
  updateReadouts();
}

async function startExperience() {
  setStatus('Requesting permissions…');

  try {
    await startCamera();
    await getLocation();
    await requestOrientationAccess();
    app.permissionsReady = true;

    app.elements.setupCard.classList.add('hidden');
    app.elements.viewerSection.classList.remove('hidden');
    handleResize();
    updateFov();
    setStatus('Align the sun marker to the real sun.');
    app.animationFrame = requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    const message = error && error.message ? error.message : 'Unable to start camera or sensors.';
    setStatus(message);
    alert(message + '\n\nUse HTTPS on a real phone and allow the requested permissions.');
  }
}

async function startCamera() {
  stopCamera();

  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  app.stream = await navigator.mediaDevices.getUserMedia(constraints);
  app.elements.video.srcObject = app.stream;

  await new Promise((resolve) => {
    app.elements.video.onloadedmetadata = async () => {
      try {
        await app.elements.video.play();
      } catch (_) {}
      resolve();
    };
  });
}

function stopCamera() {
  if (app.stream) {
    app.stream.getTracks().forEach((track) => track.stop());
    app.stream = null;
  }
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        app.lat = pos.coords.latitude;
        app.lng = pos.coords.longitude;
        app.locationReady = true;
        resolve(pos.coords);
      },
      (err) => {
        reject(new Error('Location permission is required for the sun path.'));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function requestOrientationAccess() {
  if (typeof DeviceOrientationEvent === 'undefined') {
    throw new Error('Device orientation is not supported on this device.');
  }

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const response = await DeviceOrientationEvent.requestPermission();
    if (response !== 'granted') {
      throw new Error('Motion/orientation permission was not granted.');
    }
  }

  window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  window.addEventListener('deviceorientation', handleOrientation, true);
  app.orientationReady = true;
}

function handleOrientation(event) {
  let heading = null;
  let pitch = null;
  let roll = null;

  if (typeof event.webkitCompassHeading === 'number') {
    heading = normalize360(event.webkitCompassHeading);
    app.usingWebkitCompass = true;
  } else if (event.absolute && isFinite(event.alpha)) {
    heading = computeCompassHeading(event.alpha, event.beta, event.gamma);
  } else if (isFinite(event.alpha)) {
    heading = normalize360(360 - event.alpha);
  }

  if (isFinite(event.beta)) {
    pitch = clamp(90 - event.beta, -90, 90);
  }

  if (isFinite(event.gamma)) {
    roll = clamp(event.gamma, -90, 90);
  }

  if (heading !== null) {
    app.headingRaw = heading;
    app.headingSmoothed = app.headingSmoothed === null ? heading : lerpAngle(app.headingSmoothed, heading, 0.18);
  }

  if (pitch !== null) {
    app.pitchRaw = pitch;
    app.pitchSmoothed = app.pitchSmoothed === null ? pitch : lerp(app.pitchSmoothed, pitch, 0.18);
  }

  if (roll !== null) {
    app.rollRaw = roll;
    app.rollSmoothed = app.rollSmoothed === null ? roll : lerp(app.rollSmoothed, roll, 0.15);
  }
}

function setMode(mode) {
  app.mode = mode;
  app.elements.alignModeBtn.classList.toggle('active', mode === 'align');
  app.elements.traceModeBtn.classList.toggle('active', mode === 'trace');
  app.elements.alignControls.classList.toggle('hidden', mode !== 'align');
  app.elements.traceControls.classList.toggle('hidden', mode !== 'trace');
  setStatus(mode === 'align' ? 'Move the sun marker onto the real sun.' : 'Tap along the skyline or obstruction edge.');
}

function toggleAlignLock() {
  app.alignLocked = !app.alignLocked;
  app.elements.lockAlignBtn.textContent = app.alignLocked ? 'Unlock alignment' : 'Lock alignment';
  if (app.alignLocked) {
    setMode('trace');
  } else {
    setMode('align');
  }
}

function nudge(direction) {
  const stepH = app.hFovDeg * 0.018;
  const stepV = app.vFovDeg * 0.018;

  if (direction === 'left') app.headingOffset -= stepH;
  if (direction === 'right') app.headingOffset += stepH;
  if (direction === 'up') app.pitchOffset += stepV;
  if (direction === 'down') app.pitchOffset -= stepV;
  updateReadouts();
}

function onPointerDown(event) {
  const point = getCanvasPoint(event);

  if (app.mode === 'align') {
    const sun = app.lastSunScreen;
    if (sun) {
      const dist = Math.hypot(point.x - sun.x, point.y - sun.y);
      if (dist <= 42) {
        app.draggingSun = true;
        event.target.setPointerCapture?.(event.pointerId);
      }
    }
  } else if (app.mode === 'trace') {
    app.tracePoints.push({
      x: point.x / app.dims.width,
      y: point.y / app.dims.height
    });
    updateReadouts();
  }
}

function onPointerMove(event) {
  if (!app.draggingSun || app.mode !== 'align') return;

  const point = getCanvasPoint(event);
  const sun = app.lastSunScreen;
  if (!sun) return;

  const dx = point.x - sun.x;
  const dy = point.y - sun.y;

  app.headingOffset += (dx / app.dims.width) * app.hFovDeg;
  app.pitchOffset += (-dy / app.dims.height) * app.vFovDeg;
  updateReadouts();
}

function onPointerUp(event) {
  if (app.draggingSun) {
    event.target.releasePointerCapture?.(event.pointerId);
  }
  app.draggingSun = false;
}

function renderLoop() {
  drawOverlay();
  app.animationFrame = requestAnimationFrame(renderLoop);
}

function drawOverlay() {
  const canvas = app.elements.overlay;
  const ctx = canvas.getContext('2d');
  const { width, height } = app.dims;
  if (!width || !height) return;

  ctx.clearRect(0, 0, width, height);

  const ready = app.locationReady && app.headingSmoothed !== null;
  if (!ready) {
    drawCenteredText(ctx, width, height, 'Waiting for location and heading…');
    return;
  }

  const correctedHeading = normalize360(app.headingSmoothed + app.headingOffset);
  const correctedPitch = (app.pitchSmoothed ?? 0) + app.pitchOffset;
  const roll = app.rollSmoothed ?? 0;

  const pathPoints = sampleSunPath(app.pathDate, app.lat, app.lng);
  const projectedPath = pathPoints
    .map((sample) => ({ ...sample, screen: projectSun(sample.azimuth, sample.altitude, correctedHeading, correctedPitch, roll, width, height) }))
    .filter((p) => p.screen && p.altitude > -8);

  ctx.save();

  if (projectedPath.length > 1) {
    ctx.beginPath();
    projectedPath.forEach((p, index) => {
      if (index === 0) ctx.moveTo(p.screen.x, p.screen.y);
      else ctx.lineTo(p.screen.x, p.screen.y);
    });
    ctx.strokeStyle = 'rgba(244, 197, 66, 0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const nowSun = getSunPosition(new Date(), app.lat, app.lng);
  const current = projectSun(nowSun.azimuth, nowSun.altitude, correctedHeading, correctedPitch, roll, width, height);

  app.lastSunScreen = current;

  if (current) {
    ctx.beginPath();
    ctx.arc(current.x, current.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#f4c542';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(current.x, current.y, 23, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(244, 197, 66, 0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#111';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText('Sun now', current.x + 18, current.y - 10);
  }

  if (app.tracePoints.length) {
    drawTrace(ctx, width, height);
  }

  drawHorizonGuide(ctx, width, height, correctedPitch, roll);
  drawCornerLegend(ctx, correctedHeading, correctedPitch);

  ctx.restore();
  updateReadouts();
}

function drawTrace(ctx, width, height) {
  if (!app.tracePoints.length) return;

  ctx.beginPath();
  app.tracePoints.forEach((pt, index) => {
    const x = pt.x * width;
    const y = pt.y * height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(143, 227, 168, 0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();

  app.tracePoints.forEach((pt, index) => {
    const x = pt.x * width;
    const y = pt.y * height;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#8fe3a8';
    ctx.fill();
    ctx.fillStyle = '#101214';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText(String(index + 1), x + 9, y - 9);
  });
}

function drawHorizonGuide(ctx, width, height, pitch, roll) {
  const y = height / 2 + (pitch / app.vFovDeg) * height;
  const angle = -roll * DEG;
  const dx = Math.cos(angle) * width;
  const dy = Math.sin(angle) * width;

  ctx.beginPath();
  ctx.moveTo(width / 2 - dx / 2, y - dy / 2);
  ctx.lineTo(width / 2 + dx / 2, y + dy / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCornerLegend(ctx, heading, pitch) {
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  roundRect(ctx, 12, app.dims.height - 72, 180, 58, 14, true, false);
  ctx.fillStyle = '#f4f6f8';
  ctx.font = '600 12px Inter, sans-serif';
  ctx.fillText(`Heading ${formatDeg(heading)}`, 24, app.dims.height - 44);
  ctx.fillText(`Pitch ${formatSignedDeg(pitch)}`, 24, app.dims.height - 24);
}

function drawCenteredText(ctx, width, height, text) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, width / 2 - 140, height / 2 - 28, 280, 56, 16, true, false);
  ctx.fillStyle = '#fff';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, height / 2 + 5);
  ctx.textAlign = 'start';
}

function handleResize() {
  const canvas = app.elements.overlay;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.dims.width = rect.width;
  app.dims.height = rect.height;
  updateFov();
}

function updateFov() {
  const aspect = app.dims.width > 0 && app.dims.height > 0 ? app.dims.width / app.dims.height : 9 / 16;
  app.hFovDeg = 2 * Math.atan(Math.tan((app.vFovDeg * DEG) / 2) * aspect) * RAD;
}

function updateReadouts() {
  app.elements.headingReadout.textContent = app.headingSmoothed === null ? '—' : formatDeg(normalize360(app.headingSmoothed + app.headingOffset));
  app.elements.pitchReadout.textContent = app.pitchSmoothed === null ? '—' : formatSignedDeg((app.pitchSmoothed ?? 0) + app.pitchOffset);
  app.elements.offsetReadout.textContent = `${formatSignedDeg(app.headingOffset)} / ${formatSignedDeg(app.pitchOffset)}`;
  app.elements.pointsReadout.textContent = String(app.tracePoints.length);
}

async function saveDraft() {
  if (!app.permissionsReady) {
    alert('Start the calibration first.');
    return;
  }

  const pub = app.elements.pubName.value.trim() || 'Untitled pub';
  const spot = app.elements.spotName.value.trim() || 'Untitled spot';
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const pngName = `${slugify(pub)}-${slugify(spot)}-${timestamp}.png`;
  const jsonName = `${slugify(pub)}-${slugify(spot)}-${timestamp}.json`;

  const payload = {
    pub_name: pub,
    spot_name: spot,
    capture_timestamp: now.toISOString(),
    calibration_date_basis: app.elements.pathDate.value,
    lat: app.lat,
    lng: app.lng,
    heading_raw_deg: round2(app.headingSmoothed),
    pitch_raw_deg: round2(app.pitchSmoothed),
    heading_offset_deg: round2(app.headingOffset),
    pitch_offset_deg: round2(app.pitchOffset),
    heading_corrected_deg: round2(normalize360((app.headingSmoothed ?? 0) + app.headingOffset)),
    pitch_corrected_deg: round2((app.pitchSmoothed ?? 0) + app.pitchOffset),
    vertical_fov_deg: app.vFovDeg,
    horizontal_fov_deg: round2(app.hFovDeg),
    obstruction_points: app.tracePoints.map((p) => ({ x: round4(p.x), y: round4(p.y) })),
    status: 'draft'
  };

  const pngBlob = await createSnapshotBlob();
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), jsonName);
  downloadBlob(pngBlob, pngName);
  setStatus(`Draft saved: ${jsonName} and ${pngName}`);
}

async function createSnapshotBlob() {
  const video = app.elements.video;
  const canvas = app.snapshotCanvas;
  const ctx = canvas.getContext('2d');
  const rect = app.elements.overlay.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  try {
    ctx.drawImage(video, 0, 0, width, height);
  } catch (_) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
  }

  const overlay = app.elements.overlay;
  ctx.drawImage(overlay, 0, 0, width, height);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.92));
}

function setStatus(text) {
  app.elements.statusPill.textContent = text;
}

function getCanvasPoint(event) {
  const rect = app.elements.overlay.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function projectSun(azimuthDeg, altitudeDeg, headingDeg, pitchDeg, rollDeg, width, height) {
  const relAz = wrapSigned(azimuthDeg - headingDeg);
  const relAlt = altitudeDeg - pitchDeg;
  const xNorm = Math.tan(relAz * DEG) / Math.tan((app.hFovDeg * DEG) / 2);
  const yNorm = Math.tan(relAlt * DEG) / Math.tan((app.vFovDeg * DEG) / 2);

  if (!isFinite(xNorm) || !isFinite(yNorm)) return null;
  if (Math.abs(relAz) > 89 || Math.abs(relAlt) > 89) return null;

  let x = width / 2 + xNorm * (width / 2);
  let y = height / 2 - yNorm * (height / 2);

  const r = -rollDeg * DEG;
  const dx = x - width / 2;
  const dy = y - height / 2;
  const rx = dx * Math.cos(r) - dy * Math.sin(r);
  const ry = dx * Math.sin(r) + dy * Math.cos(r);
  x = width / 2 + rx;
  y = height / 2 + ry;

  return { x, y };
}

function sampleSunPath(baseDate, lat, lng) {
  const points = [];
  const start = new Date(baseDate);
  start.setHours(4, 0, 0, 0);
  for (let minutes = 0; minutes <= 18 * 60; minutes += 10) {
    const d = new Date(start.getTime() + minutes * 60000);
    const pos = getSunPosition(d, lat, lng);
    points.push({ time: d, azimuth: pos.azimuth, altitude: pos.altitude });
  }
  return points;
}

function getSunPosition(date, lat, lng) {
  const lw = -lng * DEG;
  const phi = lat * DEG;
  const d = toDays(date);
  const c = solarCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  const h = altitude(H, phi, c.dec);
  const az = azimuth(H, phi, c.dec);

  return {
    azimuth: normalize360((az * RAD) + 180),
    altitude: h * RAD
  };
}

function toJulian(date) {
  return date.valueOf() / 86400000 - 0.5 + 2440588;
}

function toDays(date) {
  return toJulian(date) - 2451545;
}

function solarMeanAnomaly(d) {
  return DEG * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M) {
  const C = DEG * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = DEG * 102.9372;
  return M + C + P + Math.PI;
}

function declination(l, b) {
  const e = DEG * 23.4397;
  return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
}

function rightAscension(l, b) {
  const e = DEG * 23.4397;
  return Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
}

function solarCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return {
    dec: declination(L, 0),
    ra: rightAscension(L, 0)
  };
}

function siderealTime(d, lw) {
  return DEG * (280.16 + 360.9856235 * d) - lw;
}

function azimuth(H, phi, dec) {
  return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
}

function altitude(H, phi, dec) {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}

function computeCompassHeading(alpha, beta, gamma) {
  const degtorad = Math.PI / 180;
  const _x = beta ? beta * degtorad : 0;
  const _y = gamma ? gamma * degtorad : 0;
  const _z = alpha ? alpha * degtorad : 0;

  const cX = Math.cos(_x);
  const cY = Math.cos(_y);
  const cZ = Math.cos(_z);
  const sX = Math.sin(_x);
  const sY = Math.sin(_y);
  const sZ = Math.sin(_z);

  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;
  let heading = Math.atan(Vx / Vy);

  if (Vy < 0) {
    heading += Math.PI;
  } else if (Vx < 0) {
    heading += 2 * Math.PI;
  }

  return normalize360(heading * RAD);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  const delta = wrapSigned(b - a);
  return normalize360(a + delta * t);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapSigned(deg) {
  let value = ((deg + 180) % 360 + 360) % 360 - 180;
  if (value === -180) value = 180;
  return value;
}

function normalize360(deg) {
  return ((deg % 360) + 360) % 360;
}

function formatDeg(value) {
  return `${Math.round(normalize360(value))}°`;
}

function formatSignedDeg(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function round2(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'calibration';
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
