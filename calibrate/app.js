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
  horizonPitch: null,
  horizonCapturedAt: null,
  motionReady: false,
  motionRequested: false,
  cameraReady: false,
  gpsReady: false,
  stream: null,
  samples: []
};

const els = {
  pubName: document.getElementById("pubName"),
  seatName: document.getElementById("seatName"),
  notes: document.getElementById("notes"),
  startBtn: document.getElementById("startBtn"),
  enableMotionBtn: document.getElementById("enableMotionBtn"),
  setHorizonBtn: document.getElementById("setHorizonBtn"),
  addPointBtn: document.getElementById("addPointBtn"),
  undoPointBtn: document.getElementById("undoPointBtn"),
  clearBtn: document.getElementById("clearBtn"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  exportBtn: document.getElementById("exportBtn"),
  previewBtn: document.getElementById("previewBtn"),
  previewDate: document.getElementById("previewDate"),
  previewOutput: document.getElementById("previewOutput"),
  video: document.getElementById("video"),
  gpsStatus: document.getElementById("gpsStatus"),
  cameraStatus: document.getElementById("cameraStatus"),
  motionStatus: document.getElementById("motionStatus"),
  headingValue: document.getElementById("headingValue"),
  pitchValue: document.getElementById("pitchValue"),
  horizonValue: document.getElementById("horizonValue"),
  pointsCount: document.getElementById("pointsCount"),
  pointsList: document.getElementById("pointsList")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindUI();
  loadDraft();
  setDefaultPreviewDate();
  render();
}

function bindUI() {
  els.startBtn.addEventListener("click", startCalibration);
  els.enableMotionBtn.addEventListener("click", enableMotionFromButton);
  els.setHorizonBtn.addEventListener("click", setHorizonReference);
  els.addPointBtn.addEventListener("click", addPoint);
  els.undoPointBtn.addEventListener("click", undoPoint);
  els.clearBtn.addEventListener("click", clearPoints);
  els.saveDraftBtn.addEventListener("click", saveDraft);
  els.exportBtn.addEventListener("click", exportJson);
  els.previewBtn.addEventListener("click", calculatePreview);

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

  els.previewDate.addEventListener("change", () => {
    els.previewOutput.textContent = "Preview date updated. Tap Calculate sun window.";
  });
}

function setDefaultPreviewDate() {
  if (!els.previewDate.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    els.previewDate.value = `${y}-${m}-${d}`;
  }
}

async function enableMotionFromButton() {
  els.enableMotionBtn.disabled = true;
  els.motionStatus.textContent = "Requesting...";

  try {
    await requestMotion();
    render();

    setTimeout(() => {
      if (state.motionReady && (state.headingDeg == null || state.pitchDeg == null)) {
        els.motionStatus.textContent = "Enabled - move phone slightly";
      }
    }, 1500);
  } catch (err) {
    console.error(err);
    els.motionStatus.textContent = "Failed";
    alert(err.message || "Could not enable motion.");
  } finally {
    els.enableMotionBtn.disabled = false;
    render();
  }
}

async function startCalibration() {
  state.pubName = els.pubName.value.trim();
  state.seatName = els.seatName.value.trim();
  state.notes = els.notes.value.trim();

  if (!state.pubName || !state.seatName) {
    alert("Add the pub name and seat name first.");
    return;
  }

  els.startBtn.disabled = true;

  try {
    await requestLocation();
    await requestCamera();
  } catch (err) {
    console.error(err);
    alert(err.message || "Could not start calibration.");
  } finally {
    els.startBtn.disabled = false;
    render();
  }
}

function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported on this device/browser."));
      return;
    }

    els.gpsStatus.textContent = "Requesting...";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.lat = pos.coords.latitude;
        state.lng = pos.coords.longitude;
        state.gpsAccuracyM = pos.coords.accuracy;
        state.gpsTimestamp = new Date(pos.timestamp).toISOString();
        state.gpsReady = true;

        const acc = Number.isFinite(state.gpsAccuracyM)
          ? `Ready (${Math.round(state.gpsAccuracyM)}m accuracy)`
          : "Ready";

        els.gpsStatus.textContent = acc;
        resolve();
      },
      (err) => {
        els.gpsStatus.textContent = "Failed";
        reject(new Error(`GPS failed: ${err.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

async function requestCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera access is not supported on this browser.");
  }

  els.cameraStatus.textContent = "Requesting...";

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  state.stream = stream;
  els.video.srcObject = stream;
  state.cameraReady = true;
  els.cameraStatus.textContent = "Ready";
}

async function requestMotion() {
  if (state.motionRequested) return;

  state.motionRequested = true;

  const hasDeviceOrientation = typeof DeviceOrientationEvent !== "undefined";
  if (!hasDeviceOrientation) {
    throw new Error("Device orientation is not supported on this device/browser.");
  }

  const isIOSPermissionFlow =
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (isIOSPermissionFlow) {
    const response = await DeviceOrientationEvent.requestPermission();
    if (response !== "granted") {
      throw new Error("Motion/orientation permission was denied.");
    }
  }

  window.addEventListener("deviceorientation", handleOrientation, true);
  state.motionReady = true;
  els.motionStatus.textContent = "Enabled";
}

function handleOrientation(event) {
  const heading = getHeading(event);
  const pitch = getPitch(event);

  if (heading != null) {
    state.headingDeg = normalizeDeg(heading);
    els.headingValue.textContent = `${state.headingDeg.toFixed(1)}°`;
  }

  if (pitch != null) {
    state.pitchDeg = pitch;
    els.pitchValue.textContent = `${state.pitchDeg.toFixed(1)}°`;
  }

  if (state.headingDeg != null || state.pitchDeg != null) {
    els.motionStatus.textContent = "Ready";
    render();
  }
}

function getHeading(event) {
  if (typeof event.webkitCompassHeading === "number") {
    return event.webkitCompassHeading;
  }

  if (typeof event.alpha === "number") {
    return 360 - event.alpha;
  }

  return null;
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

function setHorizonReference() {
  if (!state.motionReady) {
    alert("Tap Enable motion first.");
    return;
  }

  if (state.pitchDeg == null) {
    alert("No pitch data yet. Move the phone slightly and try again.");
    return;
  }

  state.horizonPitch = round1(state.pitchDeg);
  state.horizonCapturedAt = new Date().toISOString();
  els.horizonValue.textContent = `${state.horizonPitch.toFixed(1)}°`;
  els.previewOutput.textContent = "Horizon set. You can now capture points.";
  render();
}

function addPoint() {
  if (!state.gpsReady || !state.cameraReady) {
    alert("Start calibration first.");
    return;
  }

  if (!state.motionReady) {
    alert("Tap Enable motion first.");
    return;
  }

  if (state.horizonPitch == null) {
    alert("Set the horizon first.");
    return;
  }

  if (state.headingDeg == null || state.pitchDeg == null) {
    alert("No motion data yet. Move the phone slightly and try again.");
    return;
  }

  const sample = {
    headingDeg: round1(state.headingDeg),
    pitchDeg: round1(state.pitchDeg),
    relativeAltDeg: round1(Math.max(0, state.horizonPitch - state.pitchDeg)),
    capturedAt: new Date().toISOString()
  };

  state.samples.push(sample);
  els.previewOutput.textContent = "Points updated. Tap Calculate sun window.";
  render();
}

function undoPoint() {
  state.samples.pop();
  els.previewOutput.textContent = "Last point removed.";
  render();
}

function clearPoints() {
  if (state.samples.length === 0) return;

  const ok = confirm("Clear all captured points and start again?");
  if (!ok) return;

  state.samples = [];
  localStorage.removeItem("dits-calibration-draft");
  els.previewOutput.textContent = "Points cleared. Capture a new sweep.";
  render();
}

function calculatePreview() {
  if (!window.SunCalc) {
    els.previewOutput.textContent = "SunCalc did not load.";
    return;
  }

  if (!hasPreviewInputs()) {
    alert("You need a horizon, location, and at least 2 points before preview will work.");
    return;
  }

  const selectedDate = els.previewDate.value;
  if (!selectedDate) {
    alert("Pick a preview date.");
    return;
  }

  const profile = buildProfile();
  const windows = getSunWindowsForDate(selectedDate, profile);

  if (!windows.length) {
    els.previewOutput.innerHTML = `
      <strong>No direct sun detected</strong><br>
      No visible sun window was found for this date from the captured profile.
    `;
    return;
  }

  const first = windows[0].start;
  const last = windows[windows.length - 1].end;
  const list = windows
    .map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`)
    .join("<br>");

  els.previewOutput.innerHTML = `
    <strong>Sun windows</strong><br>
    ${list}
    <br><br>
    <strong>First sun:</strong> ${formatClock(first)}<br>
    <strong>Last sun:</strong> ${formatClock(last)}
  `;
}

function buildProfile() {
  const out = [];
  let prevAdjusted = null;

  for (const sample of state.samples) {
    const raw = normalizeDeg(sample.headingDeg);
    let adjusted = raw;

    if (prevAdjusted != null) {
      const candidates = [raw - 360, raw, raw + 360];
      adjusted = candidates.reduce((best, candidate) => {
        return Math.abs(candidate - prevAdjusted) < Math.abs(best - prevAdjusted)
          ? candidate
          : best;
      }, candidates[0]);
    }

    out.push({
      rawHeadingDeg: raw,
      adjustedHeadingDeg: adjusted,
      obstructionAltDeg: round1(Math.max(0, state.horizonPitch - sample.pitchDeg)),
      pitchDeg: sample.pitchDeg
    });

    prevAdjusted = adjusted;
  }

  return out.sort((a, b) => a.adjustedHeadingDeg - b.adjustedHeadingDeg);
}

function getSunWindowsForDate(dateStr, profile) {
  const windows = [];
  let openWindow = null;

  for (let minutes = 4 * 60; minutes <= 22 * 60; minutes += 5) {
    const dt = localDateAtMinutes(dateStr, minutes);
    const visible = isSunVisibleAt(dt, profile);

    if (visible && !openWindow) {
      openWindow = { start: dt, end: dt };
    } else if (visible && openWindow) {
      openWindow.end = dt;
    } else if (!visible && openWindow) {
      windows.push({ ...openWindow });
      openWindow = null;
    }
  }

  if (openWindow) {
    windows.push({ ...openWindow });
  }

  return windows;
}

function isSunVisibleAt(dateObj, profile) {
  const pos = window.SunCalc.getPosition(dateObj, state.lat, state.lng);
  const sunAltDeg = radToDeg(pos.altitude);

  if (sunAltDeg <= 0) return false;

  const sunHeadingDeg = normalizeDeg(180 + radToDeg(pos.azimuth));
  const obstructionAltDeg = getObstructionAltitudeAtHeading(sunHeadingDeg, profile);

  return sunAltDeg > obstructionAltDeg;
}

function getObstructionAltitudeAtHeading(compassHeadingDeg, profile) {
  if (!profile.length) return 0;
  if (profile.length === 1) return profile[0].obstructionAltDeg;

  const targetAdjusted = mapCompassToAdjustedHeading(compassHeadingDeg, profile);

  if (targetAdjusted <= profile[0].adjustedHeadingDeg) {
    return profile[0].obstructionAltDeg;
  }

  if (targetAdjusted >= profile[profile.length - 1].adjustedHeadingDeg) {
    return profile[profile.length - 1].obstructionAltDeg;
  }

  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];

    if (
      targetAdjusted >= a.adjustedHeadingDeg &&
      targetAdjusted <= b.adjustedHeadingDeg
    ) {
      const span = b.adjustedHeadingDeg - a.adjustedHeadingDeg;
      if (span === 0) return a.obstructionAltDeg;

      const t = (targetAdjusted - a.adjustedHeadingDeg) / span;
      return a.obstructionAltDeg + (b.obstructionAltDeg - a.obstructionAltDeg) * t;
    }
  }

  return profile[profile.length - 1].obstructionAltDeg;
}

function mapCompassToAdjustedHeading(compassHeadingDeg, profile) {
  const mid =
    (profile[0].adjustedHeadingDeg +
      profile[profile.length - 1].adjustedHeadingDeg) / 2;

  const candidates = [
    compassHeadingDeg - 720,
    compassHeadingDeg - 360,
    compassHeadingDeg,
    compassHeadingDeg + 360,
    compassHeadingDeg + 720
  ];

  return candidates.reduce((best, candidate) => {
    return Math.abs(candidate - mid) < Math.abs(best - mid) ? candidate : best;
  }, candidates[0]);
}

function localDateAtMinutes(dateStr, totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00`);
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function render() {
  els.pointsCount.textContent = String(state.samples.length);

  els.addPointBtn.disabled = !canCapture();
  els.undoPointBtn.disabled = state.samples.length === 0;
  els.clearBtn.disabled = state.samples.length === 0;
  els.saveDraftBtn.disabled = !hasMinimumData();
  els.exportBtn.disabled = !hasMinimumData();
  els.previewBtn.disabled = !hasPreviewInputs();

  els.setHorizonBtn.disabled =
    !state.motionReady || state.pitchDeg == null;

  if (els.enableMotionBtn) {
    els.enableMotionBtn.disabled = state.motionReady;
    els.enableMotionBtn.textContent = state.motionReady
      ? "Motion enabled"
      : "Enable motion";
  }

  els.horizonValue.textContent =
    state.horizonPitch == null ? "Not set" : `${state.horizonPitch.toFixed(1)}°`;

  renderPoints();
}

function renderPoints() {
  els.pointsList.innerHTML = "";

  state.samples.forEach((sample, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div><strong>Point ${index + 1}</strong></div>
      <div class="point-meta">
        Heading ${sample.headingDeg.toFixed(1)}°, pitch ${sample.pitchDeg.toFixed(1)}°
      </div>
      <div class="point-meta">
        Relative obstruction ${sample.relativeAltDeg.toFixed(1)}°
      </div>
      <div class="point-meta">${formatTime(sample.capturedAt)}</div>
    `;
    els.pointsList.appendChild(li);
  });
}

function canCapture() {
  return (
    state.gpsReady &&
    state.cameraReady &&
    state.motionReady &&
    state.horizonPitch != null &&
    state.headingDeg != null &&
    state.pitchDeg != null
  );
}

function hasMinimumData() {
  return (
    state.pubName &&
    state.seatName &&
    state.lat != null &&
    state.lng != null &&
    state.samples.length > 0
  );
}

function hasPreviewInputs() {
  return hasMinimumData() && state.horizonPitch != null && state.samples.length >= 2;
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
    createdAt: new Date().toISOString(),
    deviceOrientationAvailable: state.motionReady,
    horizonPitch: state.horizonPitch,
    horizonCapturedAt: state.horizonCapturedAt,
    samples: [...state.samples]
  };
}

function saveDraft() {
  try {
    const draft = buildRecord();
    localStorage.setItem("dits-calibration-draft", JSON.stringify(draft));
    alert("Draft saved on this device.");
  } catch (err) {
    console.error(err);
    alert("Could not save draft.");
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem("dits-calibration-draft");
    if (!raw) return;

    const draft = JSON.parse(raw);

    state.pubName = draft.pubName || "";
    state.seatName = draft.seatName || "";
    state.notes = draft.notes || "";
    state.lat = draft.lat ?? null;
    state.lng = draft.lng ?? null;
    state.gpsAccuracyM = draft.gpsAccuracyM ?? null;
    state.gpsTimestamp = draft.gpsTimestamp ?? null;
    state.horizonPitch = draft.horizonPitch ?? null;
    state.horizonCapturedAt = draft.horizonCapturedAt ?? null;
    state.samples = Array.isArray(draft.samples) ? draft.samples : [];

    state.gpsReady = state.lat != null && state.lng != null;

    els.pubName.value = state.pubName;
    els.seatName.value = state.seatName;
    els.notes.value = state.notes;

    if (state.gpsReady) {
      const acc = Number.isFinite(state.gpsAccuracyM)
        ? `${Math.round(state.gpsAccuracyM)}m accuracy`
        : "saved";
      els.gpsStatus.textContent = `Draft loaded (${acc})`;
    }

    if (state.horizonPitch != null) {
      els.horizonValue.textContent = `${state.horizonPitch.toFixed(1)}°`;
    }
  } catch (err) {
    console.error("Draft load failed", err);
  }
}

function exportJson() {
  try {
    const record = buildRecord();
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safePub = slugify(record.pubName || "pub");
    const safeSeat = slugify(record.seatName || "seat");
    a.href = url;
    a.download = `${safePub}-${safeSeat}-calibration.json`;
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
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatClock(dateObj) {
  return dateObj.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}
