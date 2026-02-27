/* Drinking in the Sun — demo app
   - Sunrise/sunset + sun position: SunCalc-style math (no external libs)
   - Sun windows: checks when sun azimuth is within each spot’s azimuth range + altitude threshold
   - Map: Leaflet + OSM tiles; “Directions” link uses Google Maps (no API key)
*/

const DEFAULT_MAP_CENTER = { lat: 52.9536, lng: -1.15047 }; // Nottingham

// New pubs + Bread & Bitter use verified lat/lng.
// If you add more pubs: easiest is Doogal “ShowMap?postcode=...” or Mapcarta (OSM).
const pubs = [
  // Existing demo pubs can stay here even without pins (lat/lng null).
  // Add lat/lng when you have them.
  { id: 'angel', name: 'The Angel Microbrewery', area: 'Nottingham (Hockley / City)', lat: null, lng: null,
    spots: [{ name: 'Front window', azFrom: 120, azTo: 230, altMin: 5 }]
  },
  { id: 'canalhouse', name: 'The Canalhouse', area: 'Nottingham (Canal)', lat: null, lng: null,
    spots: [{ name: 'Outside by canal', azFrom: 100, azTo: 260, altMin: 5 }]
  },
  { id: 'trip', name: 'Ye Olde Trip to Jerusalem', area: 'Castle / Standard Hill', lat: null, lng: null,
    spots: [{ name: 'Front benches', azFrom: 140, azTo: 260, altMin: 7 }]
  },
  { id: 'maltcross', name: 'Malt Cross', area: "St James' Street", lat: null, lng: null,
    spots: [{ name: 'Front (street) side', azFrom: 120, azTo: 220, altMin: 7 }]
  },
  { id: 'bell', name: 'The Bell Inn', area: 'Old Market Square', lat: null, lng: null,
    spots: [{ name: 'Angel Row frontage', azFrom: 110, azTo: 230, altMin: 6 }]
  },

  // Added pubs (verified lat/lng)
  { id: 'bread', name: 'The Bread & Bitter', area: 'Mapperley (Woodthorpe Drive)', lat: 52.98389, lng: -1.12296,
    spots: [
      { name: 'Front / patio', azFrom: 110, azTo: 250, altMin: 6 },
      { name: 'Beer garden', azFrom: 140, azTo: 280, altMin: 6 }
    ]
  },
  { id: 'bunkers', name: 'Bunkers Hill', area: 'Hockley', lat: 52.953558, lng: -1.140387,
    spots: [{ name: 'Outside tables', azFrom: 120, azTo: 240, altMin: 6 }]
  },
  { id: 'barreldrop', name: 'The Barrel Drop', area: "Hurts Yard (City Centre)", lat: 52.954355, lng: -1.152503,
    spots: [{ name: 'Doorway / alley sun', azFrom: 150, azTo: 230, altMin: 12 }]
  },
  { id: 'organ', name: 'The Organ Grinder', area: 'Canning Circus', lat: 52.956499, lng: -1.163208,
    spots: [{ name: 'Roof terrace', azFrom: 130, azTo: 290, altMin: 6 }]
  },
  { id: 'sirjohn', name: 'The Sir John Borlase Warren', area: 'Canning Circus', lat: 52.95584, lng: -1.162804,
    spots: [{ name: 'Beer garden', azFrom: 120, azTo: 280, altMin: 6 }]
  },
  { id: 'handheart', name: 'The Hand & Heart', area: 'Derby Road', lat: 52.955444, lng: -1.160222,
    spots: [{ name: 'Outside steps', azFrom: 120, azTo: 240, altMin: 8 }]
  },
  { id: 'keans', name: "Kean's Head", area: 'Lace Market', lat: 52.951346, lng: -1.144033,
    spots: [{ name: 'Front pavement', azFrom: 110, azTo: 230, altMin: 7 }]
  },
  { id: 'poacher', name: 'The Lincolnshire Poacher', area: 'Mansfield Road', lat: 52.962096, lng: -1.15128,
    spots: [{ name: 'Outside (street side)', azFrom: 100, azTo: 230, altMin: 7 }]
  },
  { id: 'nedludd', name: 'The Ned Ludd', area: 'Friar Lane', lat: 52.952316, lng: -1.151471,
    spots: [{ name: 'Front windows', azFrom: 110, azTo: 230, altMin: 7 }]
  },
  { id: 'josephelse', name: 'The Joseph Else', area: 'Market Square', lat: 52.952901, lng: -1.150254,
    spots: [{ name: 'Upstairs windows', azFrom: 120, azTo: 240, altMin: 6 }]
  },
  { id: 'salutation', name: 'Ye Olde Salutation Inn', area: 'Maid Marian Way', lat: 52.95112, lng: -1.15167,
    spots: [{ name: 'Front benches', azFrom: 120, azTo: 240, altMin: 6 }]
  },
  { id: 'pit', name: 'The Pit & Pendulum', area: 'Lace Market', lat: 52.9534279, lng: -1.14597,
    spots: [{ name: 'Street-side front', azFrom: 120, azTo: 230, altMin: 7 }]
  },
  { id: 'bathinn', name: 'Bath Inn', area: 'Lace Market', lat: 52.95539, lng: -1.13773,
    spots: [{ name: 'Outside tables', azFrom: 110, azTo: 250, altMin: 6 }]
  },
  { id: 'embankment', name: 'The Embankment', area: 'Arkwright Street', lat: 52.9393944, lng: -1.1388205,
    spots: [{ name: 'Beer garden', azFrom: 120, azTo: 280, altMin: 6 }]
  },
  { id: 'trentnav', name: 'Trent Navigation', area: 'Meadow Lane', lat: 52.9412, lng: -1.13824,
    spots: [{ name: 'Riverside seating', azFrom: 110, azTo: 260, altMin: 6 }]
  }
];

// ---------- PWA install prompt handling (fixes the DevTools warning) ----------
let deferredInstallPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.disabled = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  installBtn.disabled = true;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch {}
  deferredInstallPrompt = null;
});

// ---------- Sun math (SunCalc-style) ----------
const rad = Math.PI / 180;
const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397;
const J0 = 0.0009;

function toJulian(date) { return date.valueOf() / dayMs - 0.5 + J1970; }
function fromJulian(j) { return new Date((j + 0.5 - J1970) * dayMs); }
function toDays(date) { return toJulian(date) - J2000; }

function rightAscension(l, b) {
  return Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
}
function declination(l, b) {
  return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
}
function azimuth(H, phi, dec) {
  return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
}
function altitude(H, phi, dec) {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}
function siderealTime(d, lw) {
  return rad * (280.16 + 360.9856235 * d) - lw;
}
function solarMeanAnomaly(d) {
  return rad * (357.5291 + 0.98560028 * d);
}
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + Math.PI;
}
function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0), M, L };
}
function getSunPosition(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  const az = azimuth(H, phi, c.dec);
  const alt = altitude(H, phi, c.dec);
  // Convert: SunCalc azimuth is from south (0) west-positive -> degrees from north:
  const azDeg = (az / rad + 180 + 360) % 360;
  return { azimuthDeg: azDeg, altitudeDeg: alt / rad };
}

function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * Math.PI)); }
function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * Math.PI) + n; }
function solarTransitJ(ds, M, L) { return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L); }
function hourAngle(h, phi, dec) {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
}
function getSetJ(h, lw, phi, dec, n, M, L) {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}
function getSunTimes(dateAtMidnight, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(dateAtMidnight);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const h0 = rad * -0.833; // standard sunrise/sunset
  const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
  const Jrise = Jnoon - (Jset - Jnoon);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

// ---------- Sun windows ----------
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtTime(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

function inAzRange(azDeg, fromDeg, toDeg) {
  const a = (azDeg + 360) % 360;
  const f = (fromDeg + 360) % 360;
  const t = (toDeg + 360) % 360;
  if (f <= t) return a >= f && a <= t;
  // wrap-around (e.g. 300..40)
  return a >= f || a <= t;
}

function computeWindowsForSpot(dateMidnight, pubLat, pubLng, spot) {
  const times = getSunTimes(dateMidnight, pubLat, pubLng);
  const start = new Date(times.sunrise);
  const end = new Date(times.sunset);
  const stepMin = 5;

  const windows = [];
  let current = null;

  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + stepMin * 60000)) {
    const sp = getSunPosition(t, pubLat, pubLng);
    const ok = sp.altitudeDeg >= (spot.altMin ?? 5) && inAzRange(sp.azimuthDeg, spot.azFrom, spot.azTo);

    if (ok && !current) current = { start: new Date(t), end: new Date(t) };
    if (ok && current) current.end = new Date(t);
    if (!ok && current) { windows.push(current); current = null; }
  }
  if (current) windows.push(current);

  // Format + compress tiny windows
  return windows
    .filter(w => (w.end - w.start) >= 10 * 60000)
    .map(w => ({ start: fmtTime(w.start), end: fmtTime(w.end) }));
}

function computePubSun(dateMidnight, timeOpt, pub) {
  if (pub.lat == null || pub.lng == null) {
    return { sunrise: null, sunset: null, nowStatus: 'No pin yet', spots: pub.spots.map(s => ({ name: s.name, windows: [] })) };
  }

  const times = getSunTimes(dateMidnight, pub.lat, pub.lng);
  const sunrise = fmtTime(times.sunrise);
  const sunset = fmtTime(times.sunset);

  const spots = pub.spots.map(spot => ({
    name: spot.name,
    windows: computeWindowsForSpot(dateMidnight, pub.lat, pub.lng, spot)
  }));

  let nowStatus = 'Time not set';
  if (timeOpt) {
    const now = new Date(dateMidnight);
    now.setHours(timeOpt.hh, timeOpt.mm, 0, 0);
    const sp = getSunPosition(now, pub.lat, pub.lng);
    const inAny = pub.spots.some(spot =>
      sp.altitudeDeg >= (spot.altMin ?? 5) && inAzRange(sp.azimuthDeg, spot.azFrom, spot.azTo)
    );
    nowStatus = inAny ? 'In sun (likely)' : 'Shade now';
  }

  return { sunrise, sunset, nowStatus, spots };
}

// ---------- UI ----------
const controlsEl = document.getElementById('controls');
const metaEl = document.getElementById('meta');
const listEl = document.getElementById('list');
const mainEl = document.querySelector('.main');

let map = null;
let markers = new Map();

function buildControls() {
  const storedDate = localStorage.getItem('ditS_date');
  const storedTime = localStorage.getItem('ditS_time');
  const today = new Date();
  const defaultDate = storedDate || today.toISOString().slice(0, 10);
  const defaultTime = storedTime || `${pad2(today.getHours())}:${pad2(today.getMinutes())}`;

  controlsEl.innerHTML = `
    <div class="controlsRow">
      <div class="field">
        <label>Date</label>
        <input id="dateInput" type="date" value="${defaultDate}">
      </div>

      <div class="field">
        <label>Quick months</label>
        <div class="quickMonths" id="quickMonths">
          ${['Apr','May','Jun','Jul','Aug','Sep'].map(m => `<button class="chip" type="button" data-month="${m}">${m}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <label>Time (optional)</label>
        <input id="timeInput" type="time" value="${defaultTime}">
      </div>

      <div class="field">
        <label>Search</label>
        <input id="searchInput" type="text" placeholder="Name or area...">
      </div>

      <div class="field">
        <label>View</label>
        <div class="toggle" role="tablist" aria-label="View toggle">
          <button id="viewList" class="active" type="button">List</button>
          <button id="viewMap" type="button">Map</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('quickMonths').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-month]');
    if (!btn) return;
    const month = btn.dataset.month;
    const year = new Date(document.getElementById('dateInput').value + 'T00:00:00').getFullYear();
    const monthIndex = { Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8 }[month];
    const d = new Date(Date.UTC(year, monthIndex, 15));
    // keep local date formatting
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    document.getElementById('dateInput').value = local.toISOString().slice(0,10);
    render();
  });

  document.getElementById('dateInput').addEventListener('change', render);
  document.getElementById('timeInput').addEventListener('change', render);
  document.getElementById('searchInput').addEventListener('input', render);

  document.getElementById('viewList').addEventListener('click', () => setMobileView('list'));
  document.getElementById('viewMap').addEventListener('click', () => setMobileView('map'));

  // default on load: show both on desktop; on mobile, show list.
  setMobileView('list', true);
}

function setMobileView(which, init=false) {
  const isMobile = window.matchMedia('(max-width: 980px)').matches;
  const bList = document.getElementById('viewList');
  const bMap = document.getElementById('viewMap');
  bList.classList.toggle('active', which === 'list');
  bMap.classList.toggle('active', which === 'map');

  if (isMobile) {
    mainEl.classList.toggle('hideMap', which === 'list');
    mainEl.classList.toggle('hideList', which === 'map');
  } else {
    mainEl.classList.remove('hideMap', 'hideList');
  }
  if (!init && which === 'map' && map) setTimeout(() => map.invalidateSize(), 150);
}

function initMap() {
  if (!window.L) return; // leaflet not loaded yet
  if (map) return;

  map = L.map('map', { zoomControl: true }).setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function syncMarkers(filteredPubs) {
  if (!map) return;

  const want = new Set(filteredPubs.filter(p => p.lat != null && p.lng != null).map(p => p.id));

  // remove old
  for (const [id, m] of markers.entries()) {
    if (!want.has(id)) {
      map.removeLayer(m);
      markers.delete(id);
    }
  }

  // add new
  for (const p of filteredPubs) {
    if (p.lat == null || p.lng == null) continue;
    if (markers.has(p.id)) continue;

    const m = L.marker([p.lat, p.lng]).addTo(map);
    const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat + ',' + p.lng)}`;
    m.bindPopup(`
      <div style="font-weight:700;margin-bottom:2px;">${escapeHtml(p.name)}</div>
      <div style="color:#777;margin-bottom:6px;">${escapeHtml(p.area || '')}</div>
      <a href="${gmaps}" target="_blank" rel="noopener">Directions</a>
    `);
    markers.set(p.id, m);
  }
}

function focusPubOnMap(pubId) {
  if (!map) return;
  const p = pubs.find(x => x.id === pubId);
  if (!p || p.lat == null || p.lng == null) return;
  map.setView([p.lat, p.lng], 16, { animate: true });
  const m = markers.get(pubId);
  if (m) m.openPopup();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function render() {
  const dateStr = document.getElementById('dateInput').value;
  const timeStr = document.getElementById('timeInput').value;
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  if (dateStr) localStorage.setItem('ditS_date', dateStr);
  if (timeStr) localStorage.setItem('ditS_time', timeStr);

  const dateMidnight = new Date(dateStr + 'T00:00:00');
  const timeOpt = (timeStr && /^\d\d:\d\d$/.test(timeStr))
    ? { hh: Number(timeStr.slice(0,2)), mm: Number(timeStr.slice(3,5)) }
    : null;

  const filtered = pubs
    .filter(p => !q || (p.name + ' ' + (p.area||'')).toLowerCase().includes(q))
    .map(p => ({ pub: p, sun: computePubSun(dateMidnight, timeOpt, p) }));

  // meta line: use city centre sunrise/sunset for the selected day
  const cityTimes = getSunTimes(dateMidnight, DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng);
  metaEl.textContent = `Date: ${dateStr} • Sunrise ~ ${fmtTime(cityTimes.sunrise)} • Sunset ~ ${fmtTime(cityTimes.sunset)}`;

  // sort: in-sun first (if time set), then name
  filtered.sort((a, b) => {
    if (timeOpt) {
      const as = a.sun.nowStatus === 'In sun (likely)' ? 0 : 1;
      const bs = b.sun.nowStatus === 'In sun (likely)' ? 0 : 1;
      if (as !== bs) return as - bs;
    }
    return a.pub.name.localeCompare(b.pub.name);
  });

  // list
  listEl.innerHTML = filtered.map(({ pub, sun }) => {
    const spotsHtml = sun.spots.map(s => {
      const wins = (s.windows && s.windows.length)
        ? s.windows.map(w => `${w.start}–${w.end}`).join(' • ')
        : '—';
      return `<div class="spotRow">
        <div class="spotName">${escapeHtml(s.name)}</div>
        <div class="spotWin">${wins}</div>
      </div>`;
    }).join('');

    const badge = escapeHtml(sun.nowStatus);
    const pinNote = (pub.lat == null || pub.lng == null)
      ? `<div class="small" style="margin-top:8px;">No map pin yet (add lat/lng).</div>`
      : '';

    return `
      <div class="card" data-pub="${escapeHtml(pub.id)}">
        <div class="cardHead">
          <div>
            <div class="cardTitle">${escapeHtml(pub.name)}</div>
            <div class="cardSub">${escapeHtml(pub.area || '')}</div>
          </div>
          <div class="badge">${badge}</div>
        </div>
        <div class="spots">${spotsHtml}</div>
        ${pinNote}
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => focusPubOnMap(card.dataset.pub));
  });

  // map markers
  initMap();
  syncMarkers(filtered.map(x => x.pub));
}

buildControls();
window.addEventListener('resize', () => setMobileView(document.getElementById('viewMap').classList.contains('active') ? 'map' : 'list', true));
setTimeout(render, 50); // allow Leaflet to load
