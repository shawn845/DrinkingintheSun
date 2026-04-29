const CSV_URL = './public/data/pubs.csv';
const FALLBACK_LOCATION = { name: 'Nottingham City Centre', lat: 52.9548, lng: -1.1581 };
const WEATHER_REFRESH_MS = 5 * 60 * 1000;
const METOFFICE_WORKER_URL = 'https://dits-weather.shawn-4d5.workers.dev/weather';
const APP_TIME_ZONE = 'Europe/London';

const ROUTES_URL = './public/data/routes.json';
let CURATED_ROUTES = {};


const state = {
  pubs: [],
  userLocation: null,
  weather: null, // { current: {...}, nextHour: {...} }
  map: null,
  markerLayer: null,
  currentView: 'list',
  modalReturnView: 'list',
  currentDetailPubId: null,
  userMarker: null,
  userAccuracyCircle: null,
  weatherRefreshTimer: null,
  worthTripCycleOnly: false,
  detailRouteMap: null,
  detailRouteLayer: null,
  detailRouteUserMarker: null,
  detailRouteUserAccuracyCircle: null,
  detailRouteWatchId: null,
  fullscreenRouteMap: null,
  fullscreenRouteLayer: null,
  fullscreenRouteUserMarker: null,
  fullscreenRouteUserAccuracyCircle: null,
  fullscreenRouteNav: null,
  fullscreenRoutePubName: '',
  fullscreenRouteLastInstructionKey: '',
  sunRouteMap: null,
  sunRouteLayer: null,
  sunRouteMarkerLayer: null,
  sunRouteCurrentPlan: null
};

const els = {
  btnList: document.getElementById('btnList'),
  btnMap: document.getElementById('btnMap'),
  btnNearMe: document.getElementById('btnNearMe'),
  listView: document.getElementById('listView'),
  mapView: document.getElementById('mapView'),
  rowNearMeWrap: document.getElementById('rowNearMeWrap'),
  rowNearMe: document.getElementById('rowNearMe'),
  rowNearMeMeta: document.getElementById('rowNearMeMeta'),
  rowSunRoutesWrap: null,
  btnLouReed: null,
  btnUsainBolt: null,
  rowSunniest: document.getElementById('rowSunniest'),
  rowSunniestMeta: document.getElementById('rowSunniestMeta'),
  rowWorthTripWrap: null,
  rowWorthTrip: null,
  rowWorthTripMeta: null,
  btnWorthTripCycle: null,
  allList: document.getElementById('allList'),
  allMeta: document.getElementById('allMeta'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalContent: document.getElementById('modalContent'),
  btnClose: document.getElementById('btnClose'),
  weatherBar: document.getElementById('weatherBar'),
  weatherIcon: document.getElementById('weatherIcon'),
  weatherLine: document.getElementById('weatherLine'),
  weatherTitle: document.querySelector('.weatherTitle')
};


let bodyScrollY = 0;

function lockBodyScroll() {
  bodyScrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add('modalOpen');
  document.body.classList.add('modalOpen');
  document.body.style.top = `-${bodyScrollY}px`;
}

function unlockBodyScroll() {
  document.documentElement.classList.remove('modalOpen');
  document.body.classList.remove('modalOpen');
  document.body.style.top = '';
  window.scrollTo(0, bodyScrollY || 0);
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  wireUi();
  ensureSunRoutesRow();
  ensureWorthTripRow();
  await loadRoutes();
  state.pubs = (await loadPubs()).map(enrichPub);
  await refreshWeather(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng);
  renderEverything();
  initMap();
  setRowTitles();
  startWeatherRefresh();
  handleRouteFromHash();
}

async function loadRoutes() {
  try {
    const res = await fetch(ROUTES_URL, { cache: 'no-store' });
    if (!res.ok) {
      CURATED_ROUTES = {};
      return;
    }
    const data = await res.json();
    CURATED_ROUTES = normalizeRoutesData(data);
  } catch (err) {
    console.warn('Route load failed:', err);
    CURATED_ROUTES = {};
  }
}

function normalizeRoutesData(data) {
  if (!data) return {};
  if (Array.isArray(data)) {
    const out = {};
    data.forEach(route => {
      const key = String(route?.id || '').trim();
      if (key) out[key] = route;
    });
    return out;
  }
  if (typeof data === 'object') return data;
  return {};
}

function wireUi() {
  els.btnList.addEventListener('click', () => setView('list'));
  els.btnMap.addEventListener('click', () => setView('map'));
  els.btnNearMe.addEventListener('click', useNearMe);
  els.btnClose.addEventListener('click', () => closeModal(true));

  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) closeModal(true);
  });

  document.addEventListener('click', (e) => {
    if (e.target?.id === 'btnCloseRouteMap') {
      closeExpandedRouteMap();
      return;
    }

    if (e.target?.id === 'routeMapOverlay') {
      closeExpandedRouteMap();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isExpandedRouteMapOpen()) {
        closeExpandedRouteMap();
        return;
      }
      closeModal(true);
    }
  });

  window.addEventListener('popstate', () => {
    handleRouteFromHash();
  });
}


function parseHashRoute() {
  const hash = String(location.hash || '').trim();

  if (hash === '#map') return { type: 'map' };
  if (!hash || hash === '#list') return { type: 'list' };

  const routeMatch = hash.match(/^#route-(lou-reed|usain-bolt)(?:\?(.*))?$/);
  if (routeMatch) {
    const params = new URLSearchParams(routeMatch[2] || '');
    const pubIds = String(params.get('pubs') || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => {
        try { return decodeURIComponent(v); } catch { return v; }
      });

    return {
      type: 'sunRoute',
      mode: routeMatch[1],
      pubIds,
      startIso: params.get('start') || '',
      lengthKey: params.get('length') || ''
    };
  }

  const match = hash.match(/^#pub-(.+)$/);
  if (match) {
    try {
      return { type: 'pub', pubId: decodeURIComponent(match[1]) };
    } catch {
      return { type: 'list' };
    }
  }

  return { type: 'list' };
}

function handleRouteFromHash() {
  const route = parseHashRoute();

  if (route.type === 'sunRoute' && route.mode) {
    openSharedSunRoute(route, false);
    return;
  }

  if (route.type === 'pub' && route.pubId) {
    const exists = state.pubs.find(p => p.id === route.pubId);
    if (exists) {
      openDetail(route.pubId, state.currentView || 'list', false);
      return;
    }
  }

  if (!els.modalOverlay.classList.contains('isHidden')) {
    closeModal(false);
  }

  if (route.type === 'map') setView('map', false);
  else setView('list', false);
}

function setView(view, push = true) {
  state.currentView = view;
  const isList = view === 'list';

  els.listView.classList.toggle('isActive', isList);
  els.mapView.classList.toggle('isActive', !isList);
  els.btnList.classList.toggle('isActive', isList);
  els.btnMap.classList.toggle('isActive', !isList);
  els.btnList.setAttribute('aria-selected', String(isList));
  els.btnMap.setAttribute('aria-selected', String(!isList));

  if (!isList && state.map) setTimeout(() => state.map.invalidateSize(), 80);
  if (push) history.pushState({}, '', isList ? '#list' : '#map');
}

async function useNearMe() {
  if (!navigator.geolocation) {
    state.userLocation = { ...FALLBACK_LOCATION, fallback: true };
    await refreshWeather(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng);
    renderEverything();
    startWeatherRefresh();
    return;
  }

  els.btnNearMe.textContent = 'Locating…';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      state.userLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        name: 'Your location',
        fallback: false
      };

      els.btnNearMe.textContent = 'Near me';
      await refreshWeather(state.userLocation.lat, state.userLocation.lng);
      renderEverything();
      updateUserLocationMarker();
      startWeatherRefresh();

      if (state.map) state.map.setView([state.userLocation.lat, state.userLocation.lng], 13);
    },
    async () => {
      state.userLocation = { ...FALLBACK_LOCATION, fallback: true };
      els.btnNearMe.textContent = 'Near me';
      await refreshWeather(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng);
      renderEverything();
      clearUserLocationMarker();
      startWeatherRefresh();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function startWeatherRefresh() {
  if (state.weatherRefreshTimer) clearInterval(state.weatherRefreshTimer);

  state.weatherRefreshTimer = setInterval(async () => {
    const loc = state.userLocation && !state.userLocation.fallback
      ? state.userLocation
      : FALLBACK_LOCATION;

    await refreshWeather(loc.lat, loc.lng);
    renderEverything();
  }, WEATHER_REFRESH_MS);
}

async function loadPubs() {
  const res = await fetch(CSV_URL);
  const text = await res.text();
  return parseCsv(text).map(normalizeRow).filter(isValidPubRow);
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  let headers = null;
  const rows = [];

  for (const line of lines) {
    const cols = splitCsvLine(line);
    if (!headers) {
      headers = cols.map(v => String(v || '').trim());
      continue;
    }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = String(cols[i] ?? '').trim(); });
    rows.push(obj);
  }

  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }

  out.push(cur);
  return out;
}

function normalizeRow(row) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
  };

  return {
    id: pick('id'),
    name: pick('name'),
    address: pick('address'),
    lat: parseFloat(pick('lat')),
    lng: parseFloat(pick('lng')),
    spotA: pick('spot_a', 'Spot_a'),
    baseDate: pick('base_date'),
    spotAStart: pick('spot_a_sun_start'),
    spotAEnd: pick('spot_a_sun_end'),
    spotAHorizon: pick('spot_a_horizon'),
    spotB: pick('spot_b'),
    spotBStart: pick('spot_b_sun_start'),
    spotBEnd: pick('spot_b_sun_end'),
    spotBHorizon: pick('spot_b_horizon'),
    imageUrl: pick('image_url'),
    spotAPhotoUrl: pick('spot_a_photo_url', 'spot_a_photo', 'spot_a_image_url'),
    spotBPhotoUrl: pick('spot_b_photo_url', 'spot_b_photo', 'spot_b_image_url'),
    notes: pick('notes'),
    worthTheTrip: pick('worth_the_trip'),
    cycleFriendly: pick('cycle_friendly'),
    curatedRouteId: pick('curated_route_id')
  };
}

function hasLegacyWindow(baseDate, start, end) {
  return !!(baseDate && start && end);
}

function hasHorizonProfile(horizonStr) {
  return parseHorizonProfile(horizonStr).length >= 2;
}

function isValidPubRow(pub) {
  const spotAOk =
    pub.spotA &&
    (
      hasHorizonProfile(pub.spotAHorizon) ||
      hasLegacyWindow(pub.baseDate, pub.spotAStart, pub.spotAEnd)
    );

  const spotBOk =
    !pub.spotB ||
    hasHorizonProfile(pub.spotBHorizon) ||
    hasLegacyWindow(pub.baseDate, pub.spotBStart, pub.spotBEnd);

  return !!(
    pub.id &&
    pub.name &&
    Number.isFinite(pub.lat) &&
    Number.isFinite(pub.lng) &&
    spotAOk &&
    spotBOk
  );
}

function enrichPub(pub) {
  const now = new Date();
  const today = formatDate(now);

  const aToday = resolveSpotWindow({
    lat: pub.lat,
    lng: pub.lng,
    baseDate: pub.baseDate,
    startHHMM: pub.spotAStart,
    endHHMM: pub.spotAEnd,
    horizon: pub.spotAHorizon,
    targetDateStr: today
  });

  const bToday = pub.spotB
    ? resolveSpotWindow({
        lat: pub.lat,
        lng: pub.lng,
        baseDate: pub.baseDate,
        startHHMM: pub.spotBStart,
        endHHMM: pub.spotBEnd,
        horizon: pub.spotBHorizon,
        targetDateStr: today
      })
    : [];

  const best = chooseBestWindow(aToday, bToday, now);
  const distanceKm = state.userLocation
    ? haversineKm(state.userLocation.lat, state.userLocation.lng, pub.lat, pub.lng)
    : null;

  return { ...pub, spotAToday: aToday, spotBToday: bToday, bestNow: best, distanceKm };
}

function reEnrichAll() {
  state.pubs = state.pubs.map(enrichPub);
}

function normalizeWindowList(value) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return list
    .filter(w => w && w.start instanceof Date && w.end instanceof Date && w.end > w.start)
    .sort((a, b) => a.start - b.start);
}

function mergeNearbySunWindows(windows, minGapMinutes = 4, minDurationMinutes = 4) {
  const list = normalizeWindowList(windows);
  if (!list.length) return [];

  const merged = [{ start: new Date(list[0].start), end: new Date(list[0].end) }];

  for (let i = 1; i < list.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = list[i];
    const gapMinutes = (curr.start - prev.end) / 60000;

    if (gapMinutes <= minGapMinutes) {
      prev.end = new Date(Math.max(prev.end.getTime(), curr.end.getTime()));
    } else {
      merged.push({ start: new Date(curr.start), end: new Date(curr.end) });
    }
  }

  return merged.filter(w => ((w.end - w.start) / 60000) >= minDurationMinutes);
}

function formatWindowRanges(windows) {
  const list = normalizeWindowList(windows);
  if (!list.length) return 'No sun today';
  return list.map(w => `${fmtTime(w.start)}–${fmtTime(w.end)}`).join(', ');
}

function resolveSpotWindow({ lat, lng, baseDate, startHHMM, endHHMM, horizon, targetDateStr }) {
  if (hasHorizonProfile(horizon)) {
    return getWindowFromHorizon(lat, lng, horizon, targetDateStr);
  }

  if (hasLegacyWindow(baseDate, startHHMM, endHHMM)) {
    const shifted = shiftWindow(lat, lng, baseDate, startHHMM, endHHMM, targetDateStr);
    return shifted ? [shifted] : [];
  }

  return [];
}

function shiftWindow(lat, lng, baseDateStr, startHHMM, endHHMM, targetDateStr) {
  const baseDate = parseISODate(baseDateStr);
  const targetDate = parseISODate(targetDateStr);

  const baseSolar = getSolarTimesLocal(lat, lng, baseDate);
  const targetSolar = getSolarTimesLocal(lat, lng, targetDate);

  if (!baseSolar || !targetSolar) {
    return {
      start: minutesToLocalDate(targetDate, hhmmToMinutes(startHHMM)),
      end: minutesToLocalDate(targetDate, hhmmToMinutes(endHHMM))
    };
  }

  const baseStartMin = hhmmToMinutes(startHHMM);
  const baseEndMin = hhmmToMinutes(endHHMM);

  return {
    start: minutesToLocalDate(targetDate, mapSolarRelative(baseStartMin, baseSolar, targetSolar)),
    end: minutesToLocalDate(targetDate, mapSolarRelative(baseEndMin, baseSolar, targetSolar))
  };
}


function normalizeAzimuth(az) {
  let value = Number(az);
  if (!Number.isFinite(value)) return null;
  value = value % 360;
  if (value < 0) value += 360;
  return value;
}

function parseHorizonProfile(horizonStr) {
  return String(horizonStr || '')
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [azStr, altStr] = part.split(':').map(s => s.trim());
      const az = normalizeAzimuth(azStr);
      const alt = Number(altStr);
      if (!Number.isFinite(az) || !Number.isFinite(alt)) return null;
      return { az, alt };
    })
    .filter(Boolean)
    .sort((a, b) => a.az - b.az);
}

function horizonAltitudeAt(profile, azimuth) {
  const az = normalizeAzimuth(azimuth);
  if (!profile.length || az == null) return Infinity;

  if (az < profile[0].az) return Infinity;

  for (let i = 1; i < profile.length; i++) {
    const prev = profile[i - 1];
    const next = profile[i];

    if (az <= next.az) {
      const span = next.az - prev.az || 1;
      const t = (az - prev.az) / span;
      return prev.alt + ((next.alt - prev.alt) * t);
    }
  }

  return az > profile[profile.length - 1].az ? Infinity : profile[profile.length - 1].alt;
}

function getSunPositionLocal(lat, lng, dateObj) {
  const parts = getLondonDateParts(dateObj);
  const localMinutes = parts.hour + (parts.minute / 60) + (parts.second / 3600);

  const dayDate = createUtcAnchorDate(parts.year, parts.month, parts.day);
  const n = dayOfYear(dayDate);
  const gamma = (2 * Math.PI / 365) * (n - 1 + ((localMinutes - 12) / 24));

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const tzOffsetMin = getLondonOffsetMinutesForDateParts(parts.year, parts.month, parts.day);
  const minutesNow = (parts.hour * 60) + parts.minute + (parts.second / 60);
  const trueSolarTime = (minutesNow + eqTime + (4 * lng) - tzOffsetMin + 1440) % 1440;
  const hourAngleDeg = (trueSolarTime / 4) - 180;
  const hourAngle = deg2rad(hourAngleDeg);
  const latRad = deg2rad(lat);

  const cosZenith =
    (Math.sin(latRad) * Math.sin(decl)) +
    (Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle));

  const zenith = Math.acos(clamp(cosZenith, -1, 1));
  const elevation = 90 - rad2deg(zenith);

  const azimuthRad = Math.atan2(
    Math.sin(hourAngle),
    (Math.cos(hourAngle) * Math.sin(latRad)) - (Math.tan(decl) * Math.cos(latRad))
  );
  const azimuth = (rad2deg(azimuthRad) + 180 + 360) % 360;

  return { azimuth, elevation };
}

function getWindowFromHorizon(lat, lng, horizonStr, targetDateStr) {
  const profile = parseHorizonProfile(horizonStr);
  if (profile.length < 2) return [];

  const targetDate = parseISODate(targetDateStr);
  const stepMinutes = 2;
  const dayStartMinutes = 7 * 60;
  const dayEndMinutes = 23 * 60;

  const windows = [];
  let currentStart = null;

  for (let minutes = dayStartMinutes; minutes <= dayEndMinutes; minutes += stepMinutes) {
    const dt = minutesToLocalDate(targetDate, minutes);
    const sun = getSunPositionLocal(lat, lng, dt);
    const obstructionAlt = horizonAltitudeAt(profile, sun.azimuth);
    const inSun = sun.elevation > obstructionAlt;

    if (inSun && !currentStart) {
      currentStart = new Date(dt);
    }

    if (!inSun && currentStart) {
      windows.push({
        start: new Date(currentStart),
        end: new Date(dt)
      });
      currentStart = null;
    }
  }

  if (currentStart) {
    windows.push({
      start: new Date(currentStart),
      end: minutesToLocalDate(targetDate, dayEndMinutes)
    });
  }

  return mergeNearbySunWindows(windows, 4, 4);
}

function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToLocalDate(dateObj, minutes) {
  const year = dateObj.getUTCFullYear();
  const month = dateObj.getUTCMonth() + 1;
  const day = dateObj.getUTCDate();
  const offsetMinutes = getLondonOffsetMinutesForDateParts(year, month, day);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes, 0, 0) - (offsetMinutes * 60000));
}

function mapSolarRelative(obsMinutes, baseSolar, targetSolar) {
  if (obsMinutes <= baseSolar.noon) {
    const frac = safeFraction(obsMinutes, baseSolar.sunrise, baseSolar.noon);
    return targetSolar.sunrise + frac * (targetSolar.noon - targetSolar.sunrise);
  }

  const frac = safeFraction(obsMinutes, baseSolar.noon, baseSolar.sunset);
  return targetSolar.noon + frac * (targetSolar.sunset - targetSolar.noon);
}

function safeFraction(value, min, max) {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function getSolarTimesLocal(lat, lng, dateObj) {
  const dayNum = dayOfYear(dateObj);
  const gamma = (2 * Math.PI / 365) * (dayNum - 1);

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = deg2rad(lat);
  const zenith = deg2rad(90.833);

  const cosH =
    (Math.cos(zenith) / (Math.cos(latRad) * Math.cos(decl))) -
    Math.tan(latRad) * Math.tan(decl);

  if (cosH < -1 || cosH > 1) return null;

  const hourAngleDeg = rad2deg(Math.acos(cosH));
  const tzHours = getLondonOffsetMinutesForDateParts(
    dateObj.getUTCFullYear(),
    dateObj.getUTCMonth() + 1,
    dateObj.getUTCDate()
  ) / 60;

  const solarNoon = 720 - (4 * lng) - eqTime + (tzHours * 60);
  const sunrise = solarNoon - (hourAngleDeg * 4);
  const sunset = solarNoon + (hourAngleDeg * 4);

  return { sunrise, noon: solarNoon, sunset };
}

function dayOfYear(dateObj) {
  const year = dateObj.getUTCFullYear();
  const current = Date.UTC(year, dateObj.getUTCMonth(), dateObj.getUTCDate(), 12, 0, 0, 0);
  const start = Date.UTC(year, 0, 0, 12, 0, 0, 0);
  return Math.floor((current - start) / 86400000);
}

function lastSundayOfMonthUtc(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function getLondonDstStartUtc(year) {
  const lastSunday = lastSundayOfMonthUtc(year, 2);
  return Date.UTC(year, 2, lastSunday.getUTCDate(), 1, 0, 0, 0);
}

function getLondonDstEndUtc(year) {
  const lastSunday = lastSundayOfMonthUtc(year, 9);
  return Date.UTC(year, 9, lastSunday.getUTCDate(), 1, 0, 0, 0);
}

function isLondonDstAtUtc(utcMs) {
  const probe = new Date(utcMs);
  const year = probe.getUTCFullYear();
  const start = getLondonDstStartUtc(year);
  const end = getLondonDstEndUtc(year);
  return utcMs >= start && utcMs < end;
}

function getLondonOffsetMinutesForDateParts(year, month, day) {
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  return isLondonDstAtUtc(noonUtc) ? 60 : 0;
}

function getLondonDateParts(dateObj) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(dateObj instanceof Date ? dateObj : new Date(dateObj));

  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }

  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second
  };
}

function createUtcAnchorDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function getWindows(pub) {
  return [
    ...normalizeWindowList(pub.spotAToday),
    ...normalizeWindowList(pub.spotBToday)
  ].sort((a, b) => a.start - b.start);
}

function getWindowStats(pub, now) {
  const windows = getWindows(pub).filter(w => w.end > w.start);
  const remaining = windows.filter(w => w.end > now);

  const active = remaining.find(w => now >= w.start && now <= w.end) || null;
  const next = remaining.filter(w => now < w.start).sort((a, b) => a.start - b.start)[0] || null;
  const latestRemainingWindow = remaining.slice().sort((a, b) => b.end - a.end)[0] || null;
  const latestRemainingEnd = latestRemainingWindow ? latestRemainingWindow.end : null;

  return {
    activeWindow: active,
    nextWindow: next,
    latestRemainingEnd,
    latestRemainingWindow
  };
}

function hasRainWords(text = '') {
  return /(rain|drizzle|shower|sleet|snow|hail|thunder)/i.test(String(text || ''));
}

function hasFogWords(text = '') {
  return /(fog|mist|overcast|freezing fog)/i.test(String(text || ''));
}

function weatherMood(currentObj = null, sunTimes = null, atTime = null) {
  const referenceTime = atTime || currentObj?.time || new Date();
  const phase = sunPhaseForWeather(currentObj, sunTimes, referenceTime);
  const isDay = phase === 'day';

  const currentText = String(currentObj?.conditionText || '').trim();
  const precipNow = Number(currentObj?.precip ?? 0);
  const cloudNow = Number(currentObj?.cloudCover ?? 0);
  const combinedText = currentText;

  if (!isDay) {
    if (precipNow >= 0.1 || hasRainWords(combinedText)) {
      return { icon: '🌧️', className: 'night-rainy', tone: 'rainy' };
    }

    if (cloudNow <= 35 && !hasFogWords(combinedText)) {
      return { icon: '🌙', className: 'night-clear', tone: 'cloudy' };
    }

    return { icon: '☁️', className: 'night-cloudy', tone: 'cloudy' };
  }

  if (precipNow >= 0.1 || hasRainWords(combinedText)) {
    return { icon: '🌧️', className: 'rainy', tone: 'rainy' };
  }

  if (!hasFogWords(combinedText) && (/(sunny|clear)/i.test(combinedText) || cloudNow <= 35)) {
    return { icon: '☀️', className: 'sunny', tone: 'sunny' };
  }

  return { icon: '⛅', className: 'cloudy', tone: 'cloudy' };
}

function sunPhaseForWeather(currentObj, sunTimes = null, atTime = new Date()) {
  if (sunTimes?.sunrise instanceof Date && sunTimes?.sunset instanceof Date && !Number.isNaN(sunTimes.sunrise.getTime()) && !Number.isNaN(sunTimes.sunset.getTime())) {
    if (atTime < sunTimes.sunrise) return 'before-sunrise';
    if (atTime >= sunTimes.sunset) return 'after-sunset';
    return 'day';
  }

  return currentObj?.isDay ? 'day' : 'after-sunset';
}

function weatherTitleText(currentObj, sunTimes = null) {
  const phase = sunPhaseForWeather(currentObj, sunTimes, currentObj?.time || new Date());
  if (phase === 'before-sunrise') return 'Current conditions · before sunrise';
  if (phase === 'after-sunset') return 'Current conditions · after sunset';
  return 'Current conditions';
}

function describeWeather(currentObj, sunTimes = null) {
  if (!currentObj) return 'Weather unavailable';

  const phase = sunPhaseForWeather(currentObj, sunTimes, currentObj.time || new Date());
  const mood = weatherMood(currentObj, sunTimes, currentObj.time || new Date());
  const text = String(currentObj.conditionText || '').trim();

  if (phase === 'after-sunset') {
    if (mood.tone === 'rainy') return 'Rain tonight';
    if (/(clear)/i.test(text)) return 'Clear';
    if (/(partly cloudy|cloudy)/i.test(text)) return 'Cloudy';
    return text || 'Cloudy';
  }

  if (phase === 'before-sunrise') {
    if (mood.tone === 'rainy') return 'Rain before sunrise';
    return text || 'Before sunrise';
  }

  if (mood.tone === 'sunny') return 'Sunny';
  if (mood.tone === 'rainy') return 'Rainy';

  if (/(partly cloudy)/i.test(text)) return 'Partly cloudy';
  if (/(cloudy|overcast)/i.test(text)) return 'Cloudy';
  if (/(mist|fog)/i.test(text)) return 'Foggy';
  return text || 'Cloudy';
}

function currentWeatherLabel(currentObj, sunTimes = null) {
  return describeWeather(currentObj, sunTimes);
}

function nextHourLabel(nextObj) {
  if (!nextObj) return 'Unavailable';

  const text = String(nextObj.conditionText || '').trim();
  const precipChance = Number(nextObj.rain ?? 0);
  const isDay = nextObj.isDay !== false;

  if (precipChance >= 65 || hasRainWords(text)) return isDay ? 'Rainy' : 'Rain tonight';
  if (!isDay && /(clear)/i.test(text)) return 'Clear';
  if (/(sunny|clear)/i.test(text) && isDay) return 'Sunny';
  if (/(partly cloudy)/i.test(text)) return 'Partly cloudy';
  if (/(cloudy|overcast)/i.test(text)) return 'Cloudy';
  if (/(mist|fog)/i.test(text)) return 'Foggy';
  return text || 'Unavailable';
}

function getWeatherTone() {
  if (!state.weather || !state.weather.current) return 'cloudy';

  const mood = weatherMood(
    state.weather.current,
    state.weather.sunTimes,
    state.weather.current.time || new Date()
  );

  return mood.tone;
}

function getDisplayStatus(pub) {
  const tone = getWeatherTone();
  const baseState = pub.bestNow.state;

  let top = 'No more sun today';
  let line = pub.bestNow.line;
  let cls = 'statusNone';
  let pin = '#9f9f9f';

  if (baseState === 'sunny') {
    if (tone === 'sunny') {
      top = 'Sunny now';
      cls = 'statusSunBright';
      pin = '#f5c542';
    } else if (tone === 'cloudy') {
      top = 'Cloudy now';
      cls = 'statusSunMuted';
      pin = '#d6b24a';
    } else {
      top = 'Not sunny now';
      cls = 'statusSunRainy';
      pin = '#9f9f9f';
    }
  } else if (baseState === 'shade') {
    if (tone === 'rainy') {
      top = 'Rainy now';
      cls = 'statusSunRainy';
    } else if (tone === 'cloudy') {
      top = 'Cloudy now';
      cls = 'statusShade';
    } else {
      top = 'Not sunny now';
      cls = 'statusShade';
    }
  }

  return { top, line, cls, pin, tone };
}

function buildSpotStateWeatherAware(windowObj, now) {
  const tone = getWeatherTone();
  const windows = normalizeWindowList(windowObj);

  if (!windows.length) {
    return {
      status: 'Finished today',
      line: 'No sun today',
      badge: 'No sun today'
    };
  }

  const active = windows.find(w => now >= w.start && now <= w.end) || null;
  const next = windows.find(w => now < w.start) || null;
  const hadEarlier = windows.some(w => w.end <= now);

  if (active) {
    if (tone === 'sunny') return { status: 'Sunny now', line: `Sun until ${fmtTime(active.end)}`, badge: 'Best now' };
    if (tone === 'cloudy') return { status: 'Cloudy now', line: `Sun until ${fmtTime(active.end)}`, badge: 'Best now' };
    return { status: 'Not sunny now', line: `Sun until ${fmtTime(active.end)}`, badge: 'Best now' };
  }

  if (next) {
    const prefix = hadEarlier ? 'Sun again from' : 'Sun from';
    if (tone === 'rainy') return { status: 'Rainy now', line: `${prefix} ${fmtTime(next.start)}`, badge: 'Later today' };
    if (tone === 'cloudy') return { status: 'Cloudy now', line: `${prefix} ${fmtTime(next.start)}`, badge: 'Later today' };
    return { status: 'Not sunny now', line: `${prefix} ${fmtTime(next.start)}`, badge: 'Later today' };
  }

  return {
    status: 'Finished today',
    line: 'No more sun today',
    badge: 'Finished today'
  };
}

function chooseBestWindow(a, b, now) {
  const candidates = [
    ...normalizeWindowList(a),
    ...normalizeWindowList(b)
  ].sort((x, y) => x.start - y.start);

  if (!candidates.length) {
    return { state: 'none', line: 'No sun today', window: null };
  }

  const active = candidates.find(w => now >= w.start && now <= w.end);
  if (active) {
    return { state: 'sunny', line: `Sun until ${fmtTime(active.end)}`, window: active };
  }

  const upcoming = candidates.find(w => now < w.start) || null;
  if (upcoming) {
    const hadEarlier = candidates.some(w => w.end <= now);
    return {
      state: 'shade',
      line: `${hadEarlier ? 'Sun again from' : 'Sun from'} ${fmtTime(upcoming.start)}`,
      window: upcoming
    };
  }

  return { state: 'none', line: 'No more sun today', window: null };
}

function yesFlag(value) {
  return String(value || '').trim().toLowerCase() === 'yes';
}

function getCuratedRouteForPub(pub) {
  if (!pub) return null;
  return CURATED_ROUTES[pub.curatedRouteId] || CURATED_ROUTES[pub.id] || null;
}

function getRideEstimate(pub, origin = FALLBACK_LOCATION) {
  const curated = getCuratedRouteForPub(pub);

  if (
    curated &&
    origin &&
    Math.abs(origin.lat - FALLBACK_LOCATION.lat) < 0.0001 &&
    Math.abs(origin.lng - FALLBACK_LOCATION.lng) < 0.0001
  ) {
    return {
      km: curated.stats.distanceKm,
      miles: curated.stats.distanceKm * 0.621371,
      minutes: curated.stats.minutesAt18kph,
      shortLabel: `🚲 ${formatRideMinutes(curated.stats.minutesAt18kph)} · ${formatRideMiles(curated.stats.distanceKm * 0.621371)} mi`,
      isCurated: true,
      route: curated
    };
  }

  if (!Number.isFinite(pub.lat) || !Number.isFinite(pub.lng)) return null;
  const crowKm = haversineKm(origin.lat, origin.lng, pub.lat, pub.lng);
  const routeKm = crowKm * 1.22;
  const minutes = (routeKm / 17) * 60;
  const miles = routeKm * 0.621371;

  return {
    km: routeKm,
    miles,
    minutes,
    shortLabel: `🚲 ${formatRideMinutes(minutes)} · ${formatRideMiles(miles)} mi`,
    isCurated: false,
    route: curated
  };
}


function formatRideMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatRideMiles(miles) {
  if (!Number.isFinite(miles)) return '';
  return miles < 10 ? miles.toFixed(1) : String(Math.round(miles));
}

function getTodaySunInfo(pub, now = new Date()) {
  const stats = getWindowStats(pub, now);
  return {
    nowSunny: Boolean(stats.activeWindow),
    nextStart: stats.nextWindow ? stats.nextWindow.start : null,
    latestEnd: stats.latestRemainingEnd || null
  };
}

function getCycleEstimate(pub, origin = FALLBACK_LOCATION) {
  return getRideEstimate(pub, origin);
}

function getWorthTripArrivalSummary(pub, now = new Date()) {
  const ride = getRideEstimate(pub, FALLBACK_LOCATION);
  if (!ride) return null;

  const sun = getTodaySunInfo(pub, now);
  const arrival = new Date(now.getTime() + (ride.minutes * 60000));
  const latestEnd = sun.latestEnd instanceof Date ? sun.latestEnd : null;
  const nextStart = sun.nextStart instanceof Date ? sun.nextStart : null;

  let arrivalText = 'Probably shade by arrival';

  if (latestEnd && arrival < latestEnd) {
    const minsLeft = Math.round((latestEnd - arrival) / 60000);
    if (sun.nowSunny) {
      arrivalText = minsLeft >= 60 ? 'Sunny on arrival' : `${minsLeft} min sun left`;
    } else if (nextStart && arrival < nextStart) {
      arrivalText = 'Sun starts after arrival';
    } else {
      arrivalText = minsLeft >= 60 ? 'Sunny on arrival' : `${minsLeft} min sun left`;
    }
  } else if (nextStart && arrival < nextStart) {
    arrivalText = 'Sun starts after arrival';
  }

  return {
    ride,
    arrival,
    shortLabel: `${ride.shortLabel} · ${arrivalText}`,
    detailLabel: `From city centre: about ${formatRideMinutes(ride.minutes)} by bike each way · arrive about ${fmtTime(arrival)} · ${arrivalText}`
  };
}

function renderCycleBadge(pub) {
  if (!yesFlag(pub.cycleFriendly)) return '';
  return '<span class="miniBadge">🚲 Cycle</span>';
}



const SUN_ROUTE_MODES = {
  'lou-reed': {
    id: 'lou-reed',
    title: 'Lou Reed',
    subtitle: 'A perfect sunny pub day by bike.',
    kicker: 'Perfect day',
    buttonText: 'Build Lou Reed',
    travelMode: 'cycle',
    travelLabel: 'Bike',
    travelVerb: 'Cycle',
    maxStops: 4,
    minStops: 3,
    stopMinutes: 55,
    candidateOriginKm: 34,
    maxSegmentKm: 22,
    upcomingMinutes: 360,
    minSpacingKm: 2.2,
    finishBackToCity: true,
    defaultLength: 'normal',
    defaultStartOffsetMinutes: 120
  },
  'usain-bolt': {
    id: 'usain-bolt',
    title: 'Usain Bolt',
    subtitle: 'Fast city sun chase.',
    kicker: 'Sun sprint',
    buttonText: 'Start Usain Bolt',
    travelMode: 'walk',
    travelLabel: 'Walk',
    travelVerb: 'Walk',
    maxStops: 8,
    minStops: 4,
    stopMinutes: 25,
    candidateOriginKm: 5.2,
    maxSegmentKm: 2.2,
    upcomingMinutes: 120,
    minSpacingKm: 0,
    finishBackToCity: false,
    defaultLength: 'normal',
    defaultStartOffsetMinutes: 0
  }
};

const SUN_ROUTE_LENGTHS = {
  'lou-reed': {
    short: { label: 'Short', maxStops: 3, minStops: 2, stopMinutes: 45 },
    normal: { label: 'Normal', maxStops: 4, minStops: 3, stopMinutes: 55 },
    long: { label: 'Long', maxStops: 5, minStops: 3, stopMinutes: 65 }
  },
  'usain-bolt': {
    short: { label: 'Short', maxStops: 5, minStops: 3, stopMinutes: 20 },
    normal: { label: 'Normal', maxStops: 8, minStops: 4, stopMinutes: 25 },
    long: { label: 'Long', maxStops: 10, minStops: 5, stopMinutes: 25 }
  }
};

function getSunRouteConfig(modeId, lengthKey = '') {
  const base = SUN_ROUTE_MODES[modeId] || SUN_ROUTE_MODES['usain-bolt'];
  const lengths = SUN_ROUTE_LENGTHS[base.id] || {};
  const safeLengthKey = lengths[lengthKey] ? lengthKey : (base.defaultLength || 'normal');
  return {
    ...base,
    ...(lengths[safeLengthKey] || {}),
    lengthKey: safeLengthKey,
    lengthLabel: (lengths[safeLengthKey] || {}).label || 'Normal'
  };
}

function ensureSunRoutesRow() {
  if (els.rowSunRoutesWrap || !els.listView) return;

  const wrap = document.createElement('section');
  wrap.className = 'sunRoutesWrap';
  wrap.id = 'rowSunRoutesWrap';
  wrap.innerHTML = `
    <div class="rowHeader">
      <h2 class="rowTitle">Sunny routes</h2>
      <div class="rowMeta">Built from live sun windows</div>
    </div>
    <div class="sunRouteModeGrid" role="list">
      <button class="sunRouteModeCard louReed" id="btnLouReed" type="button" role="listitem">
        <span class="sunRouteModeKicker">Perfect day</span>
        <span class="sunRouteModeTitle">Lou Reed</span>
        <span class="sunRouteModeText">Sunny pub day by bike.</span>
      </button>
      <button class="sunRouteModeCard usainBolt" id="btnUsainBolt" type="button" role="listitem">
        <span class="sunRouteModeKicker">Sun sprint</span>
        <span class="sunRouteModeTitle">Usain Bolt</span>
        <span class="sunRouteModeText">Fast city sun chase.</span>
      </button>
    </div>
  `;

  els.listView.insertBefore(wrap, els.listView.firstElementChild);
  els.rowSunRoutesWrap = wrap;
  els.btnLouReed = wrap.querySelector('#btnLouReed');
  els.btnUsainBolt = wrap.querySelector('#btnUsainBolt');

  els.btnLouReed.addEventListener('click', () => openSunRouteMode('lou-reed'));
  els.btnUsainBolt.addEventListener('click', () => openSunRouteMode('usain-bolt'));
}

async function openSunRouteMode(modeId, push = true) {
  const config = getSunRouteConfig(modeId);
  if (!config) return;

  const btn = modeId === 'lou-reed' ? els.btnLouReed : els.btnUsainBolt;
  const originalText = btn ? btn.querySelector('.sunRouteModeKicker')?.textContent : '';

  if (btn) {
    btn.disabled = true;
    const kicker = btn.querySelector('.sunRouteModeKicker');
    if (kicker) kicker.textContent = 'Building route…';
  }

  try {
    const origin = await getAdaptiveRouteOrigin();
    reEnrichAll();
    const config = getSunRouteConfig(modeId);
    const startTime = getDefaultSunRouteStartTime(config);
    const plan = generateSunRoutePlan(modeId, startTime, origin, config.lengthKey);
    openSunRoutePlan(plan, push);
  } finally {
    if (btn) {
      btn.disabled = false;
      const kicker = btn.querySelector('.sunRouteModeKicker');
      if (kicker && originalText) kicker.textContent = originalText;
    }
  }
}

function getRouteOriginNow() {
  if (state.userLocation && !state.userLocation.fallback) {
    return {
      lat: state.userLocation.lat,
      lng: state.userLocation.lng,
      name: 'your location',
      fallback: false
    };
  }

  return {
    ...FALLBACK_LOCATION,
    name: FALLBACK_LOCATION.name,
    fallback: true
  };
}

function getAdaptiveRouteOrigin() {
  if (state.userLocation && !state.userLocation.fallback) {
    return Promise.resolve(getRouteOriginNow());
  }

  if (!navigator.geolocation) {
    state.userLocation = { ...FALLBACK_LOCATION, fallback: true };
    return Promise.resolve(getRouteOriginNow());
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        state.userLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          name: 'Your location',
          fallback: false
        };

        try {
          await refreshWeather(state.userLocation.lat, state.userLocation.lng);
        } catch {}

        renderEverything();
        updateUserLocationMarker();

        if (state.map) {
          state.map.setView([state.userLocation.lat, state.userLocation.lng], 13);
        }

        resolve(getRouteOriginNow());
      },
      () => {
        state.userLocation = { ...FALLBACK_LOCATION, fallback: true };
        renderEverything();
        resolve(getRouteOriginNow());
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  });
}


function getDefaultSunRouteStartTime(config) {
  const now = new Date();
  const offset = Number(config?.defaultStartOffsetMinutes || 0);
  const start = new Date(now.getTime() + offset * 60000);
  return roundDateToNextQuarter(start);
}

function roundDateToNextQuarter(dateObj) {
  const d = new Date(dateObj instanceof Date ? dateObj : new Date());
  const mins = d.getMinutes();
  const add = (15 - (mins % 15)) % 15;
  d.setMinutes(mins + add, 0, 0);
  return d;
}

function formatTimeInputValue(dateObj) {
  return fmtTime(dateObj instanceof Date ? dateObj : new Date());
}

function dateWithTimeInputValue(value, fallbackDate = new Date()) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  const baseParts = getLondonDateParts(fallbackDate instanceof Date ? fallbackDate : new Date());
  const hours = match ? clamp(Number(match[1]), 0, 23) : baseParts.hour;
  const minutes = match ? clamp(Number(match[2]), 0, 59) : baseParts.minute;
  const dateAnchor = createUtcAnchorDate(baseParts.year, baseParts.month, baseParts.day);
  return minutesToLocalDate(dateAnchor, (hours * 60) + minutes);
}

function getSunRouteFinishPoint(config, origin = null) {
  if (!config?.finishBackToCity) return null;
  return {
    ...FALLBACK_LOCATION,
    name: FALLBACK_LOCATION.name,
    isRouteFinish: true
  };
}

function openSharedSunRoute(route, push = false) {
  const config = getSunRouteConfig(route.mode, route.lengthKey);
  if (!config) return;

  const pubs = route.pubIds
    .map(id => state.pubs.find(pub => pub.id === id))
    .filter(Boolean);

  if (!pubs.length) {
    setView('list', false);
    return;
  }

  const startTime = route.startIso ? new Date(route.startIso) : new Date();
  const safeStartTime = Number.isNaN(startTime.getTime()) ? new Date() : startTime;
  const origin = getRouteOriginNow();
  const plan = buildSunRoutePlanFromPubs(route.mode, pubs, safeStartTime, origin, true, config.lengthKey);
  openSunRoutePlan(plan, push);
}

function openSunRoutePlan(plan, push = true) {
  if (!plan) return;

  state.modalReturnView = state.currentView || 'list';
  state.sunRouteCurrentPlan = plan;

  renderSunRouteModal(plan);
  lockBodyScroll();
  els.modalOverlay.classList.remove('isHidden');

  if (push) {
    history.pushState({ sunRoute: plan.mode.id }, '', sunRouteShareHash(plan));
  }
}

function generateSunRoutePlan(modeId, startTime = new Date(), origin = getRouteOriginNow(), lengthKey = '') {
  const config = getSunRouteConfig(modeId, lengthKey);
  const selected = [];
  let currentPoint = origin;
  let currentTime = new Date(startTime);
  let totalKm = 0;

  const initialCandidates = getSunRouteCandidates(config, origin, startTime);
  const candidatePool = initialCandidates.length
    ? initialCandidates
    : state.pubs.filter(pub => Number.isFinite(pub.lat) && Number.isFinite(pub.lng));

  for (let i = 0; i < config.maxStops; i++) {
    const next = chooseNextSunRouteStop({
      config,
      selected,
      pool: candidatePool,
      currentPoint,
      currentTime,
      origin,
      stopIndex: i
    });

    if (!next) break;

    selected.push(next);
    totalKm += next.travelKm || 0;
    currentPoint = next.pub;
    currentTime = new Date(next.departAt);
  }

  if (selected.length < config.minStops) {
    const fallbackPlan = buildFallbackSunRoute(config, startTime, origin, selected, candidatePool);
    if (fallbackPlan.length > selected.length) {
      return buildSunRoutePlanFromStops(config.id, fallbackPlan, startTime, origin, false, config.lengthKey);
    }
  }

  return buildSunRoutePlanFromStops(config.id, selected, startTime, origin, false, config.lengthKey);
}

function getSunRouteCandidates(config, origin, startTime) {
  const now = new Date(startTime);

  return state.pubs
    .filter(pub => Number.isFinite(pub.lat) && Number.isFinite(pub.lng))
    .filter(pub => {
      const originKm = routeDistanceKm(origin, pub, config.travelMode);
      if (config.id === 'usain-bolt' && originKm > config.candidateOriginKm) return false;

      if (config.id === 'lou-reed') {
        const cycleOrWorth = yesFlag(pub.cycleFriendly) || yesFlag(pub.worthTheTrip);
        if (!cycleOrWorth && originKm > 12) return false;
        if (originKm > config.candidateOriginKm) return false;
      }

      const opportunity = getSunOpportunityForArrival(pub, now, config.stopMinutes, config.upcomingMinutes);
      return opportunity.score > 0;
    });
}

function chooseNextSunRouteStop({ config, selected, pool, currentPoint, currentTime, origin, stopIndex }) {
  const selectedIds = new Set(selected.map(item => item.pub.id));
  let best = null;

  for (const pub of pool) {
    if (selectedIds.has(pub.id)) continue;

    const travelKm = routeDistanceKm(currentPoint, pub, config.travelMode);
    const travelMinutes = travelMinutesForKm(travelKm, config.travelMode);

    if (stopIndex > 0 && travelKm > config.maxSegmentKm) continue;
    if (stopIndex === 0 && config.id === 'usain-bolt' && travelKm > config.candidateOriginKm) continue;

    const arriveAt = new Date(currentTime.getTime() + travelMinutes * 60000);
    const opportunity = getSunOpportunityForArrival(pub, arriveAt, config.stopMinutes, config.upcomingMinutes);
    if (opportunity.score <= 0) continue;

    const departAt = new Date(arriveAt.getTime() + config.stopMinutes * 60000);
    const originKm = routeDistanceKm(origin, pub, config.travelMode);
    const cityKm = routeDistanceKm(FALLBACK_LOCATION, pub, config.travelMode);
    const returnKm = routeDistanceKm(pub, FALLBACK_LOCATION, config.travelMode);
    const nearestSelectedKm = selected.length
      ? Math.min(...selected.map(item => routeDistanceKm(item.pub, pub, config.travelMode)))
      : Infinity;

    let score = opportunity.score;

    if (config.id === 'lou-reed') {
      score += yesFlag(pub.worthTheTrip) ? 34 : 0;
      score += yesFlag(pub.cycleFriendly) ? 26 : 0;
      score -= travelMinutes * 0.32;
      score -= originKm * 0.18;

      if (Number.isFinite(nearestSelectedKm) && nearestSelectedKm < config.minSpacingKm) {
        score -= (config.minSpacingKm - nearestSelectedKm) * 34;
      }

      if (stopIndex === 0) {
        score += Math.min(cityKm, 14) * 0.85;
      } else if (stopIndex >= Math.max(1, config.maxStops - 2)) {
        score -= returnKm * 1.05;
      }
    } else {
      score += pub.bestNow?.state === 'sunny' ? 28 : 0;
      score -= travelMinutes * 2.4;
      score -= travelKm * 8;
      if (stopIndex > 0 && travelKm > 1.4) score -= 24;
    }

    if (!best || score > best.score) {
      best = {
        pub,
        score,
        travelKm,
        travelMinutes,
        arriveAt,
        departAt,
        opportunity
      };
    }
  }

  return best;
}

function buildFallbackSunRoute(config, startTime, origin, alreadySelected, pool) {
  const selectedIds = new Set(alreadySelected.map(item => item.pub.id));
  const items = [...alreadySelected];
  let currentPoint = items.length ? items[items.length - 1].pub : origin;
  let currentTime = items.length ? new Date(items[items.length - 1].departAt) : new Date(startTime);

  const ranked = pool
    .filter(pub => !selectedIds.has(pub.id))
    .map(pub => {
      const originKm = routeDistanceKm(origin, pub, config.travelMode);
      const opportunity = getSunOpportunityForArrival(pub, startTime, config.stopMinutes, config.upcomingMinutes * 1.5);
      let score = opportunity.score - originKm;
      if (config.id === 'lou-reed') {
        const nearestSelectedKm = alreadySelected.length
          ? Math.min(...alreadySelected.map(item => routeDistanceKm(item.pub, pub, config.travelMode)))
          : Infinity;
        score += yesFlag(pub.worthTheTrip) ? 25 : 0;
        score += yesFlag(pub.cycleFriendly) ? 20 : 0;
        score += Math.min(routeDistanceKm(FALLBACK_LOCATION, pub, config.travelMode), 12) * 0.45;
        if (Number.isFinite(nearestSelectedKm) && nearestSelectedKm < config.minSpacingKm) {
          score -= (config.minSpacingKm - nearestSelectedKm) * 26;
        }
      } else {
        score += pub.bestNow?.state === 'sunny' ? 20 : 0;
      }
      return { pub, score };
    })
    .sort((a, b) => b.score - a.score);

  for (const item of ranked) {
    if (items.length >= config.maxStops) break;
    const travelKm = routeDistanceKm(currentPoint, item.pub, config.travelMode);
    const travelMinutes = travelMinutesForKm(travelKm, config.travelMode);
    const arriveAt = new Date(currentTime.getTime() + travelMinutes * 60000);
    const opportunity = getSunOpportunityForArrival(item.pub, arriveAt, config.stopMinutes, config.upcomingMinutes * 1.5);
    const departAt = new Date(arriveAt.getTime() + config.stopMinutes * 60000);

    items.push({
      pub: item.pub,
      score: item.score,
      travelKm,
      travelMinutes,
      arriveAt,
      departAt,
      opportunity
    });

    selectedIds.add(item.pub.id);
    currentPoint = item.pub;
    currentTime = departAt;
  }

  return items;
}

function buildSunRoutePlanFromPubs(modeId, pubs, startTime, origin, isShared = false, lengthKey = '') {
  const config = getSunRouteConfig(modeId, lengthKey);
  const stops = [];
  let currentPoint = origin;
  let currentTime = new Date(startTime);

  pubs.forEach(pub => {
    const travelKm = routeDistanceKm(currentPoint, pub, config.travelMode);
    const travelMinutes = travelMinutesForKm(travelKm, config.travelMode);
    const arriveAt = new Date(currentTime.getTime() + travelMinutes * 60000);
    const opportunity = getSunOpportunityForArrival(pub, arriveAt, config.stopMinutes, config.upcomingMinutes * 1.5);
    const departAt = new Date(arriveAt.getTime() + config.stopMinutes * 60000);

    stops.push({
      pub,
      score: opportunity.score,
      travelKm,
      travelMinutes,
      arriveAt,
      departAt,
      opportunity
    });

    currentPoint = pub;
    currentTime = departAt;
  });

  return buildSunRoutePlanFromStops(config.id, stops, startTime, origin, isShared, config.lengthKey);
}

function buildSunRoutePlanFromStops(modeId, stops, startTime, origin, isShared = false, lengthKey = '') {
  const config = getSunRouteConfig(modeId, lengthKey);
  const finishPoint = getSunRouteFinishPoint(config, origin);
  const lastStop = stops.length ? stops[stops.length - 1] : null;
  const returnKm = finishPoint && lastStop ? routeDistanceKm(lastStop.pub, finishPoint, config.travelMode) : 0;
  const returnMinutes = finishPoint && lastStop ? travelMinutesForKm(returnKm, config.travelMode) : 0;
  const stopsKm = stops.reduce((sum, stop) => sum + (stop.travelKm || 0), 0);
  const totalKm = stopsKm + returnKm;
  const lastDepart = stops.length ? stops[stops.length - 1].departAt : startTime;
  const finishAt = returnMinutes ? new Date(lastDepart.getTime() + returnMinutes * 60000) : lastDepart;
  const totalMinutes = stops.length
    ? Math.max(0, (finishAt - startTime) / 60000)
    : 0;

  return {
    mode: config,
    stops,
    startTime: new Date(startTime),
    generatedAt: new Date(),
    origin,
    finishPoint,
    returnKm,
    returnMinutes,
    finishAt,
    totalKm,
    totalMinutes,
    isShared
  };
}

function routeDistanceKm(a, b, mode = 'walk') {
  if (!a || !b) return 0;
  const crowKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const factor = mode === 'cycle' ? 1.22 : 1.28;
  return crowKm * factor;
}

function travelMinutesForKm(km, mode = 'walk') {
  const speedKph = mode === 'cycle' ? 17 : 4.8;
  return (km / speedKph) * 60;
}

function getSunOpportunityForArrival(pub, arrivalAt, stayMinutes = 30, upcomingMinutes = 120) {
  const windows = getWindows(pub).filter(window => window.end > arrivalAt);
  const stayEnd = new Date(arrivalAt.getTime() + stayMinutes * 60000);
  let best = {
    score: 0,
    label: 'No useful sun then',
    line: 'No useful sun then',
    badge: 'Maybe shade',
    window: null,
    waitMinutes: null,
    usableMinutes: 0,
    state: 'none'
  };

  for (const window of windows) {
    const waitMinutes = Math.max(0, (window.start - arrivalAt) / 60000);
    if (waitMinutes > upcomingMinutes) continue;

    const usableStart = arrivalAt > window.start ? arrivalAt : window.start;
    const usableEnd = stayEnd < window.end ? stayEnd : window.end;
    const usableMinutes = Math.max(0, (usableEnd - usableStart) / 60000);
    const remainingMinutes = Math.max(0, (window.end - arrivalAt) / 60000);

    let score = 0;
    let label = '';
    let line = '';
    let badge = '';
    let state = '';

    if (arrivalAt >= window.start && arrivalAt < window.end) {
      score = 110 + Math.min(remainingMinutes, 120) + Math.min(usableMinutes, stayMinutes);
      label = `Sunny on arrival`;
      line = `Sun until ${fmtTime(window.end)}`;
      badge = 'Best fit';
      state = 'active';
    } else {
      score = 72 - (waitMinutes * 0.85) + Math.min((window.end - window.start) / 60000, 100) * 0.18;
      label = waitMinutes <= 12 ? 'Sun starts just after arrival' : `Sun from ${fmtTime(window.start)}`;
      line = `Sun ${fmtTime(window.start)}–${fmtTime(window.end)}`;
      badge = waitMinutes <= 30 ? 'Good timing' : 'Later';
      state = 'upcoming';
    }

    if (score > best.score) {
      best = {
        score,
        label,
        line,
        badge,
        window,
        waitMinutes,
        usableMinutes,
        state
      };
    }
  }

  return best;
}

function renderSunRouteModal(plan) {
  destroySunRoutePlanMap();

  const config = plan.mode;
  const hasStops = plan.stops.length > 0;
  const locationText = plan.origin?.fallback
    ? `Using ${plan.origin.name || FALLBACK_LOCATION.name}`
    : 'Using your location';
  const generatedText = `Built for ${fmtTime(plan.startTime)} today`;
  const finishText = plan.finishPoint
    ? `Finish: ${plan.finishPoint.name || FALLBACK_LOCATION.name}`
    : 'Finish: final pub';
  const routeLabel = `${plan.stops.length} stops · ${plan.totalKm.toFixed(1)} km · about ${formatRideMinutes(plan.totalMinutes)}`;
  const routeEmptyText = config.id === 'lou-reed'
    ? 'Not enough useful sunny cycling stops are available for that start time.'
    : 'Not enough useful sunny city-centre stops are available for that start time.';

  els.modalContent.innerHTML = `
    <section class="sunRoutePlan">
      <div class="sunRoutePlanHero ${config.id === 'lou-reed' ? 'louReed' : 'usainBolt'}">
        <div class="sunRoutePlanKicker">${escapeHtml(config.kicker)}</div>
        <h2 class="sunRoutePlanTitle">${escapeHtml(config.title)}</h2>
        <p class="sunRoutePlanSubtitle">${escapeHtml(config.subtitle)}</p>
      </div>

      <div class="sunRoutePlanBody">
        <div class="sunRouteSummary">
          <span>${escapeHtml(routeLabel)}</span>
          <span>${escapeHtml(config.travelLabel)}</span>
          <span>${escapeHtml(config.lengthLabel)}</span>
          <span>${escapeHtml(locationText)}</span>
          <span>${escapeHtml(finishText)}</span>
        </div>

        <div class="sunRouteControls" aria-label="Route controls">
          <label class="sunRouteControlField">
            <span>Start time</span>
            <input id="sunRouteStartTime" type="time" value="${escapeAttr(formatTimeInputValue(plan.startTime))}" />
          </label>
          <div class="sunRouteLengthControl" aria-label="Route length">
            ${renderSunRouteLengthButtons(config)}
          </div>
          <button class="pillBtn sunRouteRebuildBtn" type="button" id="btnRebuildSunRoute">Rebuild route</button>
        </div>

        <div class="sunRouteGenerated">${escapeHtml(generatedText)}. ${plan.isShared ? 'Shared route.' : 'Generated from the selected start time and sun windows.'}</div>

        <div class="detailActions sunRouteActions">
          <button class="pillBtn" type="button" id="btnShareSunRoute" ${hasStops ? '' : 'disabled'}>Share route</button>
          ${hasStops ? `<a class="pillBtn" href="${escapeAttr(mapsSunRouteHref(plan))}" target="_blank" rel="noopener">Open in Maps</a>` : ''}
        </div>

        ${hasStops ? `<div class="sunRouteMap" id="sunRoutePlanMap" aria-label="${escapeAttr(config.title)} map"></div>` : ''}

        ${hasStops ? renderSunRouteStops(plan) : `<div class="emptyState">${escapeHtml(routeEmptyText)} Try changing the start time or route length.</div>`}

        ${hasStops && plan.finishPoint ? renderSunRouteFinish(plan) : ''}

        <div class="sunRouteFootnote">Routes are suggestions, not opening-hours guarantees. Check the pub before making a long trip.</div>
      </div>
    </section>
  `;

  bindSunRouteControls(plan);

  const shareBtn = document.getElementById('btnShareSunRoute');
  if (shareBtn) shareBtn.addEventListener('click', () => shareSunRoute(plan));

  if (hasStops) {
    requestAnimationFrame(() => initSunRoutePlanMap(plan));
  }
}

function renderSunRouteLengthButtons(config) {
  const lengths = SUN_ROUTE_LENGTHS[config.id] || {};
  return Object.entries(lengths).map(([key, item]) => `
    <button class="sunRouteLengthBtn ${key === config.lengthKey ? 'isActive' : ''}" type="button" data-length="${escapeAttr(key)}" aria-pressed="${key === config.lengthKey ? 'true' : 'false'}">${escapeHtml(item.label)}</button>
  `).join('');
}

function bindSunRouteControls(plan) {
  const timeInput = document.getElementById('sunRouteStartTime');
  const rebuildBtn = document.getElementById('btnRebuildSunRoute');
  const lengthButtons = Array.from(document.querySelectorAll('.sunRouteLengthBtn'));
  let selectedLength = plan.mode.lengthKey || plan.mode.defaultLength || 'normal';

  lengthButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedLength = btn.dataset.length || selectedLength;
      lengthButtons.forEach(item => {
        const active = item === btn;
        item.classList.toggle('isActive', active);
        item.setAttribute('aria-pressed', String(active));
      });
    });
  });

  if (!rebuildBtn) return;
  rebuildBtn.addEventListener('click', () => {
    const nextStart = dateWithTimeInputValue(timeInput?.value, plan.startTime || new Date());
    reEnrichAll();
    const nextPlan = generateSunRoutePlan(plan.mode.id, nextStart, plan.origin || getRouteOriginNow(), selectedLength);
    openSunRoutePlan(nextPlan, true);
  });
}

function renderSunRouteFinish(plan) {
  const lastStop = plan.stops[plan.stops.length - 1];
  if (!lastStop || !plan.finishPoint) return '';

  return `
    <div class="sunRouteFinishCard">
      <span class="sunRouteFinishDot">↩</span>
      <span>
        <strong>Finish back in ${escapeHtml(plan.finishPoint.name || FALLBACK_LOCATION.name)}</strong>
        <em>${escapeHtml(plan.mode.travelVerb)} back after the last stop · ${escapeHtml(formatRideMinutes(plan.returnMinutes))} · ${escapeHtml(plan.returnKm.toFixed(1))} km · about ${escapeHtml(fmtTime(plan.finishAt))}</em>
      </span>
    </div>
  `;
}

function renderSunRouteStops(plan) {
  return `
    <ol class="sunRouteStopList">
      ${plan.stops.map((stop, index) => renderSunRouteStop(plan, stop, index)).join('')}
    </ol>
  `;
}

function renderSunRouteStop(plan, stop, index) {
  const travelText = index === 0
    ? `${plan.mode.travelVerb} from ${plan.origin?.fallback ? 'city centre' : 'your location'}`
    : `${plan.mode.travelVerb} from previous stop`;

  const distanceText = `${formatRideMinutes(stop.travelMinutes)} · ${stop.travelKm.toFixed(1)} km`;
  const badges = [];
  if (yesFlag(stop.pub.cycleFriendly)) badges.push('🚲 Cycle');
  if (yesFlag(stop.pub.worthTheTrip)) badges.push('Worth the trip');

  return `
    <li class="sunRouteStop">
      <button class="sunRouteStopButton" type="button" onclick="openDetail('${escapeAttr(stop.pub.id)}', 'list')">
        <span class="sunRouteStopNumber">${index + 1}</span>
        <span class="sunRouteStopMain">
          <span class="sunRouteStopName">${escapeHtml(stop.pub.name)}</span>
          <span class="sunRouteStopMeta">${escapeHtml(travelText)} · ${escapeHtml(distanceText)}</span>
          <span class="sunRouteStopSun">${escapeHtml(fmtTime(stop.arriveAt))} arrival · ${escapeHtml(stop.opportunity.line)}</span>
          ${badges.length ? `<span class="sunRouteStopBadges">${badges.map(b => `<span>${escapeHtml(b)}</span>`).join('')}</span>` : ''}
        </span>
        <span class="sunRouteStopBadge">${escapeHtml(stop.opportunity.badge)}</span>
      </button>
    </li>
  `;
}

function initSunRoutePlanMap(plan) {
  const mapEl = document.getElementById('sunRoutePlanMap');
  if (!mapEl || !plan?.stops?.length || !window.L) return;

  destroySunRoutePlanMap();

  state.sunRouteMap = L.map(mapEl, {
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.sunRouteMap);

  const points = [
    [plan.origin.lat, plan.origin.lng],
    ...plan.stops.map(stop => [stop.pub.lat, stop.pub.lng]),
    ...(plan.finishPoint ? [[plan.finishPoint.lat, plan.finishPoint.lng]] : [])
  ];

  state.sunRouteLayer = L.polyline(points, {
    color: '#d6b24a',
    weight: 5,
    opacity: 0.95,
    dashArray: '7 8'
  }).addTo(state.sunRouteMap);

  state.sunRouteMarkerLayer = L.layerGroup().addTo(state.sunRouteMap);

  L.circleMarker(points[0], {
    radius: 7,
    color: '#2f2f2f',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(state.sunRouteMarkerLayer).bindTooltip(plan.origin?.fallback ? FALLBACK_LOCATION.name : 'Start', { direction: 'top' });

  plan.stops.forEach((stop, index) => {
    L.circleMarker([stop.pub.lat, stop.pub.lng], {
      radius: 9,
      color: '#2f2f2f',
      weight: 2,
      fillColor: '#f5c542',
      fillOpacity: 1
    }).addTo(state.sunRouteMarkerLayer).bindTooltip(`${index + 1}. ${stop.pub.name}`, { direction: 'top' });
  });

  if (plan.finishPoint) {
    L.circleMarker([plan.finishPoint.lat, plan.finishPoint.lng], {
      radius: 7,
      color: '#2f2f2f',
      weight: 2,
      fillColor: '#ffffff',
      fillOpacity: 1
    }).addTo(state.sunRouteMarkerLayer).bindTooltip('Finish: Nottingham city centre', { direction: 'top' });
  }

  state.sunRouteMap.fitBounds(state.sunRouteLayer.getBounds(), { padding: [18, 18] });
  setTimeout(() => state.sunRouteMap && state.sunRouteMap.invalidateSize(), 120);
}

function destroySunRoutePlanMap() {
  if (state.sunRouteMap) {
    state.sunRouteMap.remove();
    state.sunRouteMap = null;
    state.sunRouteLayer = null;
    state.sunRouteMarkerLayer = null;
  }
}

function sunRouteShareHash(plan) {
  const params = new URLSearchParams();
  params.set('pubs', plan.stops.map(stop => encodeURIComponent(stop.pub.id)).join(','));
  params.set('start', plan.startTime.toISOString());
  params.set('length', plan.mode.lengthKey || 'normal');
  return `#route-${plan.mode.id}?${params.toString()}`;
}

function sunRouteShareUrl(plan) {
  const url = new URL(window.location.href);
  url.hash = sunRouteShareHash(plan);
  return url.toString();
}

function shareTextForSunRoute(plan) {
  const title = plan.mode.id === 'lou-reed'
    ? 'Lou Reed sunny pub route'
    : 'Usain Bolt sunny pub route';
  const stops = plan.stops.map(stop => stop.pub.name).join(' → ');
  return `${title}: ${stops}`;
}

async function shareSunRoute(plan) {
  if (!plan || !plan.stops.length) return;

  const url = sunRouteShareUrl(plan);
  const text = shareTextForSunRoute(plan);

  if (navigator.share) {
    try {
      await navigator.share({
        title: plan.mode.title,
        text,
        url
      });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }

  try {
    await copyText(url);
    showShareToast('Route link copied');
  } catch (err) {
    showShareToast('Could not copy route link');
  }
}

function mapsSunRouteHref(plan) {
  if (!plan?.stops?.length) return '#';

  const origin = `${plan.origin.lat},${plan.origin.lng}`;
  const destinationStop = plan.stops[plan.stops.length - 1];
  const destination = plan.finishPoint
    ? `${plan.finishPoint.lat},${plan.finishPoint.lng}`
    : `${destinationStop.pub.lat},${destinationStop.pub.lng}`;
  const waypointStops = plan.finishPoint ? plan.stops : plan.stops.slice(0, -1);
  const waypoints = waypointStops
    .map(stop => `${stop.pub.lat},${stop.pub.lng}`)
    .join('|');

  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('origin', origin);
  params.set('destination', destination);
  if (waypoints) params.set('waypoints', waypoints);
  params.set('travelmode', plan.mode.travelMode === 'cycle' ? 'bicycling' : 'walking');

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}


function ensureWorthTripRow() {
  if (els.rowWorthTripWrap) return;
  const anchorWrap = els.rowSunniest ? els.rowSunniest.closest('.rowWrap') : null;
  if (!anchorWrap || !anchorWrap.parentNode) return;

  const wrap = document.createElement('section');
  wrap.className = 'rowWrap isHidden';
  wrap.id = 'rowWorthTripWrap';
  wrap.innerHTML = `
    <div class="rowHeader">
      <h2 class="rowTitle">Worth the trip</h2>
      <div class="rowHeaderActions">
        <div class="rowMeta" id="rowWorthTripMeta">From city centre</div>
        <button class="filterChip" id="btnWorthTripCycle" type="button" aria-pressed="false">🚲 Cycle</button>
      </div>
    </div>
    <div class="hScroll" id="rowWorthTrip"></div>
  `;

  anchorWrap.insertAdjacentElement('afterend', wrap);
  els.rowWorthTripWrap = wrap;
  els.rowWorthTrip = wrap.querySelector('#rowWorthTrip');
  els.rowWorthTripMeta = wrap.querySelector('#rowWorthTripMeta');
  els.btnWorthTripCycle = wrap.querySelector('#btnWorthTripCycle');

  els.btnWorthTripCycle.addEventListener('click', () => {
    state.worthTripCycleOnly = !state.worthTripCycleOnly;
    els.btnWorthTripCycle.classList.toggle('isActive', state.worthTripCycleOnly);
    els.btnWorthTripCycle.setAttribute('aria-pressed', String(state.worthTripCycleOnly));
    renderWorthTripRow();
  });
}

function renderWorthTripRow() {
  if (!els.rowWorthTripWrap || !els.rowWorthTrip || !els.rowWorthTripMeta || !els.btnWorthTripCycle) return;

  const allWorthTrip = state.pubs.filter(pub => yesFlag(pub.worthTheTrip));
  if (!allWorthTrip.length) {
    els.rowWorthTripWrap.classList.add('isHidden');
    return;
  }

  els.rowWorthTripWrap.classList.remove('isHidden');
  els.btnWorthTripCycle.classList.toggle('isActive', state.worthTripCycleOnly);
  els.btnWorthTripCycle.setAttribute('aria-pressed', String(state.worthTripCycleOnly));

  const pubs = allWorthTrip
    .filter(pub => !state.worthTripCycleOnly || yesFlag(pub.cycleFriendly))
    .map(pub => ({ pub, estimate: getCycleEstimate(pub, FALLBACK_LOCATION) }))
    .sort((a, b) => (a.estimate?.minutes ?? Infinity) - (b.estimate?.minutes ?? Infinity))
    .slice(0, 10);

  els.rowWorthTrip.innerHTML = '';

  if (!pubs.length) {
    els.rowWorthTrip.innerHTML = '<div class="emptyState">No worth-the-trip pubs match the cycle filter yet.</div>';
    els.rowWorthTripMeta.textContent = 'Cycle-friendly only';
    return;
  }

  pubs.forEach(({ pub }) => {
    const arrivalInfo = getWorthTripArrivalSummary(pub);
    els.rowWorthTrip.appendChild(createCard(pub, true, {
      extraBadgesHtml: renderCycleBadge(pub),
      extraMetaHtml: arrivalInfo ? escapeHtml(arrivalInfo.shortLabel) : ''
    }));
  });

  els.rowWorthTripMeta.textContent = state.worthTripCycleOnly ? 'Cycle-friendly only · from city centre' : 'From city centre';
}

function renderEverything() {
  reEnrichAll();
  setRowTitles();
  renderSunniestNearMeRow();
  renderLatestSunTodayRow();
  renderWorthTripRow();
  renderAllList();
  renderMapMarkers();
}

function setRowTitles() {
  try {
    const nearTitle = els.rowNearMeWrap.querySelector('.rowTitle');
    if (nearTitle) nearTitle.textContent = 'Sunniest near me';

    const latestWrap = els.rowSunniest.closest('.rowWrap');
    const latestTitle = latestWrap ? latestWrap.querySelector('.rowTitle') : null;
    if (latestTitle) latestTitle.textContent = 'Latest sun today';

    const worthTitle = els.rowWorthTripWrap ? els.rowWorthTripWrap.querySelector('.rowTitle') : null;
    if (worthTitle) worthTitle.textContent = 'Worth the trip';
  } catch {}
}

function renderSunniestNearMeRow() {
  if (!state.userLocation) {
    els.rowNearMeWrap.classList.add('isHidden');
    return;
  }

  els.rowNearMeWrap.classList.remove('isHidden');
  const now = new Date();

  const pubs = [...state.pubs]
    .map(p => {
      const dist = haversineKm(state.userLocation.lat, state.userLocation.lng, p.lat, p.lng);
      const stats = getWindowStats(p, now);
      const remainingMins = (stats.activeWindow ? (stats.activeWindow.end - now) : 0) / 60000;
      return { ...p, distanceKm: dist, _remainingMins: remainingMins };
    })
    .filter(p => p.bestNow.state === 'sunny')
    .sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return b._remainingMins - a._remainingMins;
    })
    .slice(0, 10);

  els.rowNearMe.innerHTML = '';

  if (!pubs.length) {
    els.rowNearMe.innerHTML = '<div class="emptyState">No pubs are currently in a sun window near you.</div>';
    els.rowNearMeMeta.textContent = state.userLocation.fallback ? 'Using city centre' : '';
    return;
  }

  pubs.forEach(pub => els.rowNearMe.appendChild(createCard(pub, true)));
  els.rowNearMeMeta.textContent = state.userLocation.fallback ? 'Using city centre' : 'Closest options';
}

function renderLatestSunTodayRow() {
  const now = new Date();

  const pubs = [...state.pubs]
    .map(p => {
      const stats = getWindowStats(p, now);
      return { pub: p, latestEnd: stats.latestRemainingEnd };
    })
    .filter(x => x.latestEnd)
    .sort((a, b) => b.latestEnd - a.latestEnd)
    .slice(0, 10);

  els.rowSunniest.innerHTML = '';

  if (!pubs.length) {
    els.rowSunniest.innerHTML = '<div class="emptyState">No more sun windows remaining today.</div>';
    els.rowSunniestMeta.textContent = '';
    return;
  }

  pubs.forEach(x => els.rowSunniest.appendChild(createCard(x.pub, true)));
  els.rowSunniestMeta.textContent = pubs[0].latestEnd ? `Latest ends ${fmtTime(pubs[0].latestEnd)}` : '';
}

function renderAllList() {
  const pubs = [...state.pubs].sort(compareForMainList);
  els.allList.innerHTML = '';
  pubs.forEach(pub => els.allList.appendChild(createCard(pub, false)));
  els.allMeta.textContent = `${pubs.length} pubs`;
}

function compareForMainList(a, b) {
  const now = new Date();
  const rank = p => p.bestNow.state === 'sunny' ? 0 : p.bestNow.state === 'shade' ? 1 : 2;
  const ar = rank(a), br = rank(b);
  if (ar !== br) return ar - br;

  if (a.bestNow.state === 'sunny' && b.bestNow.state === 'sunny') {
    return (b.bestNow.window.end - now) - (a.bestNow.window.end - now);
  }

  if (a.bestNow.state === 'shade' && b.bestNow.state === 'shade') {
    return a.bestNow.window.start - b.bestNow.window.start;
  }

  return a.name.localeCompare(b.name);
}

function createCard(pub, small = false, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = `card ${small ? 'cardSmall' : ''}`;

  const display = getDisplayStatus(pub);
  const distanceText = state.userLocation
    ? `${(pub.distanceKm ?? haversineKm(state.userLocation.lat, state.userLocation.lng, pub.lat, pub.lng)).toFixed(1)} km`
    : '';

  const extraBadgesHtml = options.extraBadgesHtml || '';
  const extraMetaHtml = options.extraMetaHtml || '';

  wrap.innerHTML = `
    <button class="cardButton" type="button" aria-label="Open ${escapeHtml(pub.name)} details">
      <img class="cardImg" loading="lazy" src="${escapeAttr(pub.imageUrl || '')}" alt="${escapeAttr(pub.name)}" onerror="this.style.display='none';" />
      <div class="cardBody">
        ${extraBadgesHtml ? `<div class="cardBadges">${extraBadgesHtml}</div>` : ''}
        <h3 class="cardTitle">${escapeHtml(pub.name)}</h3>
        <div class="cardMeta">
          <div class="statusBlock">
            <div class="statusLine">${escapeHtml(display.line)}</div>
          </div>

          <div class="metaRight">
            <div class="${display.cls}">
              <div class="statusTop">${escapeHtml(display.top)}</div>
            </div>
            ${state.userLocation ? `<div class="dist">${distanceText}</div>` : ''}
          </div>
        </div>
        ${extraMetaHtml ? `<div class="rideLine">${extraMetaHtml}</div>` : ''}
      </div>
    </button>
  `;

  wrap.querySelector('.cardButton').addEventListener('click', () => openDetail(pub.id, state.currentView));
  return wrap;
}


function getDetailGalleryItems(pub) {
  const seen = new Set();
  const items = [];

  const pushItem = (url, kind, label) => {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    items.push({ url: cleanUrl, kind, label });
  };

  pushItem(pub.imageUrl, 'pub', pub.name);
  pushItem(pub.spotAPhotoUrl, 'spot', pub.spotA || 'Spot A');
  pushItem(pub.spotBPhotoUrl, 'spot', pub.spotB || 'Spot B');

  return items;
}

function renderDetailGallery(pub) {
  const items = getDetailGalleryItems(pub);
  if (!items.length) return '';

  if (items.length === 1) {
    const item = items[0];
    return `
      <div class="detailGallerySingle">
        <img class="heroImg" src="${escapeAttr(item.url)}" alt="${escapeAttr(item.label || pub.name)}" referrerpolicy="no-referrer" onerror="this.style.display='none';" />
        ${item.kind === 'spot' ? `<div class="detailGalleryHint">${escapeHtml(item.label || '')}</div>` : ''}
      </div>
    `;
  }

  return `
    <div class="detailGalleryWrap">
      <div class="detailGallery" aria-label="Pub photos">
        ${items.map(item => `
          <figure class="detailSlide">
            <img class="heroImg" src="${escapeAttr(item.url)}" alt="${escapeAttr(item.label || pub.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.detailSlide').style.display='none';" />
            ${item.kind === 'spot' ? `<figcaption class="detailGalleryHint">${escapeHtml(item.label || '')}</figcaption>` : ''}
          </figure>
        `).join('')}
      </div>
      <div class="detailGalleryDots" aria-hidden="true">
        ${items.map((_, index) => `<span class="detailDot ${index === 0 ? 'isActive' : ''}"></span>`).join('')}
      </div>
    </div>
  `;
}

function openDetail(pubId, sourceView = 'list', push = true) {
  destroySunRoutePlanMap();
  state.sunRouteCurrentPlan = null;
  state.modalReturnView = sourceView || state.currentView;
  if (state.currentView === 'map') setView('list', false);

  const pub = state.pubs.find(p => p.id === pubId);
  if (!pub) return;

  state.currentDetailPubId = pubId;

  const now = new Date();
  const curatedRoute = getCuratedRouteForPub(pub);
  const aState = buildSpotStateWeatherAware(pub.spotAToday, now);
  const bState = pub.spotB && pub.spotBToday ? buildSpotStateWeatherAware(pub.spotBToday, now) : null;
  const detailBadges = [];
  if (yesFlag(pub.worthTheTrip)) detailBadges.push('<span class="detailBadge">Worth the trip</span>');
  if (yesFlag(pub.cycleFriendly)) detailBadges.push('<span class="detailBadge">🚲 Cycle-friendly</span>');
  const worthTripInfo = yesFlag(pub.worthTheTrip) ? getWorthTripArrivalSummary(pub, now) : null;

  els.modalContent.innerHTML = `
    ${renderDetailGallery(pub)}
    <div class="detailBody">
      <h2 class="detailTitle">${escapeHtml(pub.name)}</h2>
      <div class="detailAddress">${escapeHtml(pub.address || '')}</div>
      ${detailBadges.length ? `<div class="detailBadges">${detailBadges.join('')}</div>` : ''}
      ${worthTripInfo ? `<div class="detailTravel">${escapeHtml(worthTripInfo.detailLabel)}</div>` : ''}
      ${pub.notes ? `<div class="detailNotes">${escapeHtml(pub.notes)}</div>` : ''}
      <div class="detailActions">
        <a class="pillBtn" href="${mapsHref(pub.lat, pub.lng, pub.name)}" target="_blank" rel="noopener">Directions</a>
        <button class="pillBtn" type="button" id="btnSharePub">Share</button>
        ${curatedRoute
          ? `<button class="pillBtn" type="button" id="btnRecommendedRide">Recommended ride</button>`
          : yesFlag(pub.cycleFriendly)
            ? `<a class="pillBtn" href="${mapsCycleHref(pub.lat, pub.lng)}" target="_blank" rel="noopener">Cycle there</a>`
            : ''}
      </div>
    </div>
    ${curatedRoute ? renderCuratedRideCard(pub, curatedRoute) : ''}
    <div class="spotList">
      ${renderSpotCard('Location', pub.spotA, pub.spotAToday, aState)}
      ${pub.spotB && normalizeWindowList(pub.spotBToday).length ? renderSpotCard('Location', pub.spotB, pub.spotBToday, bState) : ''}
    </div>
  `;

  lockBodyScroll();
  els.modalOverlay.classList.remove('isHidden');
  bindDetailGalleryDots();
  bindCuratedRide(pub, curatedRoute);
  bindShareButton(pub);

  if (push) {
    history.pushState({ modal: pubId }, '', `#pub-${encodeURIComponent(pubId)}`);
  }
}



function shareUrlForPub(pub) {
  const url = new URL(window.location.href);
  url.hash = `#pub-${encodeURIComponent(pub.id)}`;
  return url.toString();
}

function shareTextForPub(pub) {
  const display = getDisplayStatus(pub);
  const line = display?.line ? ` ${display.line}` : '';
  return `${pub.name}${line} on Drinking in the Sun`;
}

function ensureShareToast() {
  let toast = document.getElementById('shareToast');
  if (toast) return toast;

  const style = document.createElement('style');
  style.textContent = `
    .shareToast {
      position: fixed;
      left: 50%;
      bottom: max(22px, env(safe-area-inset-bottom));
      transform: translateX(-50%) translateY(10px);
      background: rgba(47,47,47,.96);
      color: #fff;
      border-radius: 999px;
      padding: 10px 14px;
      font-size: 14px;
      line-height: 1;
      box-shadow: 0 10px 24px rgba(0,0,0,.18);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease, transform .2s ease;
      z-index: 9999;
    }

    .shareToast.isVisible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;
  document.head.appendChild(style);

  toast = document.createElement('div');
  toast.id = 'shareToast';
  toast.className = 'shareToast';
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);
  return toast;
}

function showShareToast(message) {
  const toast = ensureShareToast();
  toast.textContent = message;
  toast.classList.add('isVisible');
  clearTimeout(showShareToast._timer);
  showShareToast._timer = setTimeout(() => {
    toast.classList.remove('isVisible');
  }, 1800);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'absolute';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

async function sharePub(pub) {
  if (!pub) return;

  const url = shareUrlForPub(pub);
  const text = shareTextForPub(pub);

  if (navigator.share) {
    try {
      await navigator.share({
        title: pub.name,
        text,
        url
      });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }

  try {
    await copyText(url);
    showShareToast('Link copied');
  } catch (err) {
    showShareToast('Could not copy link');
  }
}

function bindShareButton(pub) {
  const btn = document.getElementById('btnSharePub');
  if (!btn) return;
  btn.addEventListener('click', () => sharePub(pub));
}

function renderSpotCard(kicker, name, windowObj, stateObj) {
  const windows = normalizeWindowList(windowObj);
  const baseDate = windows[0]?.start ? new Date(windows[0].start) : new Date();

  const todayStart = new Date(baseDate);
  todayStart.setHours(7, 0, 0, 0);

  const todayEnd = new Date(baseDate);
  todayEnd.setHours(23, 0, 0, 0);

  const spanTotal = todayEnd - todayStart || 1;
  const nowPct = clamp(((new Date() - todayStart) / spanTotal) * 100, 0, 100);

  const sunBlocksHtml = windows.map(window => {
    const leftPct = clamp(((window.start - todayStart) / spanTotal) * 100, 0, 100);
    const widthPct = clamp(((window.end - window.start) / spanTotal) * 100, 0, 100);
    return `<div class="timelineSun" style="left:${leftPct}%; width:${widthPct}%;"></div>`;
  }).join('');

  return `
    <section class="spotCard">
      <div class="spotHead">
        <div>
          <div class="spotKicker">${escapeHtml(kicker)}</div>
          <div class="spotName">${escapeHtml(name)}</div>
        </div>
        <div class="spotBadge">${escapeHtml(stateObj.badge)}</div>
      </div>

      <div class="spotStatus">${escapeHtml(stateObj.status)}</div>
      <div class="spotSub">${escapeHtml(stateObj.line)}</div>

      <div class="timelineWrap">
        <div class="timelineLabels"><span>07:00</span><span>23:00</span></div>
        <div class="timeline">
          ${sunBlocksHtml}
          <div class="timelineNow" style="left:${nowPct}%;"></div>
        </div>
        <div class="timelineNowLabel">now</div>
      </div>

      <div class="spotWindow">Sun today: ${escapeHtml(formatWindowRanges(windows))}</div>
    </section>
  `;
}


function renderCuratedRideCard(pub, route) {
  const ride = route?.stats
    ? {
        km: Number(route.stats.distanceKm) || null,
        minutes: Number(route.stats.minutesAt18kph) || Number(route.stats.minutesAt15kph) || null
      }
    : getRideEstimate(pub, FALLBACK_LOCATION);
  const startLabelRaw = route?.start?.label || 'Nottingham city centre';
  const mapLabel = `From ${startLabelRaw}`;
  const compactStartLabel = /nottingham city centre/i.test(startLabelRaw)
    ? 'From city centre'
    : `From ${startLabelRaw.replace(/^near\s+/i, '')}`;

  return `
    <section class="routeCard isHidden" id="curatedRideCard">
      <div class="routeCardHead">
        <div>
          <div class="routeCardKicker">Recommended ride</div>
          <h3 class="routeCardTitle">${escapeHtml(mapLabel)}</h3>
        </div>
        <div class="routeCardBadge">Curated</div>
      </div>

      <div class="routeMetaRow" aria-label="Recommended ride summary">
        <span class="routeMetaItem routeMetaStrong">${ride ? `${ride.km.toFixed(1)} km` : '—'}</span>
        <span class="routeMetaSeparator" aria-hidden="true">•</span>
        <span class="routeMetaItem routeMetaStrong">${ride ? formatRideMinutes(ride.minutes) : '—'}</span>
        <span class="routeMetaSeparator" aria-hidden="true">•</span>
        <span class="routeMetaItem">${escapeHtml(compactStartLabel)}</span>
      </div>

      <div class="routeNote">This is your hand-picked ride line for ${escapeHtml(pub.name)}. It previews the route inside the app rather than recalculating a generic bike route.</div>
      <div class="routeMap" id="curatedRideMap" aria-label="Recommended ride map"></div>
      <div class="routeMapActions">
        <button class="pillBtn" type="button" id="btnExpandRouteMap">Open route</button>
      </div>

    </section>
  `;
}

function ensureExpandedRouteMapOverlay() {
  let overlay = document.getElementById('routeMapOverlay');

  if (overlay && overlay.parentElement !== document.body) {
    overlay.remove();
    overlay = null;
  }

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'routeMapOverlay isHidden';
    overlay.id = 'routeMapOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="routeMapOverlayPanel" role="dialog" aria-modal="true" aria-label="Recommended ride map">
        <div class="routeNavBanner" id="routeNavBanner" aria-live="polite">
          <div class="routeNavPrimary" id="routeNavPrimary">Follow the yellow line</div>
          <div class="routeNavSecondary" id="routeNavSecondary">Open Near me to improve live route guidance.</div>
        </div>
        <button class="routeMapClose" type="button" id="btnCloseRouteMap" aria-label="Close expanded map">×</button>
        <div class="routeMapOverlayMap" id="curatedRideMapFullscreen" aria-label="Expanded recommended ride map"></div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeExpandedRouteMap();
    });
    overlay.querySelector('#btnCloseRouteMap')?.addEventListener('click', () => closeExpandedRouteMap());
    document.body.appendChild(overlay);
  }

  return overlay;
}

function bindCuratedRide(pub, route) {
  if (!route) return;

  const btn = document.getElementById('btnRecommendedRide');
  const card = document.getElementById('curatedRideCard');
  if (!btn || !card) return;

  btn.addEventListener('click', () => {
    const willShow = card.classList.contains('isHidden');
    card.classList.toggle('isHidden');

    if (!willShow) {
      closeExpandedRouteMap();
      stopDetailRouteLocationWatch();
      return;
    }

    requestAnimationFrame(() => {
      initCuratedRideMap(pub, route);
      startDetailRouteLocationWatch();
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const expandBtn = document.getElementById('btnExpandRouteMap');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      openExpandedRouteMap(pub, route);
    });
  }
}

function initCuratedRideMap(pub, route) {
  const mapEl = document.getElementById('curatedRideMap');
  if (!mapEl || !route?.map?.encodedPolyline5) return;

  stopDetailRouteLocationWatch();

  if (state.detailRouteMap) {
    state.detailRouteMap.remove();
    state.detailRouteMap = null;
    state.detailRouteLayer = null;
    state.detailRouteUserMarker = null;
    state.detailRouteUserAccuracyCircle = null;
  }

  const routePoints = decodePolyline5(route.map.encodedPolyline5);

  state.detailRouteMap = L.map(mapEl, {
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.detailRouteMap);

  state.detailRouteLayer = L.polyline(routePoints, {
    color: '#d6b24a',
    weight: 5,
    opacity: 0.95
  }).addTo(state.detailRouteMap);

  L.circleMarker([route.start.lat, route.start.lng], {
    radius: 7,
    color: '#2f2f2f',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(state.detailRouteMap).bindTooltip(route.start.label, { direction: 'top' });

  L.circleMarker([pub.lat, pub.lng], {
    radius: 8,
    color: '#2f2f2f',
    weight: 2,
    fillColor: '#f5c542',
    fillOpacity: 1
  }).addTo(state.detailRouteMap).bindTooltip(pub.name, { direction: 'top' });

  const bounds = state.detailRouteLayer.getBounds();
  if (state.userLocation && !state.userLocation.fallback) {
    bounds.extend([state.userLocation.lat, state.userLocation.lng]);
  }

  state.detailRouteMap.fitBounds(bounds, { padding: [18, 18] });
  updateDetailRouteUserMarker();
  setTimeout(() => state.detailRouteMap && state.detailRouteMap.invalidateSize(), 120);
}

function openExpandedRouteMap(pub, route) {
  const overlay = ensureExpandedRouteMapOverlay();
  const mapEl = overlay.querySelector('#curatedRideMapFullscreen');
  if (!overlay || !mapEl || !route?.map?.encodedPolyline5) return;
  overlay.classList.remove('isHidden');
  overlay.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    initExpandedRouteMap(pub, route);
    startDetailRouteLocationWatch();
  });
}

function closeExpandedRouteMap() {
  const overlay = document.getElementById('routeMapOverlay');
  if (overlay) {
    overlay.classList.add('isHidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (state.fullscreenRouteMap) {
    state.fullscreenRouteMap.remove();
    state.fullscreenRouteMap = null;
    state.fullscreenRouteLayer = null;
    state.fullscreenRouteUserMarker = null;
    state.fullscreenRouteUserAccuracyCircle = null;
  }

  state.fullscreenRouteNav = null;
  state.fullscreenRoutePubName = '';
  state.fullscreenRouteLastInstructionKey = '';
  renderRouteNavigationBanner(null);
}

function isExpandedRouteMapOpen() {
  const overlay = document.getElementById('routeMapOverlay');
  return !!overlay && !overlay.classList.contains('isHidden');
}

function initExpandedRouteMap(pub, route) {
  const mapEl = document.getElementById('curatedRideMapFullscreen');
  if (!mapEl || !route?.map?.encodedPolyline5) return;

  if (state.fullscreenRouteMap) {
    state.fullscreenRouteMap.remove();
    state.fullscreenRouteMap = null;
    state.fullscreenRouteLayer = null;
    state.fullscreenRouteUserMarker = null;
    state.fullscreenRouteUserAccuracyCircle = null;
  }

  const routePoints = decodePolyline5(route.map.encodedPolyline5);
  state.fullscreenRouteNav = buildRouteNavigationData(routePoints);
  state.fullscreenRoutePubName = pub.name;
  state.fullscreenRouteLastInstructionKey = '';

  state.fullscreenRouteMap = L.map(mapEl, {
    zoomControl: true,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.fullscreenRouteMap);

  state.fullscreenRouteLayer = L.polyline(routePoints, {
    color: '#d6b24a',
    weight: 6,
    opacity: 0.97
  }).addTo(state.fullscreenRouteMap);

  L.circleMarker([route.start.lat, route.start.lng], {
    radius: 7,
    color: '#2f2f2f',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(state.fullscreenRouteMap).bindTooltip(route.start.label, { direction: 'top' });

  L.circleMarker([pub.lat, pub.lng], {
    radius: 8,
    color: '#2f2f2f',
    weight: 2,
    fillColor: '#f5c542',
    fillOpacity: 1
  }).addTo(state.fullscreenRouteMap).bindTooltip(pub.name, { direction: 'top' });

  const bounds = state.fullscreenRouteLayer.getBounds();
  if (state.userLocation && !state.userLocation.fallback) {
    bounds.extend([state.userLocation.lat, state.userLocation.lng]);
  }

  state.fullscreenRouteMap.fitBounds(bounds, { padding: [26, 26] });
  updateFullscreenRouteUserMarker();
  updateFullscreenRouteNavigation();
  setTimeout(() => state.fullscreenRouteMap && state.fullscreenRouteMap.invalidateSize(), 120);
}

function startDetailRouteLocationWatch() {
  if (!navigator.geolocation || state.detailRouteWatchId != null) {
    updateDetailRouteUserMarker();
    updateFullscreenRouteNavigation();
    return;
  }

  state.detailRouteWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      state.userLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        name: 'Your location',
        fallback: false
      };

      updateUserLocationMarker();
      updateDetailRouteUserMarker();
      updateFullscreenRouteNavigation();
    },
    () => {
      stopDetailRouteLocationWatch(false);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

function stopDetailRouteLocationWatch(clearMarkers = true) {
  if (state.detailRouteWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.detailRouteWatchId);
  }
  state.detailRouteWatchId = null;

  if (clearMarkers) {
    clearDetailRouteUserMarker();
  }
}

function updateDetailRouteUserMarker() {
  if (!state.detailRouteMap && !state.fullscreenRouteMap) return;

  if (!state.userLocation || state.userLocation.fallback) {
    clearDetailRouteUserMarker();
    clearFullscreenRouteUserMarker();
    return;
  }

  const latlng = [state.userLocation.lat, state.userLocation.lng];

  if (state.detailRouteMap) {
    if (!state.detailRouteUserMarker) {
      state.detailRouteUserMarker = L.circleMarker(latlng, {
        radius: 8,
        color: '#1a73e8',
        weight: 2,
        fillColor: '#1a73e8',
        fillOpacity: 0.9
      }).addTo(state.detailRouteMap).bindTooltip('Your location', { direction: 'top' });
    } else {
      state.detailRouteUserMarker.setLatLng(latlng);
    }

    const acc = state.userLocation.accuracy;
    if (Number.isFinite(acc) && acc > 0) {
      if (!state.detailRouteUserAccuracyCircle) {
        state.detailRouteUserAccuracyCircle = L.circle(latlng, {
          radius: acc,
          color: '#1a73e8',
          weight: 1,
          fillColor: '#1a73e8',
          fillOpacity: 0.08
        }).addTo(state.detailRouteMap);
      } else {
        state.detailRouteUserAccuracyCircle.setLatLng(latlng);
        state.detailRouteUserAccuracyCircle.setRadius(acc);
      }
    }

    if (!state.detailRouteMap.getBounds().pad(-0.08).contains(latlng)) {
      state.detailRouteMap.panTo(latlng, { animate: true, duration: 0.5 });
    }
  }

  updateFullscreenRouteUserMarker();
}

function clearDetailRouteUserMarker() {
  if (state.detailRouteUserMarker) {
    state.detailRouteUserMarker.remove();
    state.detailRouteUserMarker = null;
  }

  if (state.detailRouteUserAccuracyCircle) {
    state.detailRouteUserAccuracyCircle.remove();
    state.detailRouteUserAccuracyCircle = null;
  }
}

function updateFullscreenRouteUserMarker() {
  if (!state.fullscreenRouteMap) return;

  if (!state.userLocation || state.userLocation.fallback) {
    clearFullscreenRouteUserMarker();
    updateFullscreenRouteNavigation();
    return;
  }

  const latlng = [state.userLocation.lat, state.userLocation.lng];

  if (!state.fullscreenRouteUserMarker) {
    state.fullscreenRouteUserMarker = L.circleMarker(latlng, {
      radius: 8,
      color: '#1a73e8',
      weight: 2,
      fillColor: '#1a73e8',
      fillOpacity: 0.9
    }).addTo(state.fullscreenRouteMap).bindTooltip('Your location', { direction: 'top' });
  } else {
    state.fullscreenRouteUserMarker.setLatLng(latlng);
  }

  const acc = state.userLocation.accuracy;
  if (Number.isFinite(acc) && acc > 0) {
    if (!state.fullscreenRouteUserAccuracyCircle) {
      state.fullscreenRouteUserAccuracyCircle = L.circle(latlng, {
        radius: acc,
        color: '#1a73e8',
        weight: 1,
        fillColor: '#1a73e8',
        fillOpacity: 0.08
      }).addTo(state.fullscreenRouteMap);
    } else {
      state.fullscreenRouteUserAccuracyCircle.setLatLng(latlng);
      state.fullscreenRouteUserAccuracyCircle.setRadius(acc);
    }
  }

  updateFullscreenRouteNavigation();
}

function clearFullscreenRouteUserMarker() {
  if (state.fullscreenRouteUserMarker) {
    state.fullscreenRouteUserMarker.remove();
    state.fullscreenRouteUserMarker = null;
  }

  if (state.fullscreenRouteUserAccuracyCircle) {
    state.fullscreenRouteUserAccuracyCircle.remove();
    state.fullscreenRouteUserAccuracyCircle = null;
  }
}


function renderRouteNavigationBanner(instruction) {
  const banner = document.getElementById('routeNavBanner');
  const primary = document.getElementById('routeNavPrimary');
  const secondary = document.getElementById('routeNavSecondary');
  if (!banner || !primary || !secondary) return;

  const fallback = instruction || {
    tone: 'idle',
    primary: 'Follow the yellow line',
    secondary: 'Open Near me to improve live route guidance.'
  };

  banner.classList.remove('isIdle', 'isOnRoute', 'isTurn', 'isOffRoute', 'isArrive');
  banner.classList.add(
    fallback.tone === 'offroute' ? 'isOffRoute'
      : fallback.tone === 'turn' ? 'isTurn'
      : fallback.tone === 'arrive' ? 'isArrive'
      : fallback.tone === 'onroute' ? 'isOnRoute'
      : 'isIdle'
  );

  const key = `${fallback.tone}|${fallback.primary}|${fallback.secondary}`;
  if (state.fullscreenRouteLastInstructionKey !== key) {
    state.fullscreenRouteLastInstructionKey = key;
    primary.textContent = fallback.primary;
    secondary.textContent = fallback.secondary;
  }
}

function updateFullscreenRouteNavigation() {
  if (!isExpandedRouteMapOpen()) return;

  if (!state.fullscreenRouteNav) {
    renderRouteNavigationBanner({
      tone: 'idle',
      primary: 'Follow the yellow line',
      secondary: 'Route guidance will appear here.'
    });
    return;
  }

  if (!state.userLocation || state.userLocation.fallback) {
    renderRouteNavigationBanner({
      tone: 'idle',
      primary: 'Finding your location…',
      secondary: 'Use Near me or allow location to get live guidance.'
    });
    return;
  }

  const instruction = getRouteNavigationInstruction(
    state.fullscreenRouteNav,
    state.userLocation.lat,
    state.userLocation.lng,
    state.fullscreenRoutePubName || 'the pub'
  );

  renderRouteNavigationBanner(instruction);
}

function getRouteNavigationInstruction(nav, lat, lng, pubName) {
  const position = findNearestRoutePosition(nav, lat, lng);
  if (!position) {
    return {
      tone: 'idle',
      primary: 'Follow the yellow line',
      secondary: 'Route guidance unavailable.'
    };
  }

  const remainingMeters = Math.max(0, nav.totalMeters - position.alongMeters);
  const offRouteThreshold = 45;

  if (remainingMeters <= 80) {
    return {
      tone: 'arrive',
      primary: `Arriving at ${pubName}`,
      secondary: `${formatNavDistance(remainingMeters)} left`
    };
  }

  if (position.distanceMeters > offRouteThreshold) {
    return {
      tone: 'offroute',
      primary: 'Off route',
      secondary: `Head ${formatNavDistance(position.distanceMeters)} back to the yellow line`
    };
  }

  const nextCue = nav.cues.find(cue => cue.atMeters > position.alongMeters + 10) || null;

  if (nextCue) {
    const distanceToCue = Math.max(0, nextCue.atMeters - position.alongMeters);

    if (distanceToCue <= 25) {
      return {
        tone: 'turn',
        primary: nextCue.nowLabel,
        secondary: `${formatNavDistance(remainingMeters)} to ${pubName}`
      };
    }

    if (distanceToCue <= 220) {
      return {
        tone: 'turn',
        primary: `${nextCue.label} in ${formatNavDistance(distanceToCue)}`,
        secondary: `${formatNavDistance(remainingMeters)} to ${pubName}`
      };
    }
  }

  return {
    tone: 'onroute',
    primary: 'Continue on route',
    secondary: `${formatNavDistance(remainingMeters)} to ${pubName}`
  };
}

function buildRouteNavigationData(routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) return null;

  const refLat = routePoints.reduce((sum, point) => sum + point[0], 0) / routePoints.length;
  const projected = routePoints.map(([lat, lng]) => projectRoutePoint(lat, lng, refLat));
  const cumulative = [0];

  for (let i = 1; i < projected.length; i++) {
    cumulative[i] = cumulative[i - 1] + distanceBetweenProjected(projected[i - 1], projected[i]);
  }

  return {
    refLat,
    projected,
    cumulative,
    totalMeters: cumulative[cumulative.length - 1] || 0,
    cues: extractRouteCues(projected, cumulative)
  };
}

function extractRouteCues(projected, cumulative) {
  if (!projected.length) return [];

  const cues = [];
  const lookAhead = 8;

  for (let i = lookAhead; i < projected.length - lookAhead; i++) {
    const prev = projected[i - lookAhead];
    const current = projected[i];
    const next = projected[i + lookAhead];
    const atMeters = cumulative[i] || 0;

    const inBearing = bearingBetweenProjected(prev, current);
    const outBearing = bearingBetweenProjected(current, next);
    const turnDeg = normalizeTurnDegrees(rad2deg(outBearing - inBearing));
    const absTurn = Math.abs(turnDeg);

    if (absTurn < 45) continue;

    const cue = {
      atMeters,
      absTurn,
      ...buildCueLabels(turnDeg)
    };

    const previous = cues[cues.length - 1];
    if (previous && (cue.atMeters - previous.atMeters) < 200) {
      if (cue.absTurn > previous.absTurn) cues[cues.length - 1] = cue;
      continue;
    }

    cues.push(cue);
  }

  return cues;
}

function buildCueLabels(turnDeg) {
  const isLeft = turnDeg > 0;
  const absTurn = Math.abs(turnDeg);

  if (absTurn >= 120) {
    return {
      type: isLeft ? 'uturn-left' : 'uturn-right',
      label: isLeft ? 'Hard left ahead' : 'Hard right ahead',
      nowLabel: isLeft ? 'Hard left now' : 'Hard right now'
    };
  }

  if (absTurn >= 70) {
    return {
      type: isLeft ? 'sharp-left' : 'sharp-right',
      label: isLeft ? 'Sharp left ahead' : 'Sharp right ahead',
      nowLabel: isLeft ? 'Sharp left now' : 'Sharp right now'
    };
  }

  return {
    type: isLeft ? 'left' : 'right',
    label: isLeft ? 'Left ahead' : 'Right ahead',
    nowLabel: isLeft ? 'Left now' : 'Right now'
  };
}

function findNearestRoutePosition(nav, lat, lng) {
  if (!nav?.projected?.length || nav.projected.length < 2) return null;

  const point = projectRoutePoint(lat, lng, nav.refLat);
  let best = null;

  for (let i = 0; i < nav.projected.length - 1; i++) {
    const a = nav.projected[i];
    const b = nav.projected[i + 1];
    const segX = b.x - a.x;
    const segY = b.y - a.y;
    const segLenSq = (segX * segX) + (segY * segY);

    if (!segLenSq) continue;

    const t = clamp((((point.x - a.x) * segX) + ((point.y - a.y) * segY)) / segLenSq, 0, 1);
    const projX = a.x + (segX * t);
    const projY = a.y + (segY * t);
    const dx = point.x - projX;
    const dy = point.y - projY;
    const distanceMeters = Math.hypot(dx, dy);
    const segmentLength = Math.sqrt(segLenSq);
    const alongMeters = (nav.cumulative[i] || 0) + (segmentLength * t);

    if (!best || distanceMeters < best.distanceMeters) {
      best = { distanceMeters, alongMeters, segmentIndex: i };
    }
  }

  return best;
}

function projectRoutePoint(lat, lng, refLat) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = Math.cos(deg2rad(refLat || lat)) * 111320;
  return {
    x: lng * metersPerDegLng,
    y: lat * metersPerDegLat
  };
}

function distanceBetweenProjected(a, b) {
  return Math.hypot((b.x - a.x), (b.y - a.y));
}

function bearingBetweenProjected(a, b) {
  return Math.atan2((b.y - a.y), (b.x - a.x));
}

function normalizeTurnDegrees(deg) {
  let value = deg;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function formatNavDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}


function decodePolyline5(str) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];

  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let byte = null;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
}


function bindDetailGalleryDots() {
  const gallery = els.modalContent.querySelector('.detailGallery');
  if (!gallery) return;

  const slides = Array.from(gallery.querySelectorAll('.detailSlide'));
  const dots = Array.from(els.modalContent.querySelectorAll('.detailDot'));
  if (!slides.length || !dots.length) return;

  let ticking = false;

  const update = () => {
    ticking = false;
    const width = gallery.clientWidth || 1;
    const raw = gallery.scrollLeft / width;
    const index = Math.max(0, Math.min(dots.length - 1, Math.round(raw)));
    dots.forEach((dot, i) => dot.classList.toggle('isActive', i == index));
  };

  gallery.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      gallery.scrollTo({ left: gallery.clientWidth * index, behavior: 'smooth' });
    });
  });

  window.requestAnimationFrame(update);
}

function closeModal(push = false) {
  closeExpandedRouteMap();
  stopDetailRouteLocationWatch();
  destroySunRoutePlanMap();
  state.sunRouteCurrentPlan = null;

  if (state.detailRouteMap) {
    state.detailRouteMap.remove();
    state.detailRouteMap = null;
    state.detailRouteLayer = null;
    state.detailRouteUserMarker = null;
    state.detailRouteUserAccuracyCircle = null;
  }

  els.modalOverlay.classList.add('isHidden');
  els.modalContent.innerHTML = '';
  state.currentDetailPubId = null;
  unlockBodyScroll();

  const ret = state.modalReturnView || 'list';
  state.modalReturnView = 'list';

  if (ret === 'map') setView('map', false);
  if (push) history.pushState({}, '', state.currentView === 'map' ? '#map' : '#list');
}


async function refreshWeather(lat, lng) {
  try {
    const url = `${METOFFICE_WORKER_URL}?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || 'Weather request failed.');
    }

    const current = pickCurrentFromMetOffice(data);
    const sunTimes = pickSunTimesForLocation(lat, lng, current?.time || new Date());
    const isDay = isWithinDaylight(current?.time || new Date(), sunTimes);

    state.weather = {
      current: current ? { ...current, isDay } : null,
      nextHour: null,
      sunTimes,
      locationName: data?.station?.name || data?.station?.geohash || 'Met Office',
      lastUpdated: data?.current?.UpdatedAt || ''
    };

    renderWeatherBar();
  } catch (err) {
    console.error('Weather refresh failed:', err);
    state.weather = null;
    renderWeatherBar(err?.message || 'Weather unavailable');
  }
}

function metOfficeCodeToText(code, isDay = true) {
  const c = Number(code);
  if (c === 0) return isDay ? 'Sunny' : 'Clear';
  if (c === 1) return isDay ? 'Sunny' : 'Clear';
  if (c === 2 || c === 3) return 'Partly cloudy';
  if (c === 5) return 'Mist';
  if (c === 6) return 'Fog';
  if (c === 7 || c === 8) return 'Cloudy';
  if (c === 9 || c === 10) return 'Light rain shower';
  if (c === 11) return 'Drizzle';
  if (c === 12) return 'Light rain';
  if (c === 13 || c === 14) return 'Heavy rain shower';
  if (c === 15) return 'Heavy rain';
  if (c === 16 || c === 17 || c === 18) return 'Sleet';
  if (c === 19 || c === 20 || c === 21) return 'Hail';
  if (c === 22 || c === 23 || c === 24) return 'Light snow';
  if (c === 25 || c === 26 || c === 27) return 'Heavy snow';
  if (c === 28 || c === 29 || c === 30) return 'Thunderstorm';
  return 'Cloudy';
}

function pickCurrentFromMetOffice(data) {
  const current = data?.current;
  if (!current) return null;

  const time = current.UpdatedAt ? new Date(current.UpdatedAt) : new Date();
  const weatherCode = Number(current.weatherCode);
  const hasCode = Number.isFinite(weatherCode);

  return {
    temp: Number(current.tempC),
    precip: Number(current.precipMm ?? 0),
    cloudCover: Number.isFinite(Number(current.cloudCover)) ? Number(current.cloudCover) : null,
    isDay: null,
    time,
    windKph: Number.isFinite(Number(current.windMps)) ? Number(current.windMps) * 3.6 : null,
    weatherCode: hasCode ? weatherCode : null,
    conditionText: String(current.conditionText || '').trim() || metOfficeCodeToText(weatherCode, true),
    iconUrl: ''
  };
}

function pickSunTimesForLocation(lat, lng, referenceDate) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const parts = getLondonDateParts(referenceDate instanceof Date ? referenceDate : new Date(referenceDate));
  const dateAnchor = createUtcAnchorDate(parts.year, parts.month, parts.day);
  const solar = getSolarTimesLocal(lat, lng, dateAnchor);
  if (!solar) return null;

  return {
    sunrise: minutesToLocalDate(dateAnchor, solar.sunrise),
    sunset: minutesToLocalDate(dateAnchor, solar.sunset)
  };
}

function isWithinDaylight(dateObj, sunTimes) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return true;
  if (!sunTimes?.sunrise || !sunTimes?.sunset) return true;
  return dateObj >= sunTimes.sunrise && dateObj < sunTimes.sunset;
}

function renderWeatherBar(errorMessage = '') {
  if (!state.weather || !state.weather.current) {
    els.weatherIcon.textContent = '⛅';
    if (els.weatherTitle) els.weatherTitle.textContent = 'Current conditions';
    els.weatherLine.textContent = errorMessage || 'Weather unavailable';
    els.weatherBar.className = 'weatherBar cloudy';
    return;
  }

  const current = state.weather.current;
  const next = state.weather.nextHour;
  const sunTimes = state.weather.sunTimes || null;

  const currentMood = weatherMood(current, sunTimes, current.time || new Date());
  const currentLabel = currentWeatherLabel(current, sunTimes);
  const UpdatedText = current.time instanceof Date && !Number.isNaN(current.time.getTime())
    ? `Updated ${fmtTime(current.time)}`
    : 'Met Office';

  els.weatherIcon.textContent = currentMood.icon;
  if (els.weatherTitle) els.weatherTitle.textContent = weatherTitleText(current, sunTimes);
  els.weatherBar.className = `weatherBar ${currentMood.className}`;

  if (next) {
    const nextLabel = nextHourLabel(next);
    const nextTemp = Number.isFinite(next.temp) ? `${Math.round(next.temp)}°C` : '—';
    const nextRain = Number.isFinite(next.rain) ? `${Math.round(next.rain)}% rain` : '—';
    els.weatherLine.textContent = `${currentLabel} · ${Math.round(current.temp)}°C · Next hour: ${nextLabel} · ${nextTemp} · ${nextRain}`;
    return;
  }

  els.weatherLine.textContent = `${currentLabel} · ${Math.round(current.temp)}°C · ${UpdatedText}`;
}

function initMap() {
  state.map = L.map('map', { zoomControl: true }).setView([FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);

  state.markerLayer = L.layerGroup().addTo(state.map);
  renderMapMarkers();
  updateUserLocationMarker();
}

function renderMapMarkers() {
  if (!state.map || !state.markerLayer) return;
  state.markerLayer.clearLayers();

  state.pubs.forEach(pub => {
    const display = getDisplayStatus(pub);
    const marker = L.circleMarker([pub.lat, pub.lng], {
      radius: 9,
      color: '#555',
      weight: 1,
      fillColor: display.pin,
      fillOpacity: 0.95
    });

    marker.on('click', () => openDetail(pub.id, 'map'));
    marker.bindTooltip(pub.name, { direction: 'top', offset: [0, -6] });
    marker.addTo(state.markerLayer);
  });
}

function updateUserLocationMarker() {
  if (!state.map) return;

  if (!state.userLocation || state.userLocation.fallback) {
    clearUserLocationMarker();
    return;
  }

  const latlng = [state.userLocation.lat, state.userLocation.lng];

  if (!state.userMarker) {
    state.userMarker = L.circleMarker(latlng, {
      radius: 8,
      color: '#1a73e8',
      weight: 2,
      fillColor: '#1a73e8',
      fillOpacity: 0.85
    }).addTo(state.map);
  } else {
    state.userMarker.setLatLng(latlng);
  }

  const acc = state.userLocation.accuracy;
  if (Number.isFinite(acc) && acc > 0) {
    if (!state.userAccuracyCircle) {
      state.userAccuracyCircle = L.circle(latlng, {
        radius: acc,
        color: '#1a73e8',
        weight: 1,
        fillColor: '#1a73e8',
        fillOpacity: 0.08
      }).addTo(state.map);
    } else {
      state.userAccuracyCircle.setLatLng(latlng);
      state.userAccuracyCircle.setRadius(acc);
    }
  }
}

function clearUserLocationMarker() {
  if (state.userMarker) {
    state.userMarker.remove();
    state.userMarker = null;
  }
  if (state.userAccuracyCircle) {
    state.userAccuracyCircle.remove();
    state.userAccuracyCircle = null;
  }
}

function mapsHref(lat, lng, name) {
  const q = encodeURIComponent(name || `${lat},${lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}(${q})`;
}

function mapsCycleHref(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=bicycling`;
}

function parseISODate(str) {
  const [y, m, d] = String(str || '').split('-').map(Number);
  return createUtcAnchorDate(y || 1970, (m || 1), d || 1);
}

function formatDate(d) {
  const parts = getLondonDateParts(d);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function fmtTime(d) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function deg2rad(d) { return d * Math.PI / 180; }
function rad2deg(r) { return r * 180 / Math.PI; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function escapeAttr(str = '') {
  return escapeHtml(str);
}
