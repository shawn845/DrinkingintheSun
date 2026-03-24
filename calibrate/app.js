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
  motionReady: false,
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
  addPointBtn: document.getElementById("addPointBtn"),
  undoPointBtn: document.getElementById("undoPointBtn"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  exportBtn: document.getElementById("exportBtn"),
  video: document.getElementById("video"),
  gpsStatus: document.getElementById("gpsStatus"),
  cameraStatus: document.getElementById("cameraStatus"),
  motionStatus: document.getElementById("motionStatus"),
  headingValue: document.getElementById("headingValue"),
  pitchValue: document.getElementById("pitchValue"),
  pointsCount: document.getElementById("pointsCount"),
  pointsList: document.getElementById("pointsList")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindUI();
  loadDraft();
  render();
}

function bindUI() {
  els.startBtn.addEventListener("click", startCalibration);
  els.addPointBtn.addEventListener("click", addPoint);
  els.undoPointBtn.addEventListener("click", undoPoint);
  els.saveDraftBtn.addEventListener("click", saveDraft);
  els.exportBtn.addEventListener("click", exportJson);

  els.pubName.addEventListener("input", () => {
    state.pubName = els.pubName.value.trim();
  });

  els.seatName.addEventListener("input", () => {
    state.seatName = els.seatName.value.trim();
  });

  els.notes.addEventListener("input", () => {
    state.notes = els.notes.value.trim();
  });
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
    await requestMotion();
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
  els.motionStatus.textContent = "Requesting...";

  const isIOSPermissionFlow =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (isIOSPermissionFlow) {
    const response = await DeviceOrientationEvent.requestPermission();
    if (response !== "granted") {
      throw new Error("Motion/orientation permission was not granted.");
    }
  }

  window.addEventListener("deviceorientation", handleOrientation, true);
  state.motionReady = true;
  els.motionStatus.textContent = "Ready";
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

function addPoint() {
  if (!state.gpsReady || !state.cameraReady || !state.motionReady) {
    alert("Start calibration first.");
    return;
  }

  if (state.headingDeg == null || state.pitchDeg == null) {
    alert("Waiting for motion data. Hold still for a moment and try again.");
    return;
  }

  const sample = {
    headingDeg: round1(state.headingDeg),
    pitchDeg: round1(state.pitchDeg),
    capturedAt: new Date().toISOString()
  };

  state.samples.push(sample);
  render();
}

function undoPoint() {
  state.samples.pop();
  render();
}

function render() {
  els.pointsCount.textContent = String(state.samples.length);

  els.addPointBtn.disabled = !canCapture();
  els.undoPointBtn.disabled = state.samples.length === 0;
  els.saveDraftBtn.disabled = !hasMinimumData();
  els.exportBtn.disabled = !hasMinimumData();

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
      <div class="point-meta">${formatTime(sample.capturedAt)}</div>
    `;
    els.pointsList.appendChild(li);
  });
}

function canCapture() {
  return state.gpsReady && state.cameraReady && state.motionReady;
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
