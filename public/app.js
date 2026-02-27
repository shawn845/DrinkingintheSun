/* Drinking in the Sun
   - Next 24 hours only (slider 0..24h)
   - Near-me sorting (haversine) + simple “walk minutes”
   - Shows: Sunny now / Next sun + “what to do when current spot goes shade”
   - Weather: Open-Meteo hourly per pub lat/lng (cached, best-effort)
*/

const NOTTINGHAM_CENTER = { lat: 52.9548, lng: -1.1581 };

// Demo pubs. Replace/extend freely.
// IMPORTANT: lat/lng and spot bearings are inputs you should verify/tune.
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
  }
];

// ---------- Install prompt ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = document.getElementById('installBtn');
  b.hidden = false;
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
  installBtn: document.getElementById('installBtn'),
  search: document.getElementById('search'),
  whenRange: document.getElementById('whenRange'),
  whenMeta: document.getElementById('whenMeta'),
  metaLine: document.getElementById('metaLine'),
  plan: document.getElementById('plan'),
  results: document.getElementById('results'),
  viewList: document.getElementById('viewList'),
  viewMap: document.getElementById('viewMap'),
  modeNear: document.getElementById('modeNear'),
  modeAll: document.getElementById('modeAll'),
  listPanel: document.getElementById('listPanel'),
  mapPanel: document.getElementById('mapPanel'),
};

// ---------- State ----------
let userLoc = loadUserLoc() || null;
let viewMode = 'list';
let nearMode = true;

// ---------- Location ----------
function loadUserLoc(){
  try { return JSON.parse(localStorage.getItem('ditS_userLoc') || 'null'); } catch { return null; }
}
function saveUserLoc(loc){
  localStorage.setItem('ditS_userLoc', JSON.stringify(loc));
}
function requestLocation(){
  if (!navigator.geolocation) return;
  el.locBtn.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveUserLoc(userLoc);
      el.locBtn.textContent = 'Location set';
      render();
    },
    () => {
      el.locBtn.textContent = 'Use my location';
      render();
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
  );
}

el.locBtn.addEventListener('click', requestLocation);

// ---------- Sun helpers ----------
function pad2(n){ return String(n).padStart(2,'0'); }
function fmtHM(d){ return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

function azimuthToBearingDeg(azRad){
  // SunCalc azimuth radians: 0=south, -east, +west.
  const azDeg = azRad * 180 / Math.PI;
  return (azDeg + 180 + 360) % 360; // bearing from north 0..360
}
function radToDeg(r){ return r * 180 / Math.PI; }
function withinBearing(bearing, min, max){
  if (min <= max) return bearing >= min && bearing <= max;
  return bearing >= min || bearing <= max; // wrap
}
function spotInSun(pub, spot, dateTime){
  const pos = SunCalc.getPosition(dateTime, pub.lat, pub.lng);
  const bearing = azimuthToBearingDeg(pos.azimuth);
  const elev = radToDeg(pos.altitude);
  return withinBearing(bearing, spot.bearingMin, spot.bearingMax) && elev >= (spot.minElevation ?? 0);
}

function computeWindowsNext24h(pub, spot, fromTime, toTime){
  const stepMin = 5;
  const windows = [];
  let currentStart = null;

  for (let t = new Date(fromTime); t <= toTime; t = new Date(t.getTime() + stepMin*60*1000)) {
    const hit = spotInSun(pub, spot, t);
    if (hit && !currentStart) currentStart = new Date(t);
    if (!hit && currentStart) {
      windows.push({ start: currentStart, end: new Date(t) });
      currentStart = null;
    }
  }
  if (currentStart) windows.push({ start: currentStart, end: new Date(toTime) });

  // remove tiny windows (<10 min)
  return windows.filter(w => (w.end - w.start) >= 10*60*1000);
}

function bestStatusForPub(pub, atTime, horizonEnd){
  if (!Number.isFinite(pub.lat) || !Number.isFinite(pub.lng)) {
    return { kind:'no-coords' };
  }

  // Build windows per spot, but only within next 24h
  const spotInfos = pub.spots.map(spot => {
    const windows = computeWindowsNext24h(pub, spot, atTime, horizonEnd);
    return { spot, windows };
  });

  // Is any spot sunny at atTime?
  const sunnyNow = [];
  for (const si of spotInfos) {
    const w = si.windows.find(w => atTime >= w.start && atTime <= w.end);
    if (w) sunnyNow.push({ spot: si.spot, window: w });
  }

  if (sunnyNow.length) {
    // choose spot with latest end (best remaining)
    sunnyNow.sort((a,b) => b.window.end - a.window.end);
    const chosen = sunnyNow[0];
    return {
      kind:'sunny-now',
      spot: chosen.spot,
      start: chosen.window.start,
      end: chosen.window.end
    };
  }

  // else find next window across spots
  const nexts = [];
  for (const si of spotInfos) {
    const w = si.windows.find(w => w.start > atTime);
    if (w) nexts.push({ spot: si.spot, window: w });
  }
  if (!nexts.length) return { kind:'no-sun-24h' };

  nexts.sort((a,b) => a.window.start - b.window.start);
  const chosen = nexts[0];
  return {
    kind:'next-sun',
    spot: chosen.spot,
    start: chosen.window.start,
    end: chosen.window.end
  };
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
  // ~4.8 km/h walking
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
    `&forecast_days=2&timezone=auto`;
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

// limit concurrent weather fetches
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

// ---------- UI render ----------
function setView(mode){
  viewMode = mode;
  el.viewList.classList.toggle('isOn', mode==='list');
  el.viewMap.classList.toggle('isOn', mode==='map');

  if (window.matchMedia('(max-width: 980px)').matches){
    el.listPanel.style.display = mode==='list' ? '' : 'none';
    el.mapPanel.style.display  = mode==='map'  ? '' : 'none';
  } else {
    el.listPanel.style.display = '';
    el.mapPanel.style.display  = '';
  }

  if (mode==='map') setTimeout(() => map?.invalidateSize(), 150);
}

el.viewList.addEventListener('click', () => setView('list'));
el.viewMap.addEventListener('click', () => setView('map'));

el.modeNear.addEventListener('click', () => {
  nearMode = true;
  el.modeNear.classList.add('isOn');
  el.modeAll.classList.remove('isOn');
  render();
});
el.modeAll.addEventListener('click', () => {
  nearMode = false;
  el.modeAll.classList.add('isOn');
  el.modeNear.classList.remove('isOn');
  render();
});

function whenLabel(now, offsetMin){
  if (offsetMin === 0) return 'Now';
  const t = new Date(now.getTime() + offsetMin*60*1000);
  const day = t.toDateString() === now.toDateString() ? 'Today' : 'Tomorrow';
  return `${day} ${fmtHM(t)} (+${offsetMin}m)`;
}

el.whenRange.addEventListener('input', () => {
  const now = new Date();
  const offsetMin = Number(el.whenRange.value);
  el.whenMeta.textContent = whenLabel(now, offsetMin);
  render();
});

el.search.addEventListener('input', render);
window.addEventListener('resize', () => setView(viewMode));

// ---------- Map ----------
let map = null;
const markers = new Map(); // pubId -> marker

function initMapOnce(){
  if (map) return;
  map = L.map('map', { zoomControl:true }).setView([NOTTINGHAM_CENTER.lat, NOTTINGHAM_CENTER.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  PUBS.forEach(pub => {
    if (!Number.isFinite(pub.lat) || !Number.isFinite(pub.lng)) return;
    const m = L.marker([pub.lat, pub.lng]).addTo(map);
    m.bindPopup(`<strong>${escapeHtml(pub.name)}</strong><br>${escapeHtml(pub.area || '')}`);
    markers.set(pub.id, m);
  });
}

function setSpecialMarkers(bestNowId, bestNextId){
  // swap icons for “1 / 2” pins (only for those two)
  PUBS.forEach(pub => {
    const m = markers.get(pub.id);
    if (!m) return;
    m.setIcon(new L.Icon.Default());
  });

  const makeDivIcon = (cls, txt) => L.divIcon({
    className: '',
    html: `<div class="pin ${cls}">${txt}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -24]
  });

  if (bestNowId && markers.get(bestNowId)) markers.get(bestNowId).setIcon(makeDivIcon('one', '1'));
  if (bestNextId && markers.get(bestNextId)) markers.get(bestNextId).setIcon(makeDivIcon('two', '2'));
}

function focusPub(pubId){
  initMapOnce();
  const pub = PUBS.find(p => p.id === pubId);
  const m = markers.get(pubId);
  if (!pub || !m) return;
  map.setView([pub.lat, pub.lng], 16, { animate:true });
  m.openPopup();
  if (window.matchMedia('(max-width: 980px)').matches) setView('map');
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ---------- Recommendation (“when current goes shade”) ----------
function buildPlanCard(bestNow, bestNext, atTime){
  if (!bestNow) {
    el.plan.innerHTML = '';
    return;
  }

  const nowLine = bestNow.kind === 'sunny-now'
    ? `1) ${escapeHtml(bestNow.pub.name)} — sunny now (${fmtHM(atTime)}–${fmtHM(bestNow.end)}) • ${bestNow.walkMin} min walk`
    : `1) ${escapeHtml(bestNow.pub.name)} — next sun ${fmtHM(bestNow.start)}–${fmtHM(bestNow.end)} • ${bestNow.walkMin} min walk`;

  let nextLine = '2) —';
  let subLine = '';
  if (bestNext) {
    nextLine = `2) ${escapeHtml(bestNext.pub.name)} — ${fmtHM(bestNext.start)}–${fmtHM(bestNext.end)} • ${bestNext.walkMin} min walk`;
    const leave = new Date(bestNext.start.getTime() - (bestNext.walkMin + 2) * 60 * 1000);
    subLine = `Leave ~ ${fmtHM(leave)} to arrive for the next sun.`;
  }

  el.plan.innerHTML = `
    <div class="planCard">
      <div class="planTitle">Suggested plan</div>
      <div class="planLine">${nowLine}</div>
      <div class="planLine">${nextLine}</div>
      <div class="planSub">${subLine}</div>
    </div>
  `;
}

function pickNextAfter(results, endTime, excludeId){
  // Find a pub that is sunny at (endTime + 5 min) or starts soon after.
  const t = new Date(endTime.getTime() + 5*60*1000);
  const candidates = results
    .filter(r => r.pub.id !== excludeId)
    .map(r => {
      // recompute status at t
      const horizon = new Date(t.getTime() + 24*60*60*1000);
      const s = bestStatusForPub(r.pub, t, horizon);
      if (s.kind === 'sunny-now' || s.kind === 'next-sun') {
        const start = s.kind === 'sunny-now' ? t : s.start;
        return { pub:r.pub, kind:s.kind, start, end:s.end, spot:s.spot, walkMin:r.walkMin, distKm:r.distKm };
      }
      return null;
    })
    .filter(Boolean);

  // rank: earliest start then distance
  candidates.sort((a,b) => (a.start - b.start) || (a.walkMin - b.walkMin));
  return candidates[0] || null;
}

// ---------- Render ----------
let lastWeatherRunToken = 0;

async function render(){
  initMapOnce();

  const now = new Date();
  const offsetMin = Number(el.whenRange.value || 0);
  const atTime = new Date(now.getTime() + offsetMin*60*1000);
  const horizonEnd = new Date(atTime.getTime() + 24*60*60*1000);

  el.whenMeta.textContent = whenLabel(now, offsetMin);

  const baseLoc = (nearMode && userLoc) ? userLoc : NOTTINGHAM_CENTER;
  const locLabel = (nearMode && userLoc) ? 'your location' : 'Nottingham centre';

  // meta line (sunrise/sunset for centre)
  const t = SunCalc.getTimes(atTime, NOTTINGHAM_CENTER.lat, NOTTINGHAM_CENTER.lng);
  el.metaLine.textContent = `Using ${locLabel} • Sunrise ~ ${fmtHM(t.sunrise)} • Sunset ~ ${fmtHM(t.sunset)} • Window: next 24h`;

  const q = (el.search.value || '').trim().toLowerCase();

  // Build results
  const computed = PUBS
    .filter(p => !q || (p.name + ' ' + (p.area||'')).toLowerCase().includes(q))
    .map(pub => {
      const distKm = (nearMode && baseLoc && Number.isFinite(pub.lat) && Number.isFinite(pub.lng))
        ? haversineKm(baseLoc, { lat: pub.lat, lng: pub.lng })
        : null;
      const walkMin = (distKm != null) ? walkMinutesFromKm(distKm) : null;

      const status = bestStatusForPub(pub, atTime, horizonEnd);
      return { pub, status, distKm, walkMin };
    });

  // Sort
  computed.sort((a,b) => {
    const rank = (x) => (x.status.kind === 'sunny-now' ? 0 : x.status.kind === 'next-sun' ? 1 : 2);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;

    // tie-break: time until sun (if next-sun)
    const ta = a.status.kind === 'next-sun' ? (a.status.start - atTime) : 0;
    const tb = b.status.kind === 'next-sun' ? (b.status.start - atTime) : 0;
    if (ta !== tb) return ta - tb;

    // then distance if available
    if (a.walkMin != null && b.walkMin != null) return a.walkMin - b.walkMin;
    return a.pub.name.localeCompare(b.pub.name);
  });

  // Pick “best now” and “next after”
  const top = computed.find(r => r.status.kind === 'sunny-now' || r.status.kind === 'next-sun') || null;

  let bestNow = null;
  if (top) {
    bestNow = {
      pub: top.pub,
      kind: top.status.kind,
      spot: top.status.spot,
      start: top.status.start,
      end: top.status.end,
      distKm: top.distKm,
      walkMin: top.walkMin ?? 0
    };
  }

  let bestNext = null;
  if (bestNow) {
    const endTimeForPlan = (bestNow.kind === 'sunny-now') ? bestNow.end : bestNow.start;
    bestNext = pickNextAfter(computed, endTimeForPlan, bestNow.pub.id);
  }

  buildPlanCard(bestNow, bestNext, atTime);
  setSpecialMarkers(bestNow?.pub?.id, bestNext?.pub?.id);

  // Render list
  el.results.innerHTML = '';
  computed.forEach(r => {
    const { pub, status, walkMin } = r;

    if (status.kind === 'no-coords') return; // hide pubs without coords in this build

    let badgeClass = 'shade', badgeText = '—';
    let primary = '—', secondary = '—';
    let weatherTime = null;

    if (status.kind === 'sunny-now') {
      badgeClass = 'sun';
      badgeText = 'Sunny now';
      const mins = Math.max(0, Math.round((status.end - atTime)/60000));
      primary = `Now: ${fmtHM(atTime)}–${fmtHM(status.end)} (+${mins} min)`;
      secondary = status.spot?.name ? `Spot: ${status.spot.name}` : '';
      weatherTime = atTime;
    } else if (status.kind === 'next-sun') {
      badgeClass = 'shade';
      badgeText = 'Shade now';
      const mins = Math.max(0, Math.round((status.start - atTime)/60000));
      primary = `Next sun: ${fmtHM(status.start)}–${fmtHM(status.end)} (in ${mins} min)`;
      secondary = status.spot?.name ? `Spot: ${status.spot.name}` : '';
      weatherTime = status.start;
    } else {
      badgeClass = 'shade';
      badgeText = 'No sun';
      primary = 'No predicted direct sun in next 24h';
      secondary = '';
      weatherTime = atTime;
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.addEventListener('click', () => focusPub(pub.id));

    const distLine = (walkMin != null) ? `${walkMin} min walk` : '';
    const weatherId = `w_${pub.id}_${Math.random().toString(16).slice(2)}`;

    card.innerHTML = `
      <div class="cardHead">
        <div>
          <div class="cardTitle">${escapeHtml(pub.name)}</div>
          <div class="cardSub">${escapeHtml(pub.area || '')}${distLine ? ` • ${distLine}` : ''}</div>
        </div>
        <div class="badge ${badgeClass}">${badgeText}</div>
      </div>

      <div class="band">
        <div class="bandRow">
          <div>${escapeHtml(primary)}</div>
        </div>
        ${secondary ? `<div class="smallRow">${escapeHtml(secondary)}</div>` : ''}
        <div class="smallRow" id="${weatherId}" data-weather="1" data-lat="${pub.lat}" data-lng="${pub.lng}" data-time="${weatherTime ? weatherTime.toISOString() : ''}">
          Weather: loading…
        </div>
      </div>
    `;

    el.results.appendChild(card);
  });

  // Weather fill (best-effort, cached)
  const token = ++lastWeatherRunToken;
  await fillWeatherForVisible(token);
}

async function fillWeatherForVisible(token){
  const nodes = [...document.querySelectorAll('[data-weather="1"]')];
  const tasks = nodes
    .map(n => {
      const lat = Number(n.dataset.lat);
      const lng = Number(n.dataset.lng);
      const timeIso = n.dataset.time;
      const time = timeIso ? new Date(timeIso) : new Date();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { node: n, lat, lng, time };
    })
    .filter(Boolean)
    .slice(0, 18); // limit to keep it snappy

  await runWithConcurrency(tasks, 4, async (t) => {
    try {
      const w = await getWeather(t.lat, t.lng);
      const i = nearestHourlyIndex(w.hourly.time, t.time);
      if (token !== lastWeatherRunToken) return; // stale render
      t.node.textContent = `Weather: ${formatWeatherShort(w, i)}`;
    } catch {
      if (token !== lastWeatherRunToken) return;
      t.node.textContent = 'Weather: unavailable';
    }
  });
}

// ---------- Boot ----------
(function init(){
  setView('list');

  // attempt location silently once (no prompt on some browsers unless via click)
  if (!userLoc) {
    el.locBtn.textContent = 'Use my location';
  } else {
    el.locBtn.textContent = 'Location set';
  }

  // If you want auto-request (some browsers will block), uncomment:
  // requestLocation();

  render();
})();
