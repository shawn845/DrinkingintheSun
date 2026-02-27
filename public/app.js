/* Drinking in the Sun — LIVE (next 2 hours)
   - Mobile-first “Near me” list + optional map
   - Shows:
     1) Best sunny-now (or soonest next sun) nearby
     2) Next best move when the first goes into shade
   - Weather: Open-Meteo hourly using pub lat/lng (cached)
*/

const NOTTINGHAM_CENTER = { lat: 52.9548, lng: -1.1581 };
const HORIZON_MIN = 120;     // evaluate only within next 2 hours
const STEP_MIN = 5;          // sun calc step (minutes)
const SWITCH_GAP_MIN = 5;    // look for next spot shortly after shade

// Combined pubs (5 demo + your coords)
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

// ---------- Install prompt ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBtn').hidden = false;
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch {}
  deferredPrompt = null;
  document.getElementById('installBtn').hidden = true;
});

// ---------- DOM ----------
const el = {
  locBtn: document.getElementById('locBtn'),
  locBtnText: document.getElementById('locBtnText'),
  whereLine: document.getElementById('whereLine'),
  timeLine: document.getElementById('timeLine'),
  plan: document.getElementById('plan'),
  results: document.getElementById('results'),
  listPanel: document.getElementById('listPanel'),
  mapPanel: document.getElementById('mapPanel'),
  viewList: document.getElementById('viewList'),
  viewMap: document.getElementById('viewMap')
};

// ---------- State ----------
let userLoc = loadUserLoc();
let viewMode = loadViewMode() || 'list';

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

  el.locBtnText.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveUserLoc(userLoc);
      el.locBtnText.textContent = 'Near me';
      render(true);
    },
    () => {
      el.locBtnText.textContent = 'Near me';
      render(false);
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
  );
}

el.locBtn.addEventListener('click', requestLocation);

// ---------- View ----------
function setView(mode){
  viewMode = mode;
  saveViewMode(mode);

  el.viewList.classList.toggle('isOn', mode === 'list');
  el.viewMap.classList.toggle('isOn', mode === 'map');

  if (mode === 'list') {
    el.mapPanel.style.display = 'none';
    el.listPanel.style.display = '';
  } else {
    el.mapPanel.style.display = '';
    el.listPanel.style.display = 'none';
    initMapOnce();
    setTimeout(() => map?.invalidateSize(), 150);
  }
}

el.viewList.addEventListener('click', () => setView('list'));
el.viewMap.addEventListener('click', () => setView('map'));

// ---------- Sun helpers ----------
function pad2(n){ return String(n).padStart(2,'0'); }
function fmtHM(d){ return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function minsBetween(a,b){ return Math.max(0, Math.round((b - a)/60000)); }

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

  // drop tiny windows (<10m)
  return windows.filter(w => (w.end - w.start) >= 10*60*1000);
}

function statusForPub(pub, now, horizonStart, horizonEnd){
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
  return Math.max(1, Math.round(km / 4.8 * 60));
}

// ---------- Weather (Open-Meteo) ----------
const WEATHER_TTL_MS = 30 * 60 * 1000;
const weatherCache = new Map(); // key -> { t, data }

function weatherKey(lat,lng){ return `${lat.toFixed(3)},${lng.toFixed(3)}`; }

async function fetchWeather(lat, lng){
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,cloud_cover,precipitation_probability,wind_speed_10m` +
    `&forecast_days=2&timezone=auto&wind_speed_unit=mph`;
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

function weatherBadgeFrom(cloud, rainProb){
  if (rainProb >= 50 || cloud >= 80) return { icon:'☁️', label:'Sun unlikely' };
  if (cloud >= 50) return { icon:'⛅', label:'Mixed' };
  return { icon:'☀️', label:'Likely sun' };
}

function formatWeatherShort(w, i){
  const temp = w.hourly.temperature_2m[i];
  const cloud = w.hourly.cloud_cover[i];
  const rain = w.hourly.precipitation_probability[i];
  const wind = w.hourly.wind_speed_10m[i];
  const b = weatherBadgeFrom(cloud, rain);
  return `${b.icon} ${b.label} • ${Math.round(temp)}°C • Cloud ${Math.round(cloud)}% • Rain ${Math.round(rain)}% • Wind ${Math.round(wind)} mph`;
}

// ---------- Map ----------
let map = null;
const markers = new Map();

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
  m.bindPopup(`<strong>${escapeHtml(pub.name)}</strong><br>${escapeHtml(pub.area || '')}<br><a href="${gmaps}" target="_blank" rel="noopener">Directions</a>`);
  map.setView([pub.lat, pub.lng], 16, { animate:true });
  m.openPopup();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- Planner ----------
function pickBestNow(rows){
  // prefer sunny-now, else earliest next-sun, tie by distance
  const candidates = rows.filter(r => r.status.kind === 'sunny-now' || r.status.kind === 'next-sun');
  if (!candidates.length) return null;

  candidates.sort((a,b) => {
    const ra = (a.status.kind === 'sunny-now') ? 0 : 1;
    const rb = (b.status.kind === 'sunny-now') ? 0 : 1;
    if (ra !== rb) return ra - rb;

    const ta = (a.status.kind === 'next-sun') ? (a.status.start - a.now) : 0;
    const tb = (b.status.kind === 'next-sun') ? (b.status.start - b.now) : 0;
    if (ta !== tb) return ta - tb;

    return (a.walkMin ?? 9999) - (b.walkMin ?? 9999);
  });

  return candidates[0];
}

function pickNextSwitch(rows, pivotTime, excludeId, horizonStart, horizonEnd){
  const t = new Date(pivotTime.getTime() + SWITCH_GAP_MIN*60*1000);
  if (t > horizonEnd) return null;

  const candidates = rows
    .filter(r => r.pub.id !== excludeId)
    .map(r => {
      const s = statusForPub(r.pub, t, horizonStart, horizonEnd);
      if (s.kind === 'sunny-now' || s.kind === 'next-sun') {
        const start = (s.kind === 'sunny-now') ? t : s.start;
        return { ...r, status: { ...s, start }, now: t };
      }
      return null;
    })
    .filter(Boolean);

  if (!candidates.length) return null;

  candidates.sort((a,b) => {
    const ta = a.status.start - t;
    const tb = b.status.start - t;
    if (ta !== tb) return ta - tb;
    return (a.walkMin ?? 9999) - (b.walkMin ?? 9999);
  });

  return candidates[0];
}

function fmtDistance(row){
  if (row.walkMin == null) return '';
  return `${row.walkMin} min walk`;
}

function openDirections(pub){
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pub.lat + ',' + pub.lng)}`;
  window.open(url, '_blank', 'noopener');
}

// ---------- Render ----------
let lastRenderToken = 0;

async function render(updateMapPins = true){
  const token = ++lastRenderToken;

  const now = new Date();
  const horizonStart = now;
  const horizonEnd = new Date(now.getTime() + HORIZON_MIN*60*1000);

  const baseLoc = userLoc || NOTTINGHAM_CENTER;
  const using = userLoc ? 'Using your location' : 'Using Nottingham centre';
  el.whereLine.textContent = using;
  el.timeLine.textContent = `Updated ${fmtHM(now)} • Looking ${HORIZON_MIN} min ahead`;

  // Compute statuses + distances
  const rows = PUBS.map(pub => {
    const distKm = haversineKm(baseLoc, { lat: pub.lat, lng: pub.lng });
    const walkMin = walkMinutesFromKm(distKm);
    const status = statusForPub(pub, now, horizonStart, horizonEnd);
    return { pub, distKm, walkMin, status, now };
  });

  // Sort: sunny-now first, then next-sun soonest, then distance
  rows.sort((a,b) => {
    const ra = a.status.kind === 'sunny-now' ? 0 : a.status.kind === 'next-sun' ? 1 : 2;
    const rb = b.status.kind === 'sunny-now' ? 0 : b.status.kind === 'next-sun' ? 1 : 2;
    if (ra !== rb) return ra - rb;

    const ta = a.status.kind === 'next-sun' ? (a.status.start - now) : 0;
    const tb = b.status.kind === 'next-sun' ? (b.status.start - now) : 0;
    if (ta !== tb) return ta - tb;

    return a.walkMin - b.walkMin;
  });

  const best1 = pickBestNow(rows);
  const best2 = best1
    ? pickNextSwitch(rows, (best1.status.kind === 'sunny-now' ? best1.status.end : best1.status.start), best1.pub.id, horizonStart, horizonEnd)
    : null;

  // Update map pins
  if (updateMapPins && map) setMapHighlights(best1?.pub?.id, best2?.pub?.id);

  // Build plan UI (two big cards)
  el.plan.innerHTML = '';
  el.plan.insertAdjacentHTML('beforeend', `<div class="planHeader">Suggested plan</div>`);

  if (!best1) {
    el.plan.insertAdjacentHTML('beforeend', `
      <div class="bigCard">
        <div class="bigTop">
          <div>
            <div class="bigTitle">No direct sun predicted</div>
            <div class="bigSub">Within the next ${HORIZON_MIN} minutes (based on current spot settings).</div>
          </div>
          <div class="pill shade">Shade</div>
        </div>
        <div class="bigBody">
          <div class="mini">Try again later or adjust spot bearings once you’ve observed where the sun actually hits.</div>
        </div>
      </div>
    `);
  } else {
    const c1 = await buildBigCard(best1, best1.status.kind === 'sunny-now' ? 'sun' : 'next', 1, token);
    if (token !== lastRenderToken) return;
    el.plan.appendChild(c1);

    if (best2) {
      const c2 = await buildBigCard(best2, 'next', 2, token, best1);
      if (token !== lastRenderToken) return;
      el.plan.appendChild(c2);
    } else {
      el.plan.insertAdjacentHTML('beforeend', `
        <div class="bigCard next">
          <div class="bigTop">
            <div>
              <div class="bigTitle">Next sun</div>
              <div class="bigSub">No better switch found within the next ${HORIZON_MIN} minutes.</div>
            </div>
            <div class="pill next">—</div>
          </div>
        </div>
      `);
    }

    // map highlight even if map not visible yet
    if (updateMapPins && map) setMapHighlights(best1.pub.id, best2?.pub?.id || null);
  }

  // Build “More nearby” list (exclude the two plan pubs, keep top 8)
  const exclude = new Set([best1?.pub?.id, best2?.pub?.id].filter(Boolean));
  const more = rows.filter(r => !exclude.has(r.pub.id)).slice(0, 8);

  el.results.innerHTML = '';
  more.forEach(r => {
    const badge = r.status.kind === 'sunny-now'
      ? `<span class="badge sun">Sunny now</span>`
      : r.status.kind === 'next-sun'
        ? `<span class="badge next">Next sun</span>`
        : `<span class="badge none">No sun</span>`;

    const line1 = r.status.kind === 'sunny-now'
      ? `Sun for ${minsBetween(now, r.status.end)} min`
      : r.status.kind === 'next-sun'
        ? `Starts in ${minsBetween(now, r.status.start)} min`
        : `No sun in next ${HORIZON_MIN} min`;

    const line2 = r.status.spot?.name ? `Spot: ${r.status.spot.name}` : '';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="cardTop">
        <div>
          <div class="cardTitle">${escapeHtml(r.pub.name)}</div>
          <div class="cardSub">${escapeHtml(r.pub.area || '')} • ${fmtDistance(r)}</div>
        </div>
        ${badge}
      </div>
      <div class="cardBody">
        <div class="rowLine"><span>${escapeHtml(line1)}</span></div>
        ${line2 ? `<div class="mini">${escapeHtml(line2)}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => {
      if (viewMode === 'map') openPubOnMap(r.pub);
      else openDirections(r.pub);
    });
    el.results.appendChild(card);
  });
}

async function buildBigCard(row, variant, number, token, prevRow = null){
  const now = new Date();
  const { pub, status } = row;

  let pillClass = 'shade';
  let pillText = 'Shade';
  let headline = number === 1 ? 'Sunny now' : 'Next sun';
  let timeLine = '';
  let countdown = '';
  let spotLine = status.spot?.name ? `Spot: ${status.spot.name}` : 'Spot: —';
  let weatherAt = now;

  if (status.kind === 'sunny-now') {
    pillClass = 'sun';
    pillText = 'Sunny now';
    headline = number === 1 ? 'Sunny now' : 'Sunny';
    const rem = minsBetween(now, status.end);
    timeLine = `${fmtHM(now)}–${fmtHM(status.end)}`;
    countdown = `Shade in ${rem} min`;
    weatherAt = now;
  } else if (status.kind === 'next-sun') {
    pillClass = 'next';
    pillText = 'Next sun';
    headline = number === 1 ? 'Next sun' : 'Next sun';
    const inMin = minsBetween(now, status.start);
    const dur = minsBetween(status.start, status.end);
    timeLine = `${fmtHM(status.start)}–${fmtHM(status.end)}`;
    countdown = `Starts in ${inMin} min • lasts ~${dur} min`;
    weatherAt = status.start;
  } else {
    pillClass = 'shade';
    pillText = 'No sun';
    headline = number === 1 ? 'No sun' : 'No sun';
    timeLine = `Next ${HORIZON_MIN} min`;
    countdown = `No direct sun predicted`;
    weatherAt = now;
  }

  const card = document.createElement('div');
  card.className = `bigCard ${variant === 'sun' ? 'sun' : variant === 'next' ? 'next' : ''}`;
  card.innerHTML = `
    <div class="bigTop">
      <div>
        <div class="bigTitle">${number}. ${headline}</div>
        <div class="bigSub"><strong>${escapeHtml(pub.name)}</strong> • ${fmtDistance(row)} • ${escapeHtml(pub.area || '')}</div>
      </div>
      <div class="pill ${pillClass}">${pillText}</div>
    </div>

    <div class="bigBody">
      <div class="rowLine"><span><strong>${escapeHtml(timeLine)}</strong></span><span>${escapeHtml(countdown)}</span></div>
      <div class="mini">${escapeHtml(spotLine)}</div>
      <div class="mini" id="w_${pub.id}_${number}">Weather: loading…</div>

      <div class="actions">
        <button class="actionBtn primary" type="button" data-act="directions">Directions</button>
        <button class="actionBtn" type="button" data-act="map">Map</button>
      </div>
    </div>
  `;

  card.querySelector('[data-act="directions"]').addEventListener('click', (e) => {
    e.stopPropagation();
    openDirections(pub);
  });

  card.querySelector('[data-act="map"]').addEventListener('click', (e) => {
    e.stopPropagation();
    setView('map');
    initMapOnce();
    setMapHighlights(number === 1 ? pub.id : null, number === 2 ? pub.id : null);
    openPubOnMap(pub);
  });

  card.addEventListener('click', () => openDirections(pub));

  // Weather fill (best-effort)
  try {
    const w = await getWeather(pub.lat, pub.lng);
    const i = nearestHourlyIndex(w.hourly.time, weatherAt);
    if (token !== lastRenderToken) return card;
    const line = formatWeatherShort(w, i);
    const node = card.querySelector(`#w_${pub.id}_${number}`);
    if (node) node.textContent = `Weather: ${line}`;
  } catch {
    if (token !== lastRenderToken) return card;
    const node = card.querySelector(`#w_${pub.id}_${number}`);
    if (node) node.textContent = 'Weather: unavailable';
  }

  // If this is card #2 and we have prevRow, add a “leave at” hint
  if (prevRow && number === 2 && status.kind !== 'no-sun') {
    const leave = new Date(status.start.getTime() - (row.walkMin + 2) * 60 * 1000);
    const hint = document.createElement('div');
    hint.className = 'mini';
    hint.textContent = `Leave ~ ${fmtHM(leave)} to catch the sun.`;
    card.querySelector('.bigBody')?.appendChild(hint);
  }

  return card;
}

// ---------- Boot ----------
function boot(){
  el.locBtnText.textContent = userLoc ? 'Near me' : 'Near me';
  setView(viewMode);

  // Init map only if user opens map
  if (viewMode === 'map') initMapOnce();

  render(true);

  // Live refresh (recompute sun + refresh UI)
  setInterval(() => render(false), 60 * 1000);
}

// If user already granted location previously, use it
if (userLoc) {
  el.locBtnText.textContent = 'Near me';
}

boot();
