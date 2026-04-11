const CSV_URL = './public/data/pubs.csv';
const FALLBACK_LOCATION = { name: 'Nottingham City Centre', lat: 52.9548, lng: -1.1581 };
const WEATHER_REFRESH_MS = 5 * 60 * 1000;
const WEATHERAPI_KEY = (window.WEATHERAPI_KEY || '').trim() || '07879d3f63ed420c805115827261703';
const WEATHERAPI_BASE = 'https://api.weatherapi.com/v1';
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
  fullscreenRouteLastInstructionKey: ''
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
  ensureWorthTripRow();
  await loadRoutes();
  state.pubs = (await loadPubs()).map(enrichPub);
  await refreshWeather(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng);
  renderEverything();
  initMap();
  setRowTitles();
  startWeatherRefresh();
  if (location.hash === '#map') setView('map', false);
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
    if (!els.modalOverlay.classList.contains('isHidden')) {
      closeModal(false);
      return;
    }
    if (location.hash === '#map') setView('map', false);
    else setView('list', false);
  });
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
    : null;

  const best = chooseBestWindow(aToday, bToday, now);
  const distanceKm = state.userLocation
    ? haversineKm(state.userLocation.lat, state.userLocation.lng, pub.lat, pub.lng)
    : null;

  return { ...pub, spotAToday: aToday, spotBToday: bToday, bestNow: best, distanceKm };
}

function reEnrichAll() {
  state.pubs = state.pubs.map(enrichPub);
}

function resolveSpotWindow({ lat, lng, baseDate, startHHMM, endHHMM, horizon, targetDateStr }) {
  if (hasHorizonProfile(horizon)) {
    return getWindowFromHorizon(lat, lng, horizon, targetDateStr);
  }

  if (hasLegacyWindow(baseDate, startHHMM, endHHMM)) {
    return shiftWindow(lat, lng, baseDate, startHHMM, endHHMM, targetDateStr);
  }

  return null;
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
  if (profile.length < 2) return null;

  const targetDate = parseISODate(targetDateStr);
  const stepMinutes = 2;
  let firstSun = null;
  let lastSun = null;

  for (let minutes = 7 * 60; minutes <= 23 * 60; minutes += stepMinutes) {
    const dt = minutesToLocalDate(targetDate, minutes);
    const sun = getSunPositionLocal(lat, lng, dt);
    const obstructionAlt = horizonAltitudeAt(profile, sun.azimuth);
    const inSun = sun.elevation > obstructionAlt;

    if (inSun && !firstSun) firstSun = new Date(dt);
    if (inSun) lastSun = new Date(dt);
  }

  if (!firstSun || !lastSun) return null;

  return {
    start: firstSun,
    end: lastSun
  };
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
  const out = [];
  if (pub.spotAToday) out.push(pub.spotAToday);
  if (pub.spotBToday) out.push(pub.spotBToday);
  return out;
}

function getWindowStats(pub, now) {
  const windows = getWindows(pub).filter(w => w && w.end > w.start);
  const remaining = windows.filter(w => w.end > now);

  const active = remaining.find(w => now >= w.start && now <= w.end) || null;
  const next = remaining.filter(w => now < w.start).sort((a, b) => a.start - b.start)[0] || null;
  const latestRemainingWindow = remaining.sort((a, b) => b.end - a.end)[0] || null;
  const latestRemainingEnd = latestRemainingWindow ? latestRemainingWindow.end : null;

  return { activeWindow: active, nextWindow: next, latestRemainingEnd, latestRemainingWindow };
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

  if (!isDay) {
    if (precipNow >= 0.1 || hasRainWords(currentText)) {
      return { icon: '🌧️', className: 'night-rainy', tone: 'rainy' };
    }

    if (cloudNow <= 35 && !hasFogWords(currentText) && /(clear)/i.test(currentText)) {
      return { icon: '🌙', className: 'night-clear', tone: 'cloudy' };
    }

    return { icon: '☁️', className: 'night-cloudy', tone: 'cloudy' };
  }

  if (precipNow >= 0.1 || hasRainWords(currentText)) {
    return { icon: '🌧️', className: 'rainy', tone: 'rainy' };
  }

  if (!hasFogWords(currentText) && (/(sunny|clear)/i.test(currentText) || cloudNow <= 35)) {
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

function describeWeather(currentObj, nextObj = null, sunTimes = null) {
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

function currentWeatherLabel(currentObj, sunTimes = null, nextObj = null) {
  return describeWeather(currentObj, nextObj, sunTimes);
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

  if (!windowObj) return { status: 'Sun time unavailable', line: '', badge: 'Unavailable' };

  const inWindow = now >= windowObj.start && now <= windowObj.end;
  const upcoming = now < windowObj.start;

  if (inWindow) {
    if (tone === 'sunny') return { status: 'Sunny now', line: `Sun until ${fmtTime(windowObj.end)}`, badge: 'Best now' };
    if (tone === 'cloudy') return { status: 'Cloudy now', line: `Sun until ${fmtTime(windowObj.end)}`, badge: 'Best now' };
    return { status: 'Not sunny now', line: `Sun until ${fmtTime(windowObj.end)}`, badge: 'Best now' };
  }

  if (upcoming) {
    if (tone === 'rainy') return { status: 'Rainy now', line: `Sun from ${fmtTime(windowObj.start)}`, badge: 'Later today' };
    if (tone === 'cloudy') return { status: 'Cloudy now', line: `Sun from ${fmtTime(windowObj.start)}`, badge: 'Later today' };
    return { status: 'Not sunny now', line: `Sun from ${fmtTime(windowObj.start)}`, badge: 'Later today' };
  }

  return { status: 'Finished today', line: 'No more sun today', badge: 'Finished today' };
}

function chooseBestWindow(a, b, now) {
  const candidates = [a, b].filter(Boolean);
  if (!candidates.length) return { state: 'none', line: 'Sun time unavailable', window: null };

  const active = candidates.find(w => now >= w.start && now <= w.end);
  if (active) return { state: 'sunny', line: `Sun until ${fmtTime(active.end)}`, window: active };

  const upcoming = candidates.filter(w => now < w.start).sort((x, y) => x.start - y.start)[0];
  if (upcoming) return { state: 'shade', line: `Sun from ${fmtTime(upcoming.start)}`, window: upcoming };

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

function openDetail(pubId, sourceView = 'list') {
  state.modalReturnView = sourceView || state.currentView;
  if (state.currentView === 'map') setView('list', false);

  const pub = state.pubs.find(p => p.id === pubId);
  if (!pub) return;

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
      ${pub.spotB && pub.spotBToday ? renderSpotCard('Location', pub.spotB, pub.spotBToday, bState) : ''}
    </div>
  `;

  lockBodyScroll();
  els.modalOverlay.classList.remove('isHidden');
  bindDetailGalleryDots();
  bindCuratedRide(pub, curatedRoute);
  history.pushState({ modal: pubId }, '', `#pub-${encodeURIComponent(pubId)}`);
}

function renderSpotCard(kicker, name, windowObj, stateObj) {
  const todayStart = new Date(windowObj.start);
  todayStart.setHours(7, 0, 0, 0);

  const todayEnd = new Date(windowObj.start);
  todayEnd.setHours(23, 0, 0, 0);

  const spanTotal = todayEnd - todayStart;
  const sunLeftPct = clamp(((windowObj.start - todayStart) / spanTotal) * 100, 0, 100);
  const sunWidthPct = clamp(((windowObj.end - windowObj.start) / spanTotal) * 100, 0, 100);
  const nowPct = clamp(((new Date() - todayStart) / spanTotal) * 100, 0, 100);

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
          <div class="timelineSun" style="left:${sunLeftPct}%; width:${sunWidthPct}%;"></div>
          <div class="timelineNow" style="left:${nowPct}%;"></div>
        </div>
        <div class="timelineNowLabel">now</div>
      </div>

      <div class="spotWindow">Sun today: ${fmtTime(windowObj.start)}–${fmtTime(windowObj.end)}</div>
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

  if (state.detailRouteMap) {
    state.detailRouteMap.remove();
    state.detailRouteMap = null;
    state.detailRouteLayer = null;
    state.detailRouteUserMarker = null;
    state.detailRouteUserAccuracyCircle = null;
  }

  els.modalOverlay.classList.add('isHidden');
  els.modalContent.innerHTML = '';
  unlockBodyScroll();

  const ret = state.modalReturnView || 'list';
  state.modalReturnView = 'list';

  if (ret === 'map') setView('map', false);
  if (push) history.pushState({}, '', state.currentView === 'map' ? '#map' : '#list');
}

async function refreshWeather(lat, lng) {
  try {
    if (!WEATHERAPI_KEY || WEATHERAPI_KEY === 'PUT_YOUR_WEATHERAPI_KEY_HERE') {
      throw new Error('Add your WeatherAPI key in app.js.');
    }

    const q = `${lat},${lng}`;
    const url = `${WEATHERAPI_BASE}/forecast.json?key=${encodeURIComponent(WEATHERAPI_KEY)}&q=${encodeURIComponent(q)}&days=2&aqi=no&alerts=no`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || data?.error) {
      throw new Error(data?.error?.message || 'Weather request failed.');
    }

    state.weather = {
      current: pickCurrent(data),
      nextHour: pickNextHour(data),
      sunTimes: pickSunTimes(data),
      locationName: data?.location?.name || '',
      lastUpdated: data?.current?.last_updated || ''
    };

    renderWeatherBar();
  } catch (err) {
    console.error('Weather refresh failed:', err);
    state.weather = null;
    renderWeatherBar(err?.message || 'Weather unavailable');
  }
}

function pickCurrent(data) {
  const current = data?.current;
  if (!current) return null;

  return {
    temp: Number(current.temp_c),
    precip: Number(current.precip_mm ?? 0),
    cloudCover: Number(current.cloud ?? 0),
    isDay: Number(current.is_day) === 1,
    time: current.last_updated_epoch ? new Date(current.last_updated_epoch * 1000) : new Date(),
    windKph: Number(current.wind_kph ?? 0),
    conditionText: String(current?.condition?.text || '').trim(),
    iconUrl: current?.condition?.icon ? (String(current.condition.icon).startsWith('//') ? `https:${current.condition.icon}` : current.condition.icon) : ''
  };
}

function pickSunTimes(data) {
  const astro = data?.forecast?.forecastday?.[0]?.astro;
  const currentTime = data?.current?.last_updated_epoch ? new Date(data.current.last_updated_epoch * 1000) : new Date();
  if (!astro?.sunrise || !astro?.sunset) return null;

  const sunriseDate = parseAstroTime(astro.sunrise, currentTime);
  const sunsetDate = parseAstroTime(astro.sunset, currentTime);
  if (!sunriseDate || !sunsetDate) return null;

  return { sunrise: sunriseDate, sunset: sunsetDate };
}

function pickNextHour(data) {
  const hours = (data?.forecast?.forecastday || []).flatMap(day => day?.hour || []);
  if (!hours.length) return null;

  const nowEpoch = Number(data?.current?.last_updated_epoch || Math.floor(Date.now() / 1000));
  const next = hours.find(hour => Number(hour?.time_epoch) > nowEpoch) || hours[0];
  if (!next) return null;

  return {
    time: next.time_epoch ? new Date(next.time_epoch * 1000) : new Date(),
    temp: Number(next.temp_c),
    rain: Number(next.chance_of_rain ?? 0),
    precip: Number(next.precip_mm ?? 0),
    cloudCover: Number(next.cloud ?? 0),
    isDay: Number(next.is_day) === 1,
    windKph: Number(next.wind_kph ?? 0),
    conditionText: String(next?.condition?.text || '').trim()
  };
}

function parseAstroTime(timeText, referenceDate) {
  const match = String(timeText || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match || !(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  const londonDate = getLondonDateParts(referenceDate);
  const dateAnchor = createUtcAnchorDate(londonDate.year, londonDate.month, londonDate.day);
  return minutesToLocalDate(dateAnchor, (hours * 60) + minutes);
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
  const nextLabel = next ? nextHourLabel(next) : 'Unavailable';
  const nextTemp = next && Number.isFinite(next.temp) ? `${Math.round(next.temp)}°C` : '—';
  const nextRain = next && Number.isFinite(next.rain) ? `${Math.round(next.rain)}% rain` : '—';

  els.weatherIcon.textContent = currentMood.icon;
  if (els.weatherTitle) els.weatherTitle.textContent = weatherTitleText(current, sunTimes);
  els.weatherBar.className = `weatherBar ${currentMood.className}`;
  els.weatherLine.textContent = `${currentLabel} · ${Math.round(current.temp)}°C · Next hour: ${nextLabel} · ${nextTemp} · ${nextRain}`;
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
