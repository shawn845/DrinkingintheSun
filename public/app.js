/* Drinking in the Sun — LIVE (next 2 hours) — Model A (calibrated 8 Aug)
   - Loads CSV: ./public/data/DrinkingintheSunData.csv
   - Uses Sun In/Out on 8 Aug to define obstruction edge in sun-angle space
   - Predicts sun for TODAY, but only displays within next 2 hours
*/

const NOTTINGHAM_CENTER = { lat: 52.9548, lng: -1.1581 };
const HORIZON_MIN = 120;
const STEP_MIN = 5;
const SWITCH_GAP_MIN = 5;

const CALIBRATION_DATE = { y: 2026, m: 8, d: 8 }; // 8 Aug 2026

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

// Data-loaded pubs (from CSV)
let PUBS = [];

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
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

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

// ---------- Sun position helpers ----------
function radToDeg(r){ return r * 180 / Math.PI; }
function azimuthToBearingDeg(azRad){
  const azDeg = azRad * 180 / Math.PI;
  return (azDeg + 180 + 360) % 360;
}
function sunBearingAltitude(dateTime, lat, lng){
  const pos = SunCalc.getPosition(dateTime, lat, lng);
  return { bearing: azimuthToBearingDeg(pos.azimuth), alt: radToDeg(pos.altitude) };
}

// Wrap-safe interpolation axis
function unwrapAzRange(azIn, azOut){
  let a = azIn;
  let b = azOut;

  let d = b - a;
  if (d > 180) b -= 360;
  if (d < -180) b += 360;

  if (b < a) [a, b] = [b, a];
  return { a, b };
}
function unwrapAz(az, a){
  let z = az;
  while (z < a - 180) z += 360;
  while (z > a + 180) z -= 360;
  return z;
}

// ---------- Model A ----------
function spotInSun_ModelA(pub, spot, dateTime){
  if (!spot?.cal || !spot.cal.valid) return false;

  const { bearing, alt } = sunBearingAltitude(dateTime, pub.lat, pub.lng);

  const azIn = spot.cal.azIn;
  const altIn = spot.cal.altIn;
  const azOut = spot.cal.azOut;
  const altOut = spot.cal.altOut;

  const { a, b } = unwrapAzRange(azIn, azOut);
  const z = unwrapAz(bearing, a);

  if (z < a || z > b) return false;

  const span = (b - a);
  if (span <= 0.0001) return false;

  const u = clamp((z - a) / span, 0, 1);
  const requiredAlt = altIn + u * (altOut - altIn);

  return alt >= requiredAlt;
}

function computeWindowsForDate(pub, spot, dayDate){
  const times = SunCalc.getTimes(dayDate, pub.lat, pub.lng);
  let startDay = times.sunrise;
  let endDay   = times.sunset;

  if (!(startDay instanceof Date) || isNaN(startDay) || !(endDay instanceof Date) || isNaN(endDay) || endDay <= startDay){
    startDay = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 4, 0, 0, 0);
    endDay   = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 22, 0, 0, 0);
  }

  const windows = [];
  let currentStart = null;

  for (let t = new Date(startDay); t <= endDay; t = new Date(t.getTime() + STEP_MIN*60*1000)) {
    const hit = spotInSun_ModelA(pub, spot, t);
    if (hit && !currentStart) currentStart = new Date(t);
    if (!hit && currentStart) {
      windows.push({ start: currentStart, end: new Date(t) });
      currentStart = null;
    }
  }
  if (currentStart) windows.push({ start: currentStart, end: new Date(endDay) });

  return windows.filter(w => (w.end - w.start) >= 10*60*1000);
}

function sunStatusForPub(pub, now, horizonStart, horizonEnd){
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);

  const spotInfos = pub.spots.map(spot => {
    const dayWindows = computeWindowsForDate(pub, spot, day);

    // Clip to next 2 hours only
    const windows = dayWindows
      .map(w => ({
        start: w.start < horizonStart ? horizonStart : w.start,
        end:   w.end   > horizonEnd   ? horizonEnd   : w.end
      }))
      .filter(w => w.end > w.start);

    return { spot, windows };
  });

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
const WEATHER_TTL_MS = 30 * 60 * 1000;
const weatherCache = new Map(); // key -> { t, data }

function weatherKey(lat,lng){
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
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
function openPubOnMap(pub){
  initMapOnce();
  const m = markers.get(pub.id);
  if (!m) return;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pub.lat + ',' + pub.lng)}`;
  m.bindPopup(`<strong>${escapeHtml(pub.name)}</strong><br>${escapeHtml(pub.area||'')}<br><a href="${gmaps}" target="_blank" rel="noopener">Directions</a>`);
  map.setView([pub.lat, pub.lng], 16, { animate:true });
  m.openPopup();
}
function staticMapUrl(lat,lng){
  const center = `${lat},${lng}`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(center)}&zoom=16&size=640x280&markers=${encodeURIComponent(center)},red-pushpin`;
}
function directionsUrl(pub){
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pub.lat + ',' + pub.lng)}`;
}

// ---------- Planner ----------
function pickBest(rows, now){
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
function pickNextAfter(rows, pivotTime, excludeId, horizonStart, horizonEnd){
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

    return a.walkMin - b.walkMin;
  });

  return candidates[0];
}

// ---------- Render ----------
async function render(){
  const token = ++lastRenderToken;

  if (!PUBS.length){
    el.plan.innerHTML = `<div class="bigCard bad"><div class="bigTitle">Loading data…</div></div>`;
    return;
  }

  const now = new Date();
  const horizonStart = now;
  const horizonEnd = new Date(now.getTime() + HORIZON_MIN*60*1000);
  const baseLoc = userLoc || NOTTINGHAM_CENTER;

  el.statusLine.textContent = userLoc ? 'Using your location' : 'Tap Near me for walking times.';
  el.statusHint.textContent = `Updated ${fmtHM(now)} • Horizon: next ${HORIZON_MIN} min`;

  let rows = PUBS.map(pub => {
    const distKm = haversineKm(baseLoc, { lat: pub.lat, lng: pub.lng });
    const walkMin = walkMinutesFromKm(distKm);
    const sun = sunStatusForPub(pub, now, horizonStart, horizonEnd);
    return { pub, distKm, walkMin, sun, effective: { ...sun }, weatherNow: null, weatherAtStart: null };
  });

  // Weather fetch buckets
  const bucketSet = new Map();
  for (const r of rows){
    const k = weatherKey(r.pub.lat, r.pub.lng);
    if (!bucketSet.has(k)) bucketSet.set(k, { lat: r.pub.lat, lng: r.pub.lng });
  }
  const buckets = [...bucketSet.values()];
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

  // Weather gating
  rows = rows.map(r => {
    const wNow = weatherInfoFor(r.pub, now);
    r.weatherNow = wNow;

    let effective = { ...r.sun };
    if (r.sun.kind === 'sunny-now') {
      if (wNow && wNow.like === 'bad') {
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
    ? pickNextAfter(rows, pivot, best1.pub.id, horizonStart, horizonEnd)
    : null;

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

  // --- Plan ---
  el.plan.innerHTML = `<div class="sectionTitle">Suggested plan</div>`;
  if (!best1) {
    el.plan.insertAdjacentHTML('beforeend', `
      <div class="bigCard bad">
        <div class="bigTitle">No likely sun found</div>
        <div class="mini">Within the next ${HORIZON_MIN} minutes.</div>
      </div>
    `);
  } else {
    el.plan.appendChild(buildPlanCard(best1, 1, now));
    if (best2) el.plan.appendChild(buildPlanCard(best2, 2, now, best1));
  }

  // --- List (five) ---
  const exclude = new Set([best1?.pub?.id, best2?.pub?.id].filter(Boolean));
  const list = rows
    .filter(r => !exclude.has(r.pub.id))
    .filter(r => r.effective.kind !== 'no-sun')
    .filter(r => r.effective.kind !== 'bad-now')
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

  let pillClass = 'bad';
  let pillText = '—';
  let headline = number === 1 ? '1. Sunny now' : '2. Next best';
  let timeLine = '';
  let rightLine = '';
  let weatherLine = 'Weather: unavailable';
  let spotLine = effective.spot?.name ? `Spot: ${effective.spot.name}` : 'Spot: —';

  if (effective.kind === 'sunny-now') {
    pillClass = 'sun';
    pillText = 'Sunny now';
    headline = number === 1 ? '1. Sunny now' : `2. Sunny`;
    timeLine = `${fmtHM(now)}–${fmtHM(effective.end)}`;
    rightLine = `Shade in ${minsBetween(now, effective.end)} min`;
    if (weatherNow?.data) weatherLine = `Weather: ${formatWeatherShort(weatherNow.data, weatherNow.i)}`;
  } else if (effective.kind === 'next-sun') {
    pillClass = 'next';
    pillText = 'Next sun';
    headline = number === 1 ? '1. Next sun' : '2. Next best';
    timeLine = `${fmtHM(effective.start)}–${fmtHM(effective.end)}`;
    rightLine = `Starts in ${minsBetween(now, effective.start)} min`;
    if (weatherAtStart?.data) weatherLine = `Weather: ${formatWeatherShort(weatherAtStart.data, weatherAtStart.i)}`;
  } else if (effective.kind === 'bad-next') {
    pillClass = 'bad';
    pillText = 'Cloudy';
    headline = number === 1 ? '1. Next sun (weather poor)' : '2. Next best (weather poor)';
    timeLine = `${fmtHM(effective.start)}–${fmtHM(effective.end)}`;
    rightLine = `Starts in ${minsBetween(now, effective.start)} min`;
    const wi = row.weatherAtStart;
    if (wi?.data) weatherLine = `Weather: ${formatWeatherShort(wi.data, wi.i)}`;
  } else if (effective.kind === 'bad-now') {
    pillClass = 'bad';
    pillText = 'Cloudy';
    headline = number === 1 ? '1. Not sunny now' : '2. Not sunny';
    timeLine = `${fmtHM(now)}–${fmtHM(effective.end)}`;
    rightLine = `Sun angle OK, weather poor`;
    const wi = row.weatherNow;
    if (wi?.data) weatherLine = `Weather: ${formatWeatherShort(wi.data, wi.i)}`;
  } else {
    headline = number === 1 ? '1. No sun' : '2. No sun';
    timeLine = `Next ${HORIZON_MIN} min`;
    rightLine = `No direct sun predicted`;
  }

  let leaveHint = '';
  if (prevRow && number === 2 && (effective.kind === 'next-sun' || effective.kind === 'bad-next')) {
    const leave = new Date(effective.start.getTime() - (walkMin + 2) * 60 * 1000);
    leaveHint = `Leave ~ ${fmtHM(leave)} to arrive for the start.`;
  }

  const card = document.createElement('div');
  card.className = 'bigCard';
  card.innerHTML = `
    <div class="bigTop">
      <div>
        <div class="bigTitle">${escapeHtml(headline)}</div>
        <div class="bigSub"><strong>${escapeHtml(pub.name)}</strong> • ${walkMin} min walk</div>
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
    openPubOnMap(pub);
  });

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
        <div class="cardSub">${walkMin} min walk</div>
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

  card.addEventListener('click', () => window.open(directionsUrl(pub), '_blank', 'noopener'));
  return card;
}

// ---------- CSV loading ----------
async function loadCsvText(){
  const res = await fetch('./public/data/DrinkingintheSunData.csv', { cache:'no-store' });
  if (!res.ok) throw new Error('Could not load CSV');
  return res.text();
}
function parseCSVLine(line){
  const out = [];
  let cur = '';
  let inQ = false;

  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"'){
      if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ){
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}
function toTimeHHMM(s){
  const t = String(s ?? '').trim();
  if (!t) return null;

  if (/^\d{1,2}\.\d{2}$/.test(t)){
    const [h,m] = t.split('.');
    return `${pad2(+h)}:${m}`;
  }
  if (/^\d{1,2}:\d{1,2}$/.test(t)){
    const [h,m] = t.split(':');
    return `${pad2(+h)}:${pad2(+m)}`;
  }
  if (/^\d{3,4}$/.test(t)){
    const tt = t.padStart(4,'0');
    return `${tt.slice(0,2)}:${tt.slice(2)}`;
  }
  return t;
}
function makeLocalDateTimeOnCalibration(hhmm){
  const [hh, mm] = hhmm.split(':').map(n => +n);
  return new Date(CALIBRATION_DATE.y, CALIBRATION_DATE.m - 1, CALIBRATION_DATE.d, hh, mm, 0, 0);
}
function buildCalForSpot(pubLat, pubLng, sunIn, sunOut){
  const inT = toTimeHHMM(sunIn);
  const outT = toTimeHHMM(sunOut);
  if (!inT || !outT) return { valid:false };

  const dtIn = makeLocalDateTimeOnCalibration(inT);
  const dtOut = makeLocalDateTimeOnCalibration(outT);

  const pIn = sunBearingAltitude(dtIn, pubLat, pubLng);
  const pOut = sunBearingAltitude(dtOut, pubLat, pubLng);

  return {
    valid:true,
    azIn: pIn.bearing,
    altIn: pIn.alt,
    azOut: pOut.bearing,
    altOut: pOut.alt,
    inTime: inT,
    outTime: outT
  };
}
function csvToPubs(csvText){
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);

  const headerIdx = lines.findIndex(l => l.toLowerCase().startsWith('pub id,'));
  if (headerIdx < 0) return [];

  const header = parseCSVLine(lines[headerIdx]);
  const rows = [];

  for (let i=headerIdx+1;i<lines.length;i++){
    const line = lines[i];
    if (/^lists:/i.test(line)) break;
    if (/^pubs:/i.test(line)) continue;

    const cols = parseCSVLine(line);
    if (cols.length < 6) continue;

    const rec = {};
    for (let c=0;c<header.length;c++){
      rec[header[c]] = cols[c] ?? '';
    }
    if (String(rec['Pub ID']||'').trim().toUpperCase().startsWith('PUB') === false) continue;
    rows.push(rec);
  }

  return rows.map(r => {
    const lat = parseFloat(r['Latitude']);
    const lng = parseFloat(r['Longitude']);
    const id = String(r['Pub ID']).trim() || (String(r['Pub Name']).trim().toLowerCase().replace(/\W+/g,'-'));

    const spots = [];
    function addSpot(letter){
      const type = String(r[`Spot ${letter} Type`] || '').trim();
      const detail = String(r[`Spot ${letter} Detail`] || '').trim();
      const sunIn = r[`Spot ${letter} Sun In`];
      const sunOut = r[`Spot ${letter} Sun Out`];

      if (!type && !detail) return;
      if (!sunIn || !sunOut) return;

      const name = detail ? `${type} — ${detail}` : type;
      const cal = buildCalForSpot(lat, lng, sunIn, sunOut);

      if (cal && cal.valid){
        spots.push({ name, type, detail, cal });
      }
    }
    addSpot('A'); addSpot('B'); addSpot('C');

    return {
      id,
      name: String(r['Pub Name']||'').trim(),
      area: String(r['Address']||'').trim(),
      lat, lng,
      spots
    };
  })
  .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  .filter(p => p.spots.length > 0);
}

// ---------- Boot ----------
async function boot(){
  setView(viewMode);
  el.nearBtnText.textContent = 'Near me';

  try{
    const csvText = await loadCsvText();
    PUBS = csvToPubs(csvText);

    if (viewMode === 'map') initMapOnce();
    render();
    setInterval(() => render(), 60 * 1000);
  } catch (e){
    el.plan.innerHTML = `
      <div class="bigCard bad">
        <div class="bigTitle">Data load failed</div>
        <div class="mini">Ensure the CSV is at <strong>public/data/DrinkingintheSunData.csv</strong>.</div>
      </div>
    `;
  }
}
boot();
