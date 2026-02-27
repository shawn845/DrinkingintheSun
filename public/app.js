/* Drinking in the Sun — LIVE (next 2 hours)
   Changes implemented:
   1) Install button removed (not present)
   2) One Near me button (requests location)
   3) Only show FIVE “next sunny” pubs (near current location), plus Plan (1 + 2)
   4) Each pub card includes a small map (static OSM image) + Directions/Map buttons
   5) Weather gates “Sunny now”: if weather is bad, it will NOT show Sunny now
   6) Keeps Next Sun location + Next best option (Plan cards #1 and #2)
*/

const NOTTINGHAM_CENTER = { lat: 52.9548, lng: -1.1581 };
const HORIZON_MIN = 120;
const STEP_MIN = 5;
const SWITCH_GAP_MIN = 5;

// Pub list (combined)
const PUBS = [
  {
    id: 'trip',
    name: 'Ye Olde Trip to Jerusalem',
    area: 'Castle / Standard Hill',
    lat: 52.948661, lng: -1.151981,
    spots: [
      { name: 'Front benches', bearingMin: 150, bearingMax: 240, minElevation: 10 },
      { name: 'Cave entrance area', bearingMin: 180, bearingMax: 260, minElevation: 15 }
    ]
  },
  {
    id: 'canalhouse',
    name: 'The Canalhouse',
    area: 'Canal Street / Station',
    lat: 52.948170, lng: -1.148400,
    spots: [
      { name: 'Waterside seating', bearingMin: 170, bearingMax: 280, minElevation: 8 },
      { name: 'Courtyard tables', bearingMin: 130, bearingMax: 220, minElevation: 12 }
    ]
  },
  {
    id: 'maltcross',
    name: 'Malt Cross',
    area: 'St James’ Street',
    lat: 52.952950, lng: -1.152410,
    spots: [
      { name: 'Front (street) side', bearingMin: 120, bearingMax: 200, minElevation: 12 }
    ]
  },
  {
    id: 'bell',
    name: 'The Bell Inn',
    area: 'Old Market Square',
    lat: 52.953442, lng: -1.1520048,
    spots: [
      { name: 'Angel Row frontage', bearingMin: 110, bearingMax: 200, minElevation: 10 }
    ]
  },
  {
    id: 'angel',
    name: 'The Angel Microbrewery',
    area: 'Lace Market (Stoney Street)',
    lat: 52.953373, lng: -1.143441,
    spots: [
      { name: 'Rooftop / terrace (if open)', bearingMin: 140, bearingMax: 260, minElevation: 8 },
      { name: 'Front windows', bearingMin: 120, bearingMax: 200, minElevation: 12 }
    ]
  },
  {
    id: 'bread-and-bitter',
    name: 'Bread & Bitter',
    area: 'Mapperley (NG3 5JL)',
    lat: 52.98389, lng: -1.12296,
    spots: [
      { name: 'Front / pavement tables', bearingMin: 110, bearingMax: 220, minElevation: 12 },
      { name: 'Beer garden', bearingMin: 140, bearingMax: 290, minElevation: 8 }
    ]
  },
  {
    id: 'bunkers-hill',
    name: 'Bunkers Hill',
    area: 'Hockley (NG1 1FP)',
    lat: 52.953558, lng: -1.140387,
    spots: [
      { name: 'Corner / outside benches', bearingMin: 120, bearingMax: 260, minElevation: 10 }
    ]
  },
  {
    id: 'barrel-drop',
    name: 'The Barrel Drop',
    area: 'City Centre (NG1 6JD)',
    lat: 52.954355, lng: -1.152503,
    spots: [
      { name: 'Front / pavement tables', bearingMin: 120, bearingMax: 230, minElevation: 12 }
    ]
  },
  {
    id: 'organ-grinder',
    name: 'The Organ Grinder',
    area: 'Canning Circus (NG7 3JE)',
    lat: 52.956499, lng: -1.163208,
    spots: [
      { name: 'Front terrace', bearingMin: 120, bearingMax: 260, minElevation: 10 },
      { name: 'Outside tables', bearingMin: 140, bearingMax: 290, minElevation: 8 }
    ]
  },
  {
    id: 'sir-john-borlase-warren',
    name: 'The Sir John Borlase Warren',
    area: 'Canning Circus (NG7 3GD)',
    lat: 52.95584, lng: -1.162804,
    spots: [
      { name: 'Beer garden', bearingMin: 140, bearingMax: 290, minElevation: 8 },
      { name: 'Front benches', bearingMin: 120, bearingMax: 230, minElevation: 12 }
    ]
  },
  {
    id: 'hand-and-heart',
    name: 'The Hand & Heart',
    area: 'Canning Circus / Park (NG1 5BA)',
    lat: 52.955444, lng: -1.160222,
    spots: [
      { name: 'Front terrace', bearingMin: 120, bearingMax: 260, minElevation: 10 },
      { name: 'Side / courtyard', bearingMin: 150, bearingMax: 290, minElevation: 12 }
    ]
  },
  {
    id: 'keans-head',
    name: "Kean’s Head",
    area: 'Lace Market (NG1 1QA)',
    lat: 52.951346, lng: -1.144033,
    spots: [
      { name: 'Front tables', bearingMin: 110, bearingMax: 210, minElevation: 12 },
      { name: 'Side seating', bearingMin: 150, bearingMax: 290, minElevation: 10 }
    ]
  },
  {
    id: 'lincolnshire-poacher',
    name: 'The Lincolnshire Poacher',
    area: 'City Centre (NG1 3FR)',
    lat: 52.962096, lng: -1.15128,
    spots: [
      { name: 'Front windows', bearingMin: 110, bearingMax: 210, minElevation: 12 },
      { name: 'Outside tables', bearingMin: 140, bearingMax: 280, minElevation: 10 }
    ]
  },
  {
    id: 'ned-ludd',
    name: 'The Ned Ludd',
    area: 'City Centre (NG1 6DA)',
    lat: 52.952316, lng: -1.151471,
    spots: [
      { name: 'Front windows', bearingMin: 110, bearingMax: 210, minElevation: 12 },
      { name: 'Outside tables', bearingMin: 140, bearingMax: 280, minElevation: 10 }
    ]
  },
  {
    id: 'joseph-else',
    name: 'The Joseph Else',
    area: 'Old Market Square (NG1 2JS)',
    lat: 52.952901, lng: -1.150254,
    spots: [
      { name: 'Angel Row frontage', bearingMin: 110, bearingMax: 210, minElevation: 12 }
    ]
  },
  {
    id: 'embankment',
    name: 'The Embankment',
    area: 'The Embankment',
    lat: 52.9393944, lng: -1.1388205,
    spots: [
      { name: 'Riverside terrace', bearingMin: 120, bearingMax: 300, minElevation: 6 },
      { name: 'Beer garden', bearingMin: 140, bearingMax: 290, minElevation: 8 }
    ]
  },
  {
    id: 'trent-navigation',
    name: 'Trent Navigation',
    area: 'Trent / Meadow Lane',
    lat: 52.9412, lng: -1.13824,
    spots: [
      { name: 'Riverside seating', bearingMin: 120, bearingMax: 300, minElevation: 6 }
    ]
  },
  {
    id: 'bath-inn',
    name: 'Bath Inn',
    area: 'Sneinton / Lace Market',
    lat: 52.95539, lng: -1.13773,
    spots: [
      { name: 'Beer garden', bearingMin: 140, bearingMax: 290, minElevation: 8 },
      { name: 'Front tables', bearingMin: 110, bearingMax: 210, minElevation: 12 }
    ]
  },
  {
    id: 'olde-salutation-inn',
    name: 'Ye Olde Salutation Inn',
    area: 'City Centre',
    lat: 52.95112, lng: -1.15167,
    spots: [
      { name: 'Front benches', bearingMin: 120, bearingMax: 220, minElevation: 12 },
      { name: 'Side / courtyard', bearingMin: 150, bearingMax: 290, minElevation: 10 }
    ]
  },
  {
    id: 'pit-and-pendulum',
    name: 'The Pit & Pendulum',
    area: 'Lace Market',
    lat: 52.9534279, lng: -1.14597,
    spots: [
      { name: 'Front / street side', bearingMin: 110, bearingMax: 210, minElevation: 12 },
      { name: 'Outside tables', bearingMin: 140, bearingMax: 280, minElevation: 10 }
    ]
  }
];

// ---------- DOM ----------
const el = {
  nearBtn: document.getElementById('nearBtn'),
  nearBtnText: document.getElementById('nearBtnText'),
  viewToggleBtn: document.getElementById('viewToggleBtn'),
  viewToggleText: document.getElementById('viewToggleText'),
  statusLine: document.getElementById('statusLine'),
  statusHint: document.getElementById('statusHint'),
  listPanel: document.getElementById('listPanel'),
  mapPanel: document.getElementById('mapPanel'),
  plan: document.getElementById('plan'),
  results: document.getElementById('results')
};

// ---------- State ----------
let userLoc = loadUserLoc();               // {lat,lng} or null
let viewMode = loadViewMode() || 'list';   // list | map
let map = null;
const markers = new Map();                // pubId -> marker
let lastRenderToken = 0;

// ---------- Storage ----------
function loadUserLoc(){
  try { return JSON.parse(localStorage.getItem('ditS_userLoc') || 'null'); } catch { return null; }
}
function saveUserLoc(loc){
  localStorage.setItem('ditS_userLoc', JSON.stringify(loc));
}
function loadViewMode(){
  try { return localStorage.getItem('ditS_viewMode'); } catch { return null; }
}
function saveViewMode(v){
  try { localStorage.setItem('ditS_viewMode', v); } catch {}
}

// ---------- Location ----------
function requestLocation(){
  if (!navigator.geolocation) return;
  el.nearBtnText.textContent = 'Locating…';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveUserLoc(userLoc);
      el.nearBtnText.textContent = 'Near me';
      render();
    },
    () => {
      el.nearBtnText.textContent = 'Near me';
      render();
    },
    { enableHighAccuracy:false, timeout:8000, maximumAge:5*60*1000 }
  );
}
el.nearBtn.addEventListener('click', requestLocation);

// ---------- View toggle ----------
function setView(mode){
  viewMode = mode;
  saveViewMode(mode);

  if (mode === 'list') {
    el.mapPanel.style.display = 'none';
    el.listPanel.style.display = '';
    el.viewToggleText.textContent = 'Map';
  } else {
    el.mapPanel.style.display = '';
    el.listPanel.style.display = 'none';
    el.viewToggleText.textContent = 'List';
    initMapOnce();
    setTimeout(() => map?.invalidateSize(), 150);
  }
}
el.viewToggleBtn.addEventListener('click', () => setView(viewMode === 'list' ? 'map' : 'list'));

// ---------- Helpers ----------
function pad2(n){ return String(n).padStart(2,'0'); }
function fmtHM(d){ return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function minsBetween(a,b){ return Math.max(0, Math.round((b - a) / 60000)); }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Distance ----------
function haversineKm(a, b){
  const R = 6371;
  const toRad = (x) => x * Math.PI/180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat/2);
  const s2 = Math.sin(dLng/2);
  const q = s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(q)));
}
function walkMinutesFromKm(km){
  return Math.max(1, Math.round(km / 4.8 * 60)); // ~4.8 km/h
}

// ---------- Sun position ----------
function azimuthToBearingDeg(azRad){
  const azDeg = azRad * 180 / Math.PI;
  return (azDeg + 180 + 360) % 360;
}
function radToDeg(r){ return r * 180 / Math.PI; }
function withinBearing(bearing, min, max){
  if (min <= max) return bearing >= min && bearing <= max;
  return bearing >= min || bearing <= max;
}
function spotInSun(pub, spot, dateTime){
  const pos = SunCalc.getPosition(dateTime, pub.lat, pub.lng);
  const bearing = azimuthToBearingDeg(pos.azimuth);
  const elev = radToDeg(pos.altitude);
  return withinBearing(bearing, spot.bearingMin, spot.bearingMax) && elev >= (spot.minElevation ?? 0);
}
function computeWindows(pub, spot, fromTime, toTime){
  const windows = [];
  let currentStart = null;

  for (let t = new Date(fromTime); t <= toTime; t = new Date(t.getTime() + STEP_MIN*60*1000)) {
    const hit = spotInSun(pub, spot, t);
    if (hit && !currentStart) currentStart = new Date(t);
    if (!hit && currentStart) {
      windows.push({ start: currentStart, end: new Date(t) });
      currentStart = null;
    }
  }
  if (currentStart) windows.push({ start: currentStart, end: new Date(toTime) });

  return windows.filter(w => (w.end - w.start) >= 10*60*1000);
}
function sunStatusForPub(pub, now, horizonStart, horizonEnd){
  const spotInfos = pub.spots.map(spot => ({ spot, windows: computeWindows(pub, spot, horizonStart, horizonEnd) }));

  const sunnyNow = [];
  for (const si of spotInfos) {
    const w = si.windows.find(w => now >= w.start && now <= w.end);
    if (w) sunnyNow.push({ spot: si.spot, window: w });
  }
  if (sunnyNow.length) {
    sunnyNow.sort((a,b) => b.window.end - a.window.end);
    const best = sunnyNow[0];
    return { kind:'sunny-now', spot: best.spot, start: best.window.start, end: best.window.end };
  }

  const nexts = [];
  for (const si of spotInfos) {
    const w = si.windows.find(w => w.start > now);
    if (w) nexts.push({ spot: si.spot, window: w });
  }
  if (!nexts.length) return { kind:'no-sun' };

  nexts.sort((a,b) => a.window.start - b.window.start);
  const best = nexts[0];
  return { kind:'next-sun', spot: best.spot, start: best.window.start, end: best.window.end };
}

// ---------- Weather (Open-Meteo) ----------
// Bucket cache by ~1km to reduce calls while still using pub locations
const WEATHER_TTL_MS = 30 * 60 * 1000;
const weatherCache = new Map(); // key -> { t, data }

function weatherKey(lat,lng){
  return `${lat.toFixed(2)},${lng.toFixed(2)}`; // ~1km bucket
}
async function fetchWeather(lat, lng){
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,cloud_cover,precipitation_probability,wind_speed_10m` +
    `&forecast_days=1&timezone=auto&wind_speed_unit=mph`;
  const res = await fetch(url, { cache:'no-store' });
  if (!res.ok) throw new Error('weather fetch failed');
  return res.json();
}
async function getWeather(lat,lng){
  const key = weatherKey(lat,lng);
  const now = Date.now();
  const c = weatherCache.get(key);
  if (c && (now - c.t) < WEATHER_TTL_MS) return c.data;

  const data = await fetchWeather(lat,lng);
  weatherCache.set(key, { t: now, data });
  return data;
}
function nearestHourlyIndex(times, targetDate){
  const target = targetDate.getTime();
  let bestI = 0, bestD = Infinity;
  for (let i=0;i<times.length;i++){
    const t = new Date(times[i]).getTime();
    const d = Math.abs(t - target);
    if (d < bestD){ bestD=d; bestI=i; }
  }
  return bestI;
}
function weatherLikelihood(cloud, rainProb){
  // Use this to gate “Sunny now”
  if (rainProb >= 50 || cloud >= 80) return 'bad';
  if (cloud >= 50) return 'mixed';
  return 'good';
}
function formatWeatherShort(w, i){
  const temp = w.hourly.temperature_2m[i];
  const cloud = w.hourly.cloud_cover[i];
  const rain = w.hourly.precipitation_probability[i];
  const wind = w.hourly.wind_speed_10m[i];
  const like = weatherLikelihood(cloud, rain);
  const icon = like === 'good' ? '☀️' : like === 'mixed' ? '⛅' : '☁️';
  const label = like === 'good' ? 'Likely sun' : like === 'mixed' ? 'Mixed' : 'Sun unlikely';
  return `${icon} ${label} • ${Math.round(temp)}°C • Cloud ${Math.round(cloud)}% • Rain ${Math.round(rain)}% • Wind ${Math.round(wind)} mph`;
}

// Concurrency helper
async function runWithConcurrency(items, limit, fn){
  const out = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length){
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- Map ----------
function initMapOnce(){
  if (map) return;
  if (!window.L) return;

  map = L.map('map', { zoomControl:true }).setView([NOTTINGHAM_CENTER.lat, NOTTINGHAM_CENTER.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  PUBS.forEach(pub => {
    const m = L.marker([pub.lat, pub.lng]).addTo(map);
    markers.set(pub.id, m);
  });
}
function makeDivIcon(cls, txt){
  return L.divIcon({
    className: '',
    html: `<div class="pin ${cls}">${txt}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -26]
  });
}
function setMapHighlights(best1Id, best2Id){
  if (!map) return;
  for (const m of markers.values()) m.setIcon(new L.Icon.Default());
  if (best1Id && markers.get(best1Id)) markers.get(best1Id).setIcon(makeDivIcon('one','1'));
  if (best2Id && markers.get(best2Id)) markers.get(best2Id).setIcon(makeDivIcon('two','2'));
}
function openPubOnMap(pub){
  initMapOnce();
  const m = markers.get(pub.id);
  if (!m) return;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pub.lat + ',' + pub.lng)}`;
  m.bindPopup(`<strong>${escapeHtml(pub.name)}</strong><br>${escapeHtml(pub.area||'')}<br><a href="${gmaps}" target="_blank" rel="noopener">Directions</a>`);
  map.setView([pub.lat, pub.lng], 16, { animate:true });
  m.openPopup();
}

// ---------- Static map thumbnail (no key) ----------
function staticMapUrl(lat,lng){
  const center = `${lat},${lng}`;
  // staticmap.openstreetmap.de: simple, no API key
  // size is in px, keep small for mobile
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(center)}&zoom=16&size=640x280&markers=${encodeURIComponent(center)},red-pushpin`;
}

// ---------- Planner logic ----------
function pickBest(rows, now){
  // prefer sunny-now, else next-sun. weather must not be "bad" for sunny-now label
  const candidates = rows.filter(r => r.effective.kind !== 'no-sun');
  if (!candidates.length) return null;

  candidates.sort((a,b) => {
    const ra = a.effective.kind === 'sunny-now' ? 0 : 1;
    const rb = b.effective.kind === 'sunny-now' ? 0 : 1;
    if (ra !== rb) return ra - rb;

    const ta = a.effective.kind === 'next-sun' ? (a.effective.start - now) : 0;
    const tb = b.effective.kind === 'next-sun' ? (b.effective.start - now) : 0;
    if (ta !== tb) return ta - tb;

    return a.walkMin - b.walkMin;
  });

  return candidates[0];
}

function pickNextAfter(rows, pivotTime, excludeId, horizonStart, horizonEnd, baseLoc){
  const t = new Date(pivotTime.getTime() + SWITCH_GAP_MIN*60*1000);
  if (t > horizonEnd) return null;

  const candidates = rows
    .filter(r => r.pub.id !== excludeId)
    .map(r => {
      const sun = sunStatusForPub(r.pub, t, horizonStart, horizonEnd);
      return { ...r, pivotNow: t, pivotSun: sun };
    })
    .filter(r => r.pivotSun.kind !== 'no-sun');

  if (!candidates.length) return null;

  candidates.sort((a,b) => {
    const sa = a.pivotSun.kind === 'sunny-now' ? 0 : 1;
    const sb = b.pivotSun.kind === 'sunny-now' ? 0 : 1;
    if (sa !== sb) return sa - sb;

    const ta = a.pivotSun.kind === 'next-sun' ? (a.pivotSun.start - t) : 0;
    const tb = b.pivotSun.kind === 'next-sun' ? (b.pivotSun.start - t) : 0;
    if (ta !== tb) return ta - tb;

    // re-evaluate distance (baseLoc is same)
    return a.walkMin - b.walkMin;
  });

  // Convert pivotSun into effective using the same pub's weather at that time (best-effort)
  // We'll keep it as is; weather gating will be applied in render.
  return candidates[0];
}

function directionsUrl(pub){
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pub.lat + ',' + pub.lng)}`;
}

// ---------- Render ----------
async function render(){
  const token = ++lastRenderToken;

  const now = new Date();
  const horizonStart = now;
  const horizonEnd = new Date(now.getTime() + HORIZON_MIN*60*1000);
  const baseLoc = userLoc || NOTTINGHAM_CENTER;

  el.statusLine.textContent = userLoc ? 'Using your location' : 'Tap Near me for walking times.';
  el.statusHint.textContent = `Updated ${fmtHM(now)} • Horizon: next ${HORIZON_MIN} min`;

  // Compute sun + distances first
  let rows = PUBS.map(pub => {
    const distKm = haversineKm(baseLoc, { lat: pub.lat, lng: pub.lng });
    const walkMin = walkMinutesFromKm(distKm);
    const sun = sunStatusForPub(pub, now, horizonStart, horizonEnd);
    return { pub, distKm, walkMin, sun, effective: { ...sun }, weatherNow: null, weatherAtStart: null };
  });

  // Weather: fetch by bucket, then apply to each pub time we care about (now and next-sun start)
  // We only need weather to gate labels and ranking; use pub’s own bucket.
  // Fetch buckets for all pubs (few calls due to toFixed(2))
  const bucketSet = new Map(); // key -> {lat,lng}
  for (const r of rows){
    const k = weatherKey(r.pub.lat, r.pub.lng);
    if (!bucketSet.has(k)) bucketSet.set(k, { lat: r.pub.lat, lng: r.pub.lng });
  }
  const buckets = [...bucketSet.values()];

  // Fetch with concurrency
  const bucketData = await runWithConcurrency(buckets, 4, async (b) => {
    try { return { key: weatherKey(b.lat,b.lng), data: await getWeather(b.lat,b.lng) }; }
    catch { return { key: weatherKey(b.lat,b.lng), data: null }; }
  });

  if (token !== lastRenderToken) return;

  const byKey = new Map(bucketData.map(x => [x.key, x.data]));

  function weatherInfoFor(pub, time){
    const data = byKey.get(weatherKey(pub.lat,pub.lng));
    if (!data) return null;
    const i = nearestHourlyIndex(data.hourly.time, time);
    const cloud = data.hourly.cloud_cover[i];
    const rain = data.hourly.precipitation_probability[i];
    const like = weatherLikelihood(cloud, rain);
    return { data, i, like, cloud, rain };
  }

  // Apply weather gating to effective status:
  // - If sun says sunny-now but weather is "bad", downgrade to "bad-now" (NOT sunny)
  // - If next-sun but weather at start is "bad", keep next-sun but mark as "bad-next" for display and ranking
  rows = rows.map(r => {
    const wNow = weatherInfoFor(r.pub, now);
    r.weatherNow = wNow;

    let effective = { ...r.sun };
    if (r.sun.kind === 'sunny-now') {
      if (wNow && wNow.like === 'bad') {
        // Not allowed to show “Sunny now” when weather is bad
        effective = { kind:'bad-now', spot: r.sun.spot, start: r.sun.start, end: r.sun.end };
      }
    }
    if (r.sun.kind === 'next-sun') {
      const wStart = weatherInfoFor(r.pub, r.sun.start);
      r.weatherAtStart = wStart;
      if (wStart && wStart.like === 'bad') {
        effective = { kind:'bad-next', spot: r.sun.spot, start: r.sun.start, end: r.sun.end };
      }
    }
    r.effective = effective;
    return r;
  });

  // Sort (only for selecting best and list):
  // sunny-now (good weather) -> next-sun (good/mixed) -> bad-next -> bad-now -> no-sun
  function rankKind(k){
    if (k === 'sunny-now') return 0;
    if (k === 'next-sun') return 1;
    if (k === 'bad-next') return 2;
    if (k === 'bad-now') return 3;
    return 9;
  }
  rows.sort((a,b) => {
    const ra = rankKind(a.effective.kind);
    const rb = rankKind(b.effective.kind);
    if (ra !== rb) return ra - rb;

    const ta = (a.effective.kind === 'next-sun' || a.effective.kind === 'bad-next') ? (a.effective.start - now) : 0;
    const tb = (b.effective.kind === 'next-sun' || b.effective.kind === 'bad-next') ? (b.effective.start - now) : 0;
    if (ta !== tb) return ta - tb;

    return a.walkMin - b.walkMin;
  });

  const best1 = pickBest(rows, now);
  const pivot = best1
    ? (best1.effective.kind === 'sunny-now' || best1.effective.kind === 'bad-now')
      ? best1.effective.end
      : best1.effective.start
    : null;

  const best2Raw = (best1 && pivot)
    ? pickNextAfter(rows, pivot, best1.pub.id, horizonStart, horizonEnd, baseLoc)
    : null;

  // Convert best2Raw pivotSun to effective using weather at pivot time (same gating)
  let best2 = null;
  if (best2Raw) {
    const t2 = best2Raw.pivotNow;
    const sun2 = best2Raw.pivotSun;
    let eff2 = { ...sun2 };
    const w2Now = weatherInfoFor(best2Raw.pub, t2);
    if (sun2.kind === 'sunny-now' && w2Now && w2Now.like === 'bad') {
      eff2 = { kind:'bad-now', spot: sun2.spot, start: sun2.start, end: sun2.end };
    }
    if (sun2.kind === 'next-sun') {
      const w2Start = weatherInfoFor(best2Raw.pub, sun2.start);
      if (w2Start && w2Start.like === 'bad') eff2 = { kind:'bad-next', spot: sun2.spot, start: sun2.start, end: sun2.end };
    }
    best2 = { ...best2Raw, effective: eff2, sun: sun2 };
  }

  // Update map highlight if map exists
  if (map) setMapHighlights(best1?.pub?.id || null, best2?.pub?.id || null);

  // --- Render Plan ---
  el.plan.innerHTML = `<div class="planHeader">Suggested plan</div>`;

  if (!best1) {
    el.plan.insertAdjacentHTML('beforeend', `
      <div class="bigCard bad">
        <div class="bigTop">
          <div>
            <div class="bigTitle">No likely sun found</div>
            <div class="bigSub">Within the next ${HORIZON_MIN} minutes.</div>
          </div>
          <div class="pill bad">—</div>
        </div>
        <div class="bigBody">
          <div class="mini">Try again later, or adjust spot bearings after real observations.</div>
        </div>
      </div>
    `);
  } else {
    el.plan.appendChild(buildPlanCard(best1, 1, now));
    if (best2) {
      el.plan.appendChild(buildPlanCard(best2, 2, now, best1));
    } else {
      el.plan.insertAdjacentHTML('beforeend', `
        <div class="bigCard next">
          <div class="bigTop">
            <div>
              <div class="bigTitle">2. Next best</div>
              <div class="bigSub">No better switch found within the next ${HORIZON_MIN} minutes.</div>
            </div>
            <div class="pill next">—</div>
          </div>
        </div>
      `);
    }
  }

  // --- Render “Next sunny nearby” list (ONLY FIVE) ---
  const exclude = new Set([best1?.pub?.id, best2?.pub?.id].filter(Boolean));
  const candidates = rows.filter(r => !exclude.has(r.pub.id));

  // Only show items that have some sun-related status (including bad-next/bad-now if you want),
  // but to match “next sunny pubs”, we filter out “no-sun”, and also filter out “bad-now” (not sunny).
  const list = candidates
    .filter(r => r.effective.kind !== 'no-sun')
    .filter(r => r.effective.kind !== 'bad-now') // not sunny now due to weather
    .slice(0, 5);

  el.results.innerHTML = '';
  if (!list.length) {
    el.results.innerHTML = `<div class="mini">No likely sun options found nearby in the next ${HORIZON_MIN} minutes.</div>`;
  } else {
    list.forEach(r => el.results.appendChild(buildListCard(r, now)));
  }
}

function buildPlanCard(row, number, now, prevRow = null){
  const { pub, walkMin, effective, weatherNow, weatherAtStart } = row;

  // Label + styling
  let cardClass = 'bigCard';
  let pillClass = 'bad';
  let pillText = '—';

  let headline = number === 1 ? '1. Sunny now' : '2. Next best';
  let timeLine = '';
  let rightLine = '';
  let weatherLine = 'Weather: unavailable';
  let spotLine = effective.spot?.name ? `Spot: ${effective.spot.name}` : 'Spot: —';

  if (effective.kind === 'sunny-now') {
    cardClass += ' sun';
    pillClass = 'sun';
    pillText = 'Sunny now';
    headline = number === 1 ? '1. Sunny now' : `2. Sunny`;
    timeLine = `${fmtHM(now)}–${fmtHM(effective.end)}`;
    rightLine = `Shade in ${minsBetween(now, effective.end)} min`;
    if (weatherNow?.data) weatherLine = `Weather: ${formatWeatherShort(weatherNow.data, weatherNow.i)}`;
  } else if (effective.kind === 'next-sun') {
    cardClass += ' next';
    pillClass = 'next';
    pillText = 'Next sun';
    headline = number === 1 ? '1. Next sun' : '2. Next best';
    timeLine = `${fmtHM(effective.start)}–${fmtHM(effective.end)}`;
    rightLine = `Starts in ${minsBetween(now, effective.start)} min`;
    if (weatherAtStart?.data) weatherLine = `Weather: ${formatWeatherShort(weatherAtStart.data, weatherAtStart.i)}`;
  } else if (effective.kind === 'bad-next') {
    cardClass += ' next';
    pillClass = 'bad';
    pillText = 'Cloudy';
    headline = number === 1 ? '1. Next sun (weather poor)' : '2. Next best (weather poor)';
    timeLine = `${fmtHM(effective.start)}–${fmtHM(effective.end)}`;
    rightLine = `Starts in ${minsBetween(now, effective.start)} min`;
    const wi = row.weatherAtStart;
    if (wi?.data) weatherLine = `Weather: ${formatWeatherShort(wi.data, wi.i)}`;
  } else if (effective.kind === 'bad-now') {
    cardClass += ' bad';
    pillClass = 'bad';
    pillText = 'Cloudy';
    headline = number === 1 ? '1. Not sunny now' : '2. Not sunny';
    timeLine = `${fmtHM(now)}–${fmtHM(effective.end)}`;
    rightLine = `Sun angle OK, weather poor`;
    const wi = row.weatherNow;
    if (wi?.data) weatherLine = `Weather: ${formatWeatherShort(wi.data, wi.i)}`;
  } else {
    cardClass += ' bad';
    pillClass = 'bad';
    pillText = '—';
    headline = number === 1 ? '1. No sun' : '2. No sun';
    timeLine = `Next ${HORIZON_MIN} min`;
    rightLine = `No direct sun predicted`;
  }

  // Leave time hint for card #2 when it’s a real next-sun (or bad-next)
  let leaveHint = '';
  if (prevRow && number === 2 && (effective.kind === 'next-sun' || effective.kind === 'bad-next')) {
    const leave = new Date(effective.start.getTime() - (walkMin + 2) * 60 * 1000);
    leaveHint = `Leave ~ ${fmtHM(leave)} to arrive for the start.`;
  }

  const card = document.createElement('div');
  card.className = cardClass;
  card.innerHTML = `
    <div class="bigTop">
      <div>
        <div class="bigTitle">${escapeHtml(headline)}</div>
        <div class="bigSub"><strong>${escapeHtml(pub.name)}</strong> • ${walkMin} min walk • ${escapeHtml(pub.area || '')}</div>
      </div>
      <div class="pill ${pillClass}">${escapeHtml(pillText)}</div>
    </div>

    <div class="bigBody">
      <div class="rowLine"><span><strong>${escapeHtml(timeLine)}</strong></span><span>${escapeHtml(rightLine)}</span></div>
      <div class="mini">${escapeHtml(spotLine)}</div>
      <div class="mini">${escapeHtml(weatherLine)}</div>
      ${leaveHint ? `<div class="mini">${escapeHtml(leaveHint)}</div>` : ``}

      <div class="actions">
        <button class="actionBtn primary" type="button" data-act="directions">Directions</button>
        <button class="actionBtn" type="button" data-act="map">Map</button>
      </div>
    </div>
  `;

  card.querySelector('[data-act="directions"]').addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(directionsUrl(pub), '_blank', 'noopener');
  });

  card.querySelector('[data-act="map"]').addEventListener('click', (e) => {
    e.stopPropagation();
    setView('map');
    initMapOnce();
    if (map) setMapHighlights(number === 1 ? pub.id : null, number === 2 ? pub.id : null);
    openPubOnMap(pub);
  });

  // Tap card: directions (simple mobile behaviour)
  card.addEventListener('click', () => window.open(directionsUrl(pub), '_blank', 'noopener'));

  return card;
}

function buildListCard(row, now){
  const { pub, walkMin, effective } = row;

  let badgeClass = 'bad';
  let badgeText = '—';
  let line1 = '';
  let line2 = effective.spot?.name ? `Spot: ${effective.spot.name}` : '';

  if (effective.kind === 'sunny-now') {
    badgeClass = 'sun';
    badgeText = 'Sunny now';
    line1 = `Sun for ${minsBetween(now, effective.end)} min`;
  } else if (effective.kind === 'next-sun') {
    badgeClass = 'next';
    badgeText = 'Next sun';
    line1 = `Starts in ${minsBetween(now, effective.start)} min`;
  } else if (effective.kind === 'bad-next') {
    badgeClass = 'bad';
    badgeText = 'Cloudy';
    line1 = `Sun angle soon, but weather poor`;
  } else {
    badgeClass = 'bad';
    badgeText = '—';
    line1 = `No direct sun predicted`;
  }

  const card = document.createElement('div');
  card.className = 'card';

  const thumbUrl = staticMapUrl(pub.lat, pub.lng);

  card.innerHTML = `
    <div class="cardTop">
      <div>
        <div class="cardTitle">${escapeHtml(pub.name)}</div>
        <div class="cardSub">${escapeHtml(pub.area || '')} • ${walkMin} min walk</div>
      </div>
      <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
    </div>

    <div class="cardBody">
      <div class="rowLine"><span>${escapeHtml(line1)}</span></div>
      ${line2 ? `<div class="mini">${escapeHtml(line2)}</div>` : ``}

      <div class="thumb">
        <img src="${thumbUrl}" alt="Map preview for ${escapeHtml(pub.name)}" loading="lazy" />
      </div>

      <div class="cardActions">
        <button class="smallBtn" type="button" data-act="directions">Directions</button>
        <button class="smallBtn" type="button" data-act="map">Map</button>
      </div>
    </div>
  `;

  card.querySelector('[data-act="directions"]').addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(directionsUrl(pub), '_blank', 'noopener');
  });

  card.querySelector('[data-act="map"]').addEventListener('click', (e) => {
    e.stopPropagation();
    setView('map');
    initMapOnce();
    openPubOnMap(pub);
  });

  // Tap card = directions (simple)
  card.addEventListener('click', () => window.open(directionsUrl(pub), '_blank', 'noopener'));

  return card;
}

// ---------- Boot ----------
function boot(){
  // Default view
  setView(viewMode);

  // Button label
  el.nearBtnText.textContent = 'Near me';

  // If we already have a stored location, show status accordingly
  if (userLoc) {
    el.statusLine.textContent = 'Using your location';
  }

  render();

  // Live refresh (recompute) every minute
  setInterval(() => render(), 60 * 1000);
}

boot();
