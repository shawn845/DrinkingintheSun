/* Drinking in the Sun — LIVE (next 2 hours)
   Model A + Lou Reed “Perfect Day” + upgrades:
   1) Spot clarity on cards
   2) Open now + closing soon (if opening/closing times exist in CSV)
   3) Today/Tomorrow toggle (still next 2 hours horizon)
   4) Favourites (stars + filter)
   5) Share plan (Lou Reed overlay)
   6) Multiple sun windows per spot supported
   7) Optional edge profile points (Spot A Profile 1..6 etc)
   8) Cache computed windows per pub/spot/day
*/

const NOTTINGHAM_CENTER = { lat: 52.9548, lng: -1.1581 };
const HORIZON_MIN = 120;
const STEP_MIN = 5;
const SWITCH_GAP_MIN = 5;

const CALIBRATION_DATE = { y: 2026, m: 8, d: 8 }; // 8 Aug 2026

const PERFECT_DAY = {
  endHourLocal: 20,
  minStopMin: 35,
  maxStopMin: 75,
  bufferMin: 5,
  maxWaitMin: 25,
  walkMaxKm: 2.2,
  cycleMaxKm: 7.5,
  cycleKmh: 15
};

// ---------- DOM ----------
const el = {
  nearBtn: document.getElementById('nearBtn'),
  nearBtnText: document.getElementById('nearBtnText'),
  louBtn: document.getElementById('louBtn'),
  favToggleBtn: document.getElementById('favToggleBtn'),
  favToggleText: document.getElementById('favToggleText'),
  viewToggleBtn: document.getElementById('viewToggleBtn'),
  viewToggleText: document.getElementById('viewToggleText'),

  dayTodayBtn: document.getElementById('dayTodayBtn'),
  dayTomorrowBtn: document.getElementById('dayTomorrowBtn'),

  statusLine: document.getElementById('statusLine'),
  statusHint: document.getElementById('statusHint'),
  listPanel: document.getElementById('listPanel'),
  mapPanel: document.getElementById('mapPanel'),
  plan: document.getElementById('plan'),
  results: document.getElementById('results'),

  nextSunCard: document.getElementById('nextSunCard'),
  nextSunText: document.getElementById('nextSunText'),
  nextSunRefresh: document.getElementById('nextSunRefresh'),

  louOverlay: document.getElementById('louOverlay'),
  louBackdrop: document.getElementById('louBackdrop'),
  louClose: document.getElementById('louClose'),
  louOut: document.getElementById('louOut'),
  louBuild: document.getElementById('louBuild'),
  louStart: document.getElementById('louStart'),
  louStops: document.getElementById('louStops'),
  modeWalk: document.getElementById('modeWalk'),
  modeCycle: document.getElementById('modeCycle'),
  louShare: document.getElementById('louShare'),
  louCopy: document.getElementById('louCopy')
};

// ---------- State ----------
let userLoc = loadJSON('ditS_userLoc', null);
let viewMode = loadStr('ditS_viewMode', 'list');
let dayMode = loadStr('ditS_dayMode', 'today'); // today | tomorrow
let favOnly = loadBool('ditS_favOnly', false);
let favourites = new Set(loadJSON('ditS_favourites', []));
let louMode = 'walk';

let map = null;
const markers = new Map();
let lastRenderToken = 0;

let PUBS = []; // loaded from CSV

// Next-sun daily forecast cache
let nextSunCache = { t: 0, msg: 'Checking forecast…' };
const NEXTSUN_TTL_MS = 60 * 60 * 1000;

// Windows cache: key -> windows[]
const windowsCache = new Map(); // key = pubId|spotName|YYYY-MM-DD|profileHash

// Weather cache (per-pub) already internal
const WEATHER_TTL_MS = 30 * 60 * 1000;
const weatherCache = new Map(); // key -> {t,data}

// ---------- Storage helpers ----------
function loadStr(k, fallback){ try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } }
function saveStr(k,v){ try { localStorage.setItem(k, v); } catch {} }
function loadBool(k, fallback){ try { const v = localStorage.getItem(k); return v === null ? fallback : (v === '1'); } catch { return fallback; } }
function saveBool(k,v){ try { localStorage.setItem(k, v ? '1' : '0'); } catch {} }
function loadJSON(k, fallback){ try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fallback; } catch { return fallback; } }
function saveJSON(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ---------- Helpers ----------
function pad2(n){ return String(n).padStart(2,'0'); }
function fmtHM(d){ return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function minsBetween(a,b){ return Math.max(0, Math.round((b - a) / 60000)); }
function addMinutes(d, m){ return new Date(d.getTime() + m*60*1000); }
function addDays(d, days){ return new Date(d.getTime() + days*24*60*60*1000); }
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function normName(s){ return String(s||'').toLowerCase(); }
function isoDateLocal(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

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
function walkMinutesFromKm(km){ return Math.max(1, Math.round(km / 4.8 * 60)); }
function cycleMinutesFromKm(km){ return Math.max(1, Math.round(km / PERFECT_DAY.cycleKmh * 60)); }

// ---------- Cycling “wide-afield” bias ----------
function cycleWideBonus(pub){
  const n = normName(pub.name);
  const a = normName(pub.area);

  const named =
    (n.includes('lakeside') || a.includes('lakeside')) ? 30 :
    (n.includes('beeston')  || a.includes('beeston'))  ? 25 :
    (n.includes('basford')  || a.includes('basford'))  ? 20 :
    (n.includes('lion at basford') || n.includes('lion at baseford')) ? 25 : 0;

  const kmFromCenter = haversineKm(
    { lat: NOTTINGHAM_CENTER.lat, lng: NOTTINGHAM_CENTER.lng },
    { lat: pub.lat, lng: pub.lng }
  );

  const dist =
    kmFromCenter >= 6 ? 18 :
    kmFromCenter >= 4 ? 12 :
    kmFromCenter >= 3 ? 8  : 0;

  return named + dist;
}

// ---------- Open/close time parsing ----------
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
function parseOpenClose(pub){
  // If CSV has these columns, we support them:
  // "Opening Time" and "Closing Time" (or common variants)
  const open = pub.openingTime ? toTimeHHMM(pub.openingTime) : null;
  const close = pub.closingTime ? toTimeHHMM(pub.closingTime) : null;
  if (!open || !close) return null;
  return { open, close };
}
function isOpenAt(pub, dateTime){
  const oc = parseOpenClose(pub);
  if (!oc) return { known:false, open:true, closesInMin:null };

  const [oh, om] = oc.open.split(':').map(Number);
  const [ch, cm] = oc.close.split(':').map(Number);

  const d = new Date(dateTime);
  const openDT = new Date(d.getFullYear(), d.getMonth(), d.getDate(), oh, om, 0, 0);
  let closeDT = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ch, cm, 0, 0);

  // If close is "earlier" than open, assume after midnight
  if (closeDT <= openDT) closeDT = addDays(closeDT, 1);

  const isOpen = dateTime >= openDT && dateTime <= closeDT;
  const closesInMin = isOpen ? minsBetween(dateTime, closeDT) : null;
  return { known:true, open:isOpen, closesInMin };
}

// ---------- Location ----------
function requestLocation(){
  if (!navigator.geolocation) return;
  el.nearBtnText.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveJSON('ditS_userLoc', userLoc);
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
el.nearBtn?.addEventListener('click', requestLocation);

// ---------- View toggle ----------
function setView(mode){
  viewMode = mode;
  saveStr('ditS_viewMode', mode);

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
el.viewToggleBtn?.addEventListener('click', () => setView(viewMode === 'list' ? 'map' : 'list'));

// ---------- Day mode toggle (Today / Tomorrow) ----------
function setDayMode(mode){
  dayMode = mode;
  saveStr('ditS_dayMode', mode);
  el.dayTodayBtn.classList.toggle('active', mode === 'today');
  el.dayTomorrowBtn.classList.toggle('active', mode === 'tomorrow');
  render();
}
el.dayTodayBtn?.addEventListener('click', () => setDayMode('today'));
el.dayTomorrowBtn?.addEventListener('click', () => setDayMode('tomorrow'));

// ---------- Favourites ----------
function setFavOnly(v){
  favOnly = v;
  saveBool('ditS_favOnly', v);
  el.favToggleText.textContent = v ? 'Favourites ✓' : 'Favourites';
  render();
}
el.favToggleBtn?.addEventListener('click', () => setFavOnly(!favOnly));

function isFav(pubId){ return favourites.has(pubId); }
function toggleFav(pubId){
  if (favourites.has(pubId)) favourites.delete(pubId);
  else favourites.add(pubId);
  saveJSON('ditS_favourites', [...favourites]);
  render();
}

// ---------- Sun helpers ----------
function radToDeg(r){ return r * 180 / Math.PI; }
function azimuthToBearingDeg(azRad){
  const azDeg = azRad * 180 / Math.PI;
  return (azDeg + 180 + 360) % 360;
}
function sunBearingAltitude(dateTime, lat, lng){
  const pos = SunCalc.getPosition(dateTime, lat, lng);
  return { bearing: azimuthToBearingDeg(pos.azimuth), alt: radToDeg(pos.altitude) };
}
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

// ---------- Optional edge profile points (piecewise) ----------
function profileHash(points){
  // stable-ish hash for caching
  if (!points || !points.length) return 'none';
  return points.map(p => `${p.az.toFixed(2)}:${p.alt.toFixed(2)}`).join('|');
}

function requiredAltFromProfile(zUnwrapped, pointsUnwrapped){
  // pointsUnwrapped: sorted by azUnwrapped, each {az, alt}
  if (pointsUnwrapped.length < 2) return null;
  if (zUnwrapped <= pointsUnwrapped[0].az) return pointsUnwrapped[0].alt;
  if (zUnwrapped >= pointsUnwrapped[pointsUnwrapped.length-1].az) return pointsUnwrapped[pointsUnwrapped.length-1].alt;

  for (let i=0;i<pointsUnwrapped.length-1;i++){
    const p0 = pointsUnwrapped[i];
    const p1 = pointsUnwrapped[i+1];
    if (zUnwrapped >= p0.az && zUnwrapped <= p1.az){
      const span = (p1.az - p0.az);
      const u = span <= 0.0001 ? 0 : (zUnwrapped - p0.az) / span;
      return p0.alt + u * (p1.alt - p0.alt);
    }
  }
  return null;
}

// ---------- Model A (with optional profile points) ----------
function spotInSun_ModelA(pub, spot, dateTime){
  if (!spot?.cal || !spot.cal.valid) return false;

  const { bearing, alt } = sunBearingAltitude(dateTime, pub.lat, pub.lng);

  // Use profile points if present, else fall back to in/out line
  const pts = spot.cal.profilePoints && spot.cal.profilePoints.length >= 2
    ? spot.cal.profilePoints
    : null;

  if (!pts){
    const { a, b } = unwrapAzRange(spot.cal.azIn, spot.cal.azOut);
    const z = unwrapAz(bearing, a);
    if (z < a || z > b) return false;

    const span = (b - a);
    if (span <= 0.0001) return false;

    const u = clamp((z - a) / span, 0, 1);
    const requiredAlt = spot.cal.altIn + u * (spot.cal.altOut - spot.cal.altIn);
    return alt >= requiredAlt;
  }

  // Profile-point mode: unwrap around first point
  const anchor = pts[0].az;
  const ptsUnwrapped = pts.map(p => ({ az: unwrapAz(p.az, anchor), alt: p.alt }))
    .sort((x,y) => x.az - y.az);

  const z = unwrapAz(bearing, anchor);
  const minAz = ptsUnwrapped[0].az;
  const maxAz = ptsUnwrapped[ptsUnwrapped.length-1].az;
  if (z < minAz || z > maxAz) return false;

  const requiredAlt = requiredAltFromProfile(z, ptsUnwrapped);
  if (requiredAlt === null) return false;
  return alt >= requiredAlt;
}

// ---------- Caching windows per pub/spot/day ----------
function computeWindowsForDate(pub, spot, dayDate){
  const dateKey = isoDateLocal(dayDate);
  const pHash = profileHash(spot.cal.profilePoints || []);
  const cacheKey = `${pub.id}|${spot.name}|${dateKey}|${pHash}`;

  if (windowsCache.has(cacheKey)) return windowsCache.get(cacheKey);

  const times = SunCalc.getTimes(dayDate, pub.lat, pub.lng);
  let startDay = times.sunrise;
  let endDay   = times.sunset;

  if (!(startDay instanceof Date) || isNaN(startDay) || !(endDay instanceof Date) || isNaN(endDay) || endDay <= startDay){
    startDay = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 4, 0, 0, 0);
    endDay   = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 22, 0, 0, 0);
  }

  const windows = [];
  let currentStart = null;

  for (let t = new Date(startDay); t <= endDay; t = addMinutes(t, STEP_MIN)) {
    const hit = spotInSun_ModelA(pub, spot, t);
    if (hit && !currentStart) currentStart = new Date(t);
    if (!hit && currentStart) {
      windows.push({ start: currentStart, end: new Date(t) });
      currentStart = null;
    }
  }
  if (currentStart) windows.push({ start: currentStart, end: new Date(endDay) });

  const out = windows.filter(w => (w.end - w.start) >= 10*60*1000);
  windowsCache.set(cacheKey, out);
  return out;
}

function sunStatusForPub(pub, now, horizonStart, horizonEnd){
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);

  const spotInfos = pub.spots.map(spot => {
    const dayWindows = computeWindowsForDate(pub, spot, day);

    // clip to next 2 hours only
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
function weatherKey(lat,lng){ return `${lat.toFixed(4)},${lng.toFixed(4)}`; }

async function fetchWeather(lat, lng){
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,cloud_cover,precipitation_probability,wind_speed_10m,weather_code` +
    `&hourly=temperature_2m,cloud_cover,precipitation_probability,wind_speed_10m,weather_code` +
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

// ---------- Next sun in Nottingham (daily forecast) ----------
async function fetchNextSunDaily(){
  const lat = NOTTINGHAM_CENTER.lat;
  const lng = NOTTINGHAM_CENTER.lng;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,precipitation_probability_max,cloud_cover_mean` +
    `&forecast_days=7&timezone=auto`;

  const res = await fetch(url, { cache:'no-store' });
  if (!res.ok) throw new Error('daily forecast failed');
  return res.json();
}
function isLikelySunnyDay(daily, i){
  const code = daily.weather_code?.[i];
  const rain = daily.precipitation_probability_max?.[i];
  const cloud = daily.cloud_cover_mean?.[i];

  if (typeof rain === 'number' && typeof cloud === 'number'){
    return rain < 40 && cloud < 60;
  }
  if (typeof code === 'number'){
    return code === 0 || code === 1 || code === 2;
  }
  return false;
}
function formatDayLabel(isoDateStr){
  const d = new Date(isoDateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday:'short', day:'2-digit', month:'short' });
}
async function updateNextSunCard(force=false){
  const now = Date.now();
  if (!force && (now - nextSunCache.t) < NEXTSUN_TTL_MS){
    el.nextSunText.textContent = nextSunCache.msg;
    return;
  }
  try{
    el.nextSunText.textContent = 'Checking forecast…';
    const data = await fetchNextSunDaily();
    const daily = data.daily || {};
    const days = daily.time || [];

    let pick = null;
    for (let i=0;i<days.length;i++){
      if (isLikelySunnyDay(daily, i)){ pick = days[i]; break; }
    }

    if (!pick){
      nextSunCache = { t: Date.now(), msg: 'No likely sunny day in the next 7 days (forecast).' };
      el.nextSunText.textContent = nextSunCache.msg;
      return;
    }

    const pickDate = new Date(pick + 'T12:00:00');
    const nowDate = new Date();
    const daysAway = Math.round((pickDate - new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 12,0,0,0)) / (24*60*60*1000));

    const label = formatDayLabel(pick);
    const msg = daysAway <= 0
      ? `Likely sun today (${label}).`
      : `Likely sun in ${daysAway} day${daysAway===1?'':'s'} (${label}).`;

    nextSunCache = { t: Date.now(), msg };
    el.nextSunText.textContent = msg;
  } catch {
    nextSunCache = { t: Date.now(), msg: 'Forecast unavailable.' };
    el.nextSunText.textContent = nextSunCache.msg;
  }
}
el.nextSunRefresh?.addEventListener('click', () => updateNextSunCard(true));

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

// ---------- Day selection (today/tomorrow affects now+horizon) ----------
function getBaseNow(){
  const now = new Date();
  if (dayMode === 'today') return now;
  const tmr = addDays(now, 1);
  return new Date(tmr.getFullYear(), tmr.getMonth(), tmr.getDate(), now.getHours(), now.getMinutes(), 0, 0);
}

// ---------- UI building (spot clarity + open/closed + favourite star) ----------
function sunLineForEffective(effective, now){
  if (effective.kind === 'sunny-now'){
    return `Sun now • until ${fmtHM(effective.end)} (${minsBetween(now, effective.end)} min)`;
  }
  if (effective.kind === 'next-sun'){
    return `Next sun • ${fmtHM(effective.start)}–${fmtHM(effective.end)} (in ${minsBetween(now, effective.start)} min)`;
  }
  if (effective.kind === 'bad-next'){
    return `Sun angle soon • weather poor`;
  }
  if (effective.kind === 'bad-now'){
    return `Sun angle ok • weather poor`;
  }
  return `No direct sun predicted`;
}

function openLine(pub, now){
  const st = isOpenAt(pub, now);
  if (!st.known) return null;
  if (!st.open) return 'Closed now';
  if (st.closesInMin !== null && st.closesInMin <= 45) return `Open • closes in ${st.closesInMin} min`;
  return `Open now`;
}

function shouldIncludePub(pub, now){
  // If we know hours and it's closed, we exclude from main list + plan
  const st = isOpenAt(pub, now);
  if (st.known && !st.open) return false;
  // favourites filter
  if (favOnly && !isFav(pub.id)) return false;
  return true;
}

// ---------- Main planner helpers ----------
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
  const t = addMinutes(pivotTime, SWITCH_GAP_MIN);
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

  const now = getBaseNow();
  const horizonStart = now;
  const horizonEnd = addMinutes(now, HORIZON_MIN);
  const baseLoc = userLoc || NOTTINGHAM_CENTER;

  el.nearBtnText.textContent = 'Near me';
  el.favToggleText.textContent = favOnly ? 'Favourites ✓' : 'Favourites';

  const dayLabel = dayMode === 'today' ? 'Today' : 'Tomorrow';
  el.statusLine.textContent = userLoc ? `Using your location • ${dayLabel}` : `Tap Near me for walking times • ${dayLabel}`;
  el.statusHint.textContent = `Updated ${fmtHM(new Date())} • Viewing: ${dayLabel} • Horizon: next ${HORIZON_MIN} min`;

  // Filter pubs by open + favourites before any heavy work
  const pubsFiltered = PUBS.filter(p => shouldIncludePub(p, now));

  // Weather only for filtered pubs (speed)
  const wxData = await runWithConcurrency(pubsFiltered, 4, async (p) => {
    try { return { id: p.id, data: await getWeather(p.lat, p.lng) }; }
    catch { return { id: p.id, data: null }; }
  });
  if (token !== lastRenderToken) return;
  const wxById = new Map(wxData.map(x => [x.id, x.data]));

  function weatherInfoFor(pub, time){
    const data = wxById.get(pub.id);
    if (!data) return null;

    // If viewing "today" and time is near real now, prefer current
    if (dayMode === 'today' && Math.abs(time.getTime() - Date.now()) < 20 * 60 * 1000 && data.current){
      const cloud = data.current.cloud_cover;
      const rain = data.current.precipitation_probability;
      const like = weatherLikelihood(cloud, rain);
      const i = nearestHourlyIndex(data.hourly.time, time);
      return { data, i, like, cloud, rain };
    }

    const i = nearestHourlyIndex(data.hourly.time, time);
    const cloud = data.hourly.cloud_cover[i];
    const rain = data.hourly.precipitation_probability[i];
    const like = weatherLikelihood(cloud, rain);
    return { data, i, like, cloud, rain };
  }

  // Compute rows
  let rows = pubsFiltered.map(pub => {
    const distKm = haversineKm(baseLoc, { lat: pub.lat, lng: pub.lng });
    const walkMin = walkMinutesFromKm(distKm);
    const sun = sunStatusForPub(pub, now, horizonStart, horizonEnd);
    return { pub, distKm, walkMin, sun, effective: { ...sun }, weatherNow: null, weatherAtStart: null };
  });

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

  // Next-sun card only when there is NO sun in the horizon (or filtered list empty)
  const hasAnySunInHorizon = rows.some(r => (r.effective.kind === 'sunny-now' || r.effective.kind === 'next-sun'));
  if (!hasAnySunInHorizon){
    el.nextSunCard.style.display = '';
    await updateNextSunCard(false);
  } else {
    el.nextSunCard.style.display = 'none';
  }

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

  // --- Plan UI ---
  el.plan.innerHTML = `<div class="sectionTitle">Suggested plan</div>`;
  if (!best1) {
    el.plan.insertAdjacentHTML('beforeend', `
      <div class="bigCard bad">
        <div class="bigTitle">No likely sun found</div>
        <div class="mini">Within the next ${HORIZON_MIN} minutes.</div>
      </div>
    `);
  } else {
    el.plan.appendChild(buildPlanCard(best1, 1, now, weatherInfoFor));
    if (best2) el.plan.appendChild(buildPlanCard(best2, 2, now, weatherInfoFor, best1));
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

function buildPlanCard(row, number, now, weatherInfoFor, prevRow = null){
  const { pub, walkMin, effective } = row;

  const fav = isFav(pub.id);
  const openTxt = openLine(pub, now);

  let pillClass = 'bad';
  let pillText = '—';
  let headline = number === 1 ? '1. Sunny now' : '2. Next best';
  let timeLine = '';
  let rightLine = '';
  let weatherLine = 'Weather: unavailable';

  if (effective.kind === 'sunny-now') {
    pillClass = 'sun';
    pillText = 'Sunny now';
    headline = number === 1 ? '1. Sunny now' : `2. Sunny`;
    timeLine = `${fmtHM(now)}–${fmtHM(effective.end)}`;
    rightLine = `Shade in ${minsBetween(now, effective.end)} min`;
    const w = weatherInfoFor(pub, now);
    if (w?.data) weatherLine = `Weather: ${formatWeatherShort(w.data, w.i)}`;
  } else if (effective.kind === 'next-sun') {
    pillClass = 'next';
    pillText = 'Next sun';
    headline = number === 1 ? '1. Next sun' : '2. Next best';
    timeLine = `${fmtHM(effective.start)}–${fmtHM(effective.end)}`;
    rightLine = `Starts in ${minsBetween(now, effective.start)} min`;
    const w = weatherInfoFor(pub, effective.start);
    if (w?.data) weatherLine = `Weather: ${formatWeatherShort(w.data, w.i)}`;
  } else if (effective.kind === 'bad-next') {
    pillClass = 'bad';
    pillText = 'Cloudy';
    headline = number === 1 ? '1. Next sun (weather poor)' : '2. Next best (weather poor)';
    timeLine = `${fmtHM(effective.start)}–${fmtHM(effective.end)}`;
    rightLine = `Starts in ${minsBetween(now, effective.start)} min`;
    const w = weatherInfoFor(pub, effective.start);
    if (w?.data) weatherLine = `Weather: ${formatWeatherShort(w.data, w.i)}`;
  } else if (effective.kind === 'bad-now') {
    pillClass = 'bad';
    pillText = 'Cloudy';
    headline = number === 1 ? '1. Not sunny now' : '2. Not sunny';
    timeLine = `${fmtHM(now)}–${fmtHM(effective.end)}`;
    rightLine = `Sun angle OK, weather poor`;
    const w = weatherInfoFor(pub, now);
    if (w?.data) weatherLine = `Weather: ${formatWeatherShort(w.data, w.i)}`;
  } else {
    headline = number === 1 ? '1. No sun' : '2. No sun';
    timeLine = `Next ${HORIZON_MIN} min`;
    rightLine = `No direct sun predicted`;
  }

  const spotLine = effective.spot?.name ? `Sit: ${effective.spot.name}` : 'Sit: —';
  const sunLine = sunLineForEffective(effective, now);

  let leaveHint = '';
  if (prevRow && number === 2 && (effective.kind === 'next-sun' || effective.kind === 'bad-next')) {
    const leave = addMinutes(effective.start, -(walkMin + 2));
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

      <div style="display:flex; gap:8px; align-items:flex-start;">
        <button class="starBtn ${fav ? 'on':''}" type="button" data-star="${escapeHtml(pub.id)}">${fav ? '★' : '☆'}</button>
        <div class="pill ${pillClass}">${escapeHtml(pillText)}</div>
      </div>
    </div>

    <div class="bigBody">
      <div class="rowLine"><span><strong>${escapeHtml(timeLine)}</strong></span><span>${escapeHtml(rightLine)}</span></div>
      <div class="mini">${escapeHtml(spotLine)}</div>
      <div class="mini">${escapeHtml(sunLine)}</div>
      ${openTxt ? `<div class="mini">${escapeHtml(openTxt)}</div>` : ``}
      <div class="mini">${escapeHtml(weatherLine)}</div>
      ${leaveHint ? `<div class="mini">${escapeHtml(leaveHint)}</div>` : ``}

      <div class="actions">
        <button class="actionBtn primary" type="button" data-act="directions">Directions</button>
        <button class="actionBtn" type="button" data-act="map">Map</button>
      </div>
    </div>
  `;

  card.querySelector('[data-star]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFav(pub.id);
  });

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
  const fav = isFav(pub.id);
  const openTxt = openLine(pub, now);

  let badgeClass = 'bad';
  let badgeText = '—';

  if (effective.kind === 'sunny-now') { badgeClass='sun'; badgeText='Sunny now'; }
  else if (effective.kind === 'next-sun') { badgeClass='next'; badgeText='Next sun'; }
  else if (effective.kind === 'bad-next') { badgeClass='bad'; badgeText='Cloudy'; }
  else { badgeClass='bad'; badgeText='—'; }

  const sunLine = sunLineForEffective(effective, now);
  const spotLine = effective.spot?.name ? `Sit: ${effective.spot.name}` : `Sit: —`;

  const card = document.createElement('div');
  card.className = 'card';

  const thumbUrl = staticMapUrl(pub.lat, pub.lng);

  card.innerHTML = `
    <div class="cardTop">
      <div>
        <div class="cardTitle">${escapeHtml(pub.name)}</div>
        <div class="cardSub">${walkMin} min walk</div>
      </div>

      <div style="display:flex; gap:8px; align-items:flex-start;">
        <button class="starBtn ${fav ? 'on':''}" type="button" data-star="${escapeHtml(pub.id)}">${fav ? '★' : '☆'}</button>
        <span class="badge ${badgeClass}">${escapeHtml(badgeText)}</span>
      </div>
    </div>

    <div class="cardBody">
      <div class="mini">${escapeHtml(spotLine)}</div>
      <div class="mini">${escapeHtml(sunLine)}</div>
      ${openTxt ? `<div class="mini">${escapeHtml(openTxt)}</div>` : ``}

      <div class="thumb">
        <img src="${thumbUrl}" alt="Map preview for ${escapeHtml(pub.name)}" loading="lazy" />
      </div>

      <div class="cardActions">
        <button class="smallBtn" type="button" data-act="directions">Directions</button>
        <button class="smallBtn" type="button" data-act="map">Map</button>
      </div>
    </div>
  `;

  card.querySelector('[data-star]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFav(pub.id);
  });

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

// ---------- Lou Reed overlay ----------
function openLou(){
  el.louOverlay.style.display = '';
  el.louOverlay.setAttribute('aria-hidden', 'false');
  el.louOut.innerHTML = '';
  el.louShare.disabled = true;
  el.louCopy.disabled = true;
}
function closeLou(){
  el.louOverlay.style.display = 'none';
  el.louOverlay.setAttribute('aria-hidden', 'true');
}
el.louBtn?.addEventListener('click', () => openLou());
el.louClose?.addEventListener('click', () => closeLou());
el.louBackdrop?.addEventListener('click', () => closeLou());

function setLouMode(mode){
  louMode = mode;
  el.modeWalk.classList.toggle('active', mode === 'walk');
  el.modeCycle.classList.toggle('active', mode === 'cycle');
}
el.modeWalk?.addEventListener('click', () => setLouMode('walk'));
el.modeCycle?.addEventListener('click', () => setLouMode('cycle'));

function timeTodayFromHHMM(hhmm){
  const [hh, mm] = hhmm.split(':').map(n => +n);
  const base = getBaseNow(); // matches Today/Tomorrow
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0);
}

function bestSunWindowForPubInRange(pub, arriveTime, endTime){
  const day = new Date(arriveTime.getFullYear(), arriveTime.getMonth(), arriveTime.getDate(), 12, 0, 0, 0);
  let best = null;

  for (const spot of pub.spots){
    const wins = computeWindowsForDate(pub, spot, day);
    for (const w of wins){
      if (w.end <= arriveTime) continue;

      const start = w.start < arriveTime ? arriveTime : w.start;
      const end = w.end > endTime ? endTime : w.end;
      if (end <= start) continue;

      const waitMin = Math.max(0, minsBetween(arriveTime, start));
      const durMin = Math.max(0, minsBetween(start, end));

      const candidate = { spot, start, end, waitMin, durMin };
      if (!best) best = candidate;
      else {
        if (candidate.waitMin < best.waitMin) best = candidate;
        else if (candidate.waitMin === best.waitMin && candidate.durMin > best.durMin) best = candidate;
      }
    }
  }
  return best;
}

function makeShareText(stops, modeLabel, startTime){
  const lines = [];
  lines.push(`Perfect Day (${modeLabel}) — start ${fmtHM(startTime)}`);
  lines.push('');
  stops.forEach((s, idx) => {
    lines.push(
      `${idx+1}. ${s.pub.name} — arrive ${fmtHM(s.arrive)} | sun ${fmtHM(s.start)}–${fmtHM(s.leave)} | spot: ${s.spot?.name || '—'}`
    );
    lines.push(`   ${directionsUrl(s.pub)}`);
  });
  return lines.join('\n');
}

async function buildPerfectDayPlan(){
  if (!PUBS.length){
    el.louOut.innerHTML = `<div class="mini">Data not loaded yet.</div>`;
    return;
  }

  const startTime = timeTodayFromHHMM(el.louStart.value || '12:00');
  const stopCount = parseInt(el.louStops.value || '5', 10);
  const planEnd = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate(), PERFECT_DAY.endHourLocal, 0, 0, 0);

  const baseStartLoc = userLoc || NOTTINGHAM_CENTER;
  let currentLoc = { ...baseStartLoc };
  let t = new Date(startTime);
  const visited = new Set();

  // Candidate pubs: must be open at start time if hours are known
  const pubsForPlan = PUBS.filter(p => shouldIncludePub(p, startTime));

  const wxData = await runWithConcurrency(pubsForPlan, 4, async (p) => {
    try { return { id: p.id, data: await getWeather(p.lat, p.lng) }; }
    catch { return { id: p.id, data: null }; }
  });
  const wxById = new Map(wxData.map(x => [x.id, x.data]));

  function weatherLike(pub, time){
    const data = wxById.get(pub.id);
    if (!data) return null;
    const i = nearestHourlyIndex(data.hourly.time, time);
    const cloud = data.hourly.cloud_cover[i];
    const rain = data.hourly.precipitation_probability[i];
    return weatherLikelihood(cloud, rain);
  }

  function maxHopKm(){ return louMode === 'cycle' ? PERFECT_DAY.cycleMaxKm : PERFECT_DAY.walkMaxKm; }

  const out = [];

  for (let i=0; i<stopCount; i++){
    if (t >= planEnd) break;

    const candidates = pubsForPlan
      .filter(p => !visited.has(p.id))
      .map(p => {
        const km = haversineKm(currentLoc, { lat: p.lat, lng: p.lng });
        const travelMin = louMode === 'cycle' ? cycleMinutesFromKm(km) : walkMinutesFromKm(km);
        return { pub: p, km, travelMin };
      })
      .filter(x => x.km <= maxHopKm())
      .slice(0, 70);

    let bestPick = null;

    for (const c of candidates){
      const arrive = addMinutes(t, c.travelMin);
      if (arrive >= planEnd) continue;

      // if opening hours known and closed on arrival, skip
      const openState = isOpenAt(c.pub, arrive);
      if (openState.known && !openState.open) continue;

      const win = bestSunWindowForPubInRange(c.pub, arrive, planEnd);
      if (!win) continue;
      if (win.waitMin > PERFECT_DAY.maxWaitMin) continue;

      const like = weatherLike(c.pub, win.start);
      const weatherPenalty = (like === 'bad') ? 50 : (like === 'mixed') ? 10 : 0;

      const wideBonus = (louMode === 'cycle') ? cycleWideBonus(c.pub) : 0;

      const score =
        (win.waitMin * 3) +
        (c.travelMin * 1.5) +
        weatherPenalty -
        (win.durMin * 2) -
        wideBonus;

      if (!bestPick || score < bestPick.score){
        bestPick = { ...c, win, score, like };
      }
    }

    if (!bestPick) break;

    const arrive = addMinutes(t, bestPick.travelMin);
    const start = bestPick.win.start;
    const endMaxStay = addMinutes(start, PERFECT_DAY.maxStopMin);
    const endMinStay = addMinutes(start, PERFECT_DAY.minStopMin);

    let leave = bestPick.win.end;
    leave = (leave > endMaxStay) ? endMaxStay : leave;
    // allow shorter than min stay if sun window is short
    if (leave <= start) break;

    out.push({
      pub: bestPick.pub,
      km: bestPick.km,
      travelMin: bestPick.travelMin,
      arrive,
      start,
      leave,
      spot: bestPick.win.spot,
      weatherLike: bestPick.like || 'unknown'
    });

    visited.add(bestPick.pub.id);
    currentLoc = { lat: bestPick.pub.lat, lng: bestPick.pub.lng };
    t = addMinutes(leave, PERFECT_DAY.bufferMin);
  }

  if (!out.length){
    el.louOut.innerHTML = `<div class="mini">No workable sun-led route found (try cycling mode or a different start).</div>`;
    el.louShare.disabled = true;
    el.louCopy.disabled = true;
    return;
  }

  const modeLabel = louMode === 'cycle' ? 'Cycling' : 'Walking';
  const shareText = makeShareText(out, modeLabel, startTime);

  // enable share/copy
  el.louShare.disabled = false;
  el.louCopy.disabled = false;

  el.louShare.onclick = async () => {
    try{
      if (navigator.share){
        await navigator.share({ title:'Perfect Day', text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
      }
    } catch {}
  };

  el.louCopy.onclick = async () => {
    try{
      await navigator.clipboard.writeText(shareText);
      el.louCopy.textContent = 'Copied ✓';
      setTimeout(() => (el.louCopy.textContent = 'Copy'), 1200);
    } catch {}
  };

  el.louOut.innerHTML = `
    <div class="bigCard">
      <div class="bigTitle">${escapeHtml(modeLabel)} Perfect Day</div>
      <div class="mini">Start ${escapeHtml(fmtHM(startTime))} • Stops ${out.length}</div>
    </div>
    ${out.map((s, idx) => {
      const gmaps = directionsUrl(s.pub);
      const travelLabel = louMode === 'cycle' ? 'cycle' : 'walk';
      const wx =
        s.weatherLike === 'good' ? '☀️ likely' :
        s.weatherLike === 'mixed' ? '⛅ mixed' :
        s.weatherLike === 'bad' ? '☁️ sun unlikely' : '—';
      const openTxt = openLine(s.pub, s.arrive);

      return `
        <div class="card">
          <div class="cardTop">
            <div>
              <div class="cardTitle">${idx+1}. ${escapeHtml(s.pub.name)}</div>
              <div class="cardSub">${escapeHtml(fmtHM(s.arrive))} arrive • ${escapeHtml(fmtHM(s.start))} sun • ${escapeHtml(fmtHM(s.leave))} leave</div>
            </div>
            <span class="badge next">${escapeHtml(wx)}</span>
          </div>
          <div class="mini">Sit: ${escapeHtml(s.spot?.name || '—')}</div>
          ${openTxt ? `<div class="mini">${escapeHtml(openTxt)}</div>` : ``}
          <div class="mini">${escapeHtml(s.travelMin)} min ${escapeHtml(travelLabel)} • ${escapeHtml(s.km.toFixed(1))} km</div>
          <div class="cardActions">
            <button class="smallBtn" type="button" data-gmaps="${escapeHtml(gmaps)}">Directions</button>
            <button class="smallBtn" type="button" data-map="${escapeHtml(s.pub.id)}">Map</button>
          </div>
        </div>
      `;
    }).join('')}
  `;

  el.louOut.querySelectorAll('[data-gmaps]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(btn.getAttribute('data-gmaps'), '_blank', 'noopener');
    });
  });
  el.louOut.querySelectorAll('[data-map]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-map');
      const pub = PUBS.find(p => p.id === id);
      if (!pub) return;
      closeLou();
      setView('map');
      initMapOnce();
      openPubOnMap(pub);
    });
  });
}

el.louBuild?.addEventListener('click', () => {
  el.louOut.innerHTML = `<div class="mini">Building plan…</div>`;
  el.louShare.disabled = true;
  el.louCopy.disabled = true;
  buildPerfectDayPlan().catch(() => {
    el.louOut.innerHTML = `<div class="mini">Could not build plan.</div>`;
  });
});

// ---------- CSV loading + calibration conversion ----------
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

function makeLocalDateTimeOnCalibration(hhmm){
  const [hh, mm] = hhmm.split(':').map(n => +n);
  return new Date(CALIBRATION_DATE.y, CALIBRATION_DATE.m - 1, CALIBRATION_DATE.d, hh, mm, 0, 0);
}

function buildCalForSpot(pubLat, pubLng, sunIn, sunOut, profileTimesHHMM){
  const inT = toTimeHHMM(sunIn);
  const outT = toTimeHHMM(sunOut);
  if (!inT || !outT) return { valid:false };

  const dtIn = makeLocalDateTimeOnCalibration(inT);
  const dtOut = makeLocalDateTimeOnCalibration(outT);

  const pIn = sunBearingAltitude(dtIn, pubLat, pubLng);
  const pOut = sunBearingAltitude(dtOut, pubLat, pubLng);

  // Optional profile points: times that sit on the same edge; convert each to (az,alt)
  const profilePoints = [];
  for (const t of (profileTimesHHMM || [])){
    const tt = toTimeHHMM(t);
    if (!tt) continue;
    const dt = makeLocalDateTimeOnCalibration(tt);
    const p = sunBearingAltitude(dt, pubLat, pubLng);
    profilePoints.push({ az: p.bearing, alt: p.alt });
  }

  // Always include in/out as endpoints for profile mode if any profile points exist
  let points = null;
  if (profilePoints.length){
    points = [{ az: pIn.bearing, alt: pIn.alt }, ...profilePoints, { az: pOut.bearing, alt: pOut.alt }];
  }

  return {
    valid:true,
    azIn: pIn.bearing,
    altIn: pIn.alt,
    azOut: pOut.bearing,
    altOut: pOut.alt,
    inTime: inT,
    outTime: outT,
    profilePoints: points
  };
}

function getField(rec, ...names){
  for (const n of names){
    if (rec[n] !== undefined && rec[n] !== null && String(rec[n]).trim() !== '') return rec[n];
  }
  return '';
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

    // opening/closing if present
    const openingTime = getField(r, 'Opening Time', 'Opening', 'Open', 'Opens');
    const closingTime = getField(r, 'Closing Time', 'Closing', 'Close', 'Closes');

    const spots = [];
    function profileCols(letter){
      // Support up to 6 profile points: "Spot A Profile 1" .. "Spot A Profile 6"
      const arr = [];
      for (let i=1;i<=6;i++){
        const v = r[`Spot ${letter} Profile ${i}`];
        if (v !== undefined && String(v).trim() !== '') arr.push(v);
      }
      return arr;
    }

    function addSpot(letter){
      const type = String(r[`Spot ${letter} Type`] || '').trim();
      const detail = String(r[`Spot ${letter} Detail`] || '').trim();
      const sunIn = r[`Spot ${letter} Sun In`];
      const sunOut = r[`Spot ${letter} Sun Out`];
      if (!type && !detail) return;
      if (!sunIn || !sunOut) return;

      const name = detail ? `${type} — ${detail}` : type;
      const cal = buildCalForSpot(lat, lng, sunIn, sunOut, profileCols(letter));
      if (cal && cal.valid) spots.push({ name, type, detail, cal });
    }

    addSpot('A'); addSpot('B'); addSpot('C');

    return {
      id,
      name: String(r['Pub Name']||'').trim(),
      area: String(r['Address']||'').trim(),
      lat, lng,
      openingTime: String(openingTime||'').trim(),
      closingTime: String(closingTime||'').trim(),
      spots
    };
  })
  .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  .filter(p => p.spots.length > 0);
}

// ---------- Boot ----------
async function boot(){
  // initial UI state
  setView(viewMode);
  setDayMode(dayMode);
  setFavOnly(favOnly);

  try{
    const csvText = await loadCsvText();
    PUBS = csvToPubs(csvText);

    if (viewMode === 'map') initMapOnce();

    render();
    setInterval(() => render(), 60 * 1000);
  } catch {
    el.plan.innerHTML = `
      <div class="bigCard bad">
        <div class="bigTitle">Data load failed</div>
        <div class="mini">Ensure the CSV is at <strong>public/data/DrinkingintheSunData.csv</strong>.</div>
      </div>
    `;
  }
}
boot();
