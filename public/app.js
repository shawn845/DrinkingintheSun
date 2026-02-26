/* Drinking in the Sun — Map + SunCalc demo (Nottingham) */

const MONTHS = [
  { key: 'Apr', monthIndex: 3 },
  { key: 'May', monthIndex: 4 },
  { key: 'Jun', monthIndex: 5 },
  { key: 'Jul', monthIndex: 6 },
  { key: 'Aug', monthIndex: 7 },
  { key: 'Sep', monthIndex: 8 },
];

const PUBS = [
  {
    id: 'trip',
    name: 'Ye Olde Trip to Jerusalem',
    area: 'Castle / Standard Hill',
    lat: 52.948661,
    lng: -1.151981,
    notes: 'Coords source: Atlas Obscura.',
    spots: [
      // PLACEHOLDERS — calibrate by observation
      { name: 'Front benches', bearingMin: 150, bearingMax: 240, minElevation: 10 },
      { name: 'Cave entrance area', bearingMin: 180, bearingMax: 260, minElevation: 15 },
    ]
  },
  {
    id: 'canalhouse',
    name: 'The Canalhouse',
    area: 'Canal Street / Station',
    lat: 52.948170,
    lng: -1.148400,
    notes: 'Coords source: Wikimedia Commons (OSM-based).',
    spots: [
      { name: 'Waterside seating', bearingMin: 170, bearingMax: 280, minElevation: 8 },
      { name: 'Courtyard tables', bearingMin: 130, bearingMax: 220, minElevation: 12 },
    ]
  },
  {
    id: 'maltcross',
    name: 'Malt Cross',
    area: 'St James’ Street',
    lat: 52.952950,
    lng: -1.152410,
    notes: 'Coords source: Wikimedia Commons (OSM-based).',
    spots: [
      { name: 'Front (street) side', bearingMin: 120, bearingMax: 200, minElevation: 12 },
    ]
  },
  {
    id: 'bell',
    name: 'The Bell Inn',
    area: 'Old Market Square',
    lat: 52.953442,
    lng: -1.1520048,
    notes: 'Coords source: Hirespace.',
    spots: [
      { name: 'Angel Row frontage', bearingMin: 110, bearingMax: 200, minElevation: 10 },
    ]
  },
  {
    id: 'angel',
    name: 'The Angel Microbrewery',
    area: 'Lace Market (Stoney Street)',
    lat: 52.953373,
    lng: -1.143441,
    notes: 'Coords source: Hirespace.',
    spots: [
      { name: 'Rooftop / terrace (if open)', bearingMin: 140, bearingMax: 260, minElevation: 8 },
      { name: 'Front windows', bearingMin: 120, bearingMax: 200, minElevation: 12 },
    ]
  },
];

// ---------- Install prompt (fixes your warning) ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.hidden = false;
});
document.getElementById('installBtn')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  const btn = document.getElementById('installBtn');
  if (btn) btn.hidden = true;
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const btn = document.getElementById('installBtn');
  if (btn) btn.hidden = true;
});

// ---------- Helpers ----------
function pad2(n){ return String(n).padStart(2,'0'); }

function fmtTime(d){
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseTimeToDate(baseDate, hhmm){
  if (!hhmm) return null;
  const [h,m] = hhmm.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

// SunCalc azimuth: radians, 0 = south, negative east, positive west
// Convert to bearing degrees (0..360, where 0 = north, 90 = east)
function azimuthToBearingDeg(azRad){
  const azDeg = azRad * 180 / Math.PI;
  return (azDeg + 180 + 360) % 360;
}
function radToDeg(r){ return r * 180 / Math.PI; }

function withinBearing(bearing, min, max){
  if (min <= max) return bearing >= min && bearing <= max;
  // wrap-around case (e.g. 300..60)
  return bearing >= min || bearing <= max;
}

function spotInSun(pub, spot, dateTime){
  const pos = SunCalc.getPosition(dateTime, pub.lat, pub.lng);
  const bearing = azimuthToBearingDeg(pos.azimuth);
  const elev = radToDeg(pos.altitude);
  const okBearing = withinBearing(bearing, spot.bearingMin, spot.bearingMax);
  const okElev = elev >= (spot.minElevation ?? 0);
  return okBearing && okElev;
}

function computeSunWindows(pub, spot, date){
  const t = SunCalc.getTimes(date, pub.lat, pub.lng);
  const sunrise = t.sunrise;
  const sunset = t.sunset;

  // If polar day/night edge cases (not relevant for Nottingham), guard anyway:
  if (!(sunrise instanceof Date) || !(sunset instanceof Date)) return [];

  // step in minutes
  const stepMin = 5;
  const windows = [];

  let currentStart = null;
  for (let d = new Date(sunrise); d <= sunset; d = new Date(d.getTime() + stepMin*60*1000)) {
    const hit = spotInSun(pub, spot, d);
    if (hit && !currentStart) currentStart = new Date(d);
    if (!hit && currentStart) {
      windows.push({ start: currentStart, end: new Date(d) });
      currentStart = null;
    }
  }
  if (currentStart) windows.push({ start: currentStart, end: new Date(sunset) });

  // Merge tiny gaps (optional)
  return windows;
}

function windowsToText(windows){
  if (!windows.length) return 'No predicted direct sun on this date.';
  return windows.map(w => `${fmtTime(w.start)}–${fmtTime(w.end)}`).join(' • ');
}

// ---------- UI + State ----------
const els = {
  dateInput: document.getElementById('dateInput'),
  timeInput: document.getElementById('timeInput'),
  q: document.getElementById('q'),
  results: document.getElementById('results'),
  monthButtons: document.getElementById('monthButtons'),
  sunMeta: document.getElementById('sunMeta'),
  viewListBtn: document.getElementById('viewListBtn'),
  viewMapBtn: document.getElementById('viewMapBtn'),
  listPanel: document.getElementById('listPanel'),
  mapPanel: document.getElementById('mapPanel'),
};

let selectedMonthIndex = null; // 0-11
let viewMode = 'list'; // 'list' | 'map'

// Cache windows per pub per day
const dayCache = new Map(); // key: `${pubId}|YYYY-MM-DD` -> { times, spotWindows }

function ymd(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function getActiveDate(){
  // If explicit date chosen, use it (local)
  const v = els.dateInput.value;
  if (v) {
    const [Y,M,D] = v.split('-').map(Number);
    return new Date(Y, M-1, D, 12, 0, 0, 0); // midday avoids DST edge weirdness
  }

  // Else if month button chosen, use 15th of that month in current year
  if (typeof selectedMonthIndex === 'number') {
    const now = new Date();
    return new Date(now.getFullYear(), selectedMonthIndex, 15, 12, 0, 0, 0);
  }

  // Else today
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

function updateSunMeta(date){
  // Use city-centre-ish average (first pub) for sunrise/sunset meta
  const ref = PUBS[0];
  const t = SunCalc.getTimes(date, ref.lat, ref.lng);
  els.sunMeta.textContent = `Date: ${ymd(date)} • Sunrise ~ ${fmtTime(t.sunrise)} • Sunset ~ ${fmtTime(t.sunset)}`;
}

function getDayData(pub, date){
  const key = `${pub.id}|${ymd(date)}`;
  if (dayCache.has(key)) return dayCache.get(key);

  const times = SunCalc.getTimes(date, pub.lat, pub.lng);
  const spotWindows = pub.spots.map(spot => ({
    spot,
    windows: computeSunWindows(pub, spot, date),
  }));

  const data = { times, spotWindows };
  dayCache.set(key, data);
  return data;
}

function buildMonths(){
  els.monthButtons.innerHTML = '';
  MONTHS.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = m.key;
    b.addEventListener('click', () => {
      selectedMonthIndex = m.monthIndex;
      // Clear explicit date if using month shortcuts
      els.dateInput.value = '';
      render();
      highlightMonths();
    });
    b.dataset.monthIndex = String(m.monthIndex);
    els.monthButtons.appendChild(b);
  });
  highlightMonths();
}

function highlightMonths(){
  [...els.monthButtons.querySelectorAll('.chip')].forEach(btn => {
    const mi = Number(btn.dataset.monthIndex);
    btn.classList.toggle('isOn', mi === selectedMonthIndex && !els.dateInput.value);
  });
}

function setView(mode){
  viewMode = mode;
  els.viewListBtn.classList.toggle('isOn', mode === 'list');
  els.viewMapBtn.classList.toggle('isOn', mode === 'map');

  // On mobile, hide the other panel for clarity
  if (window.matchMedia('(max-width: 980px)').matches){
    els.listPanel.style.display = (mode === 'list') ? '' : 'none';
    els.mapPanel.style.display  = (mode === 'map')  ? '' : 'none';
  } else {
    els.listPanel.style.display = '';
    els.mapPanel.style.display  = '';
  }
  if (mode === 'map') setTimeout(() => map?.invalidateSize(), 150);
}

// ---------- Map ----------
let map = null;
const markers = new Map(); // pubId -> marker

function initMapOnce(){
  if (map) return;

  map = L.map('map', { zoomControl: true }).setView([52.9525, -1.1500], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  PUBS.forEach(pub => {
    const marker = L.marker([pub.lat, pub.lng]).addTo(map);
    marker.bindPopup(
      `<strong>${escapeHtml(pub.name)}</strong><br>${escapeHtml(pub.area)}<br><a href="https://www.google.com/maps/search/?api=1&query=${pub.lat},${pub.lng}" target="_blank" rel="noopener">Directions</a>`
    );
    markers.set(pub.id, marker);
  });
}

function focusPubOnMap(pubId){
  initMapOnce();
  const pub = PUBS.find(p => p.id === pubId);
  const marker = markers.get(pubId);
  if (!pub || !marker) return;
  map.setView([pub.lat, pub.lng], 16, { animate: true });
  marker.openPopup();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- Render ----------
function render(){
  initMapOnce();

  const date = getActiveDate();
  updateSunMeta(date);

  const query = (els.q.value || '').trim().toLowerCase();
  const timeStr = els.timeInput.value;
  const atTime = parseTimeToDate(date, timeStr);

  const filtered = PUBS.filter(p => {
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query) ||
      p.area.toLowerCase().includes(query)
    );
  });

  els.results.innerHTML = '';

  filtered.forEach(pub => {
    const day = getDayData(pub, date);

    // Determine if ANY spot is in sun at chosen time
    let anySunNow = false;
    if (atTime){
      anySunNow = pub.spots.some(spot => spotInSun(pub, spot, atTime));
    }

    // If time is set, hide pubs with no sun at that time
    if (atTime && !anySunNow) return;

    const card = document.createElement('div');
    card.className = 'card';
    card.addEventListener('click', () => {
      focusPubOnMap(pub.id);
      if (window.matchMedia('(max-width: 980px)').matches) setView('map');
    });

    const head = document.createElement('div');
    head.className = 'cardHead';

    const left = document.createElement('div');
    left.innerHTML = `
      <div class="cardTitle">${escapeHtml(pub.name)}</div>
      <div class="cardArea">${escapeHtml(pub.area)}</div>
    `;

    const right = document.createElement('div');
    if (atTime){
      right.innerHTML = anySunNow ? `<span class="badge sunNow">In sun (likely)</span>` : `<span class="badge">No sun</span>`;
    } else {
      right.innerHTML = `<span class="badge">Tap to view on map</span>`;
    }

    head.appendChild(left);
    head.appendChild(right);
    card.appendChild(head);

    const spotsWrap = document.createElement('div');
    spotsWrap.className = 'spots';

    day.spotWindows.forEach(({ spot, windows }) => {
      if (atTime && !spotInSun(pub, spot, atTime)) return;

      const s = document.createElement('div');
      s.className = 'spot';

      const label = document.createElement('div');
      label.className = 'spotName';
      label.textContent = spot.name;

      const wins = document.createElement('div');
      wins.className = 'spotWindows';
      wins.textContent = windowsToText(windows);

      s.appendChild(label);
      s.appendChild(wins);
      spotsWrap.appendChild(s);
    });

    card.appendChild(spotsWrap);
    els.results.appendChild(card);
  });

  // If list is empty, show hint
  if (!els.results.children.length){
    const empty = document.createElement('div');
    empty.style.padding = '12px';
    empty.style.color = '#8a8a8a';
    empty.textContent = atTime
      ? 'No matches at that time. Clear the time field to see all predicted windows.'
      : 'No matches. Try a different search.';
    els.results.appendChild(empty);
  }
}

// ---------- Events ----------
buildMonths();
initMapOnce();
setView('list');
render();

els.dateInput.addEventListener('change', () => {
  // if user picked a date, turn off month shortcut highlight
  highlightMonths();
  // clear cache only if you want; not required
  render();
});

els.timeInput.addEventListener('change', render);
els.q.addEventListener('input', render);

els.viewListBtn.addEventListener('click', () => setView('list'));
els.viewMapBtn.addEventListener('click', () => setView('map'));

window.addEventListener('resize', () => setView(viewMode));
