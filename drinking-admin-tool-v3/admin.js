const DEFAULT_FETCH_PATHS = ['./public/data/pubs.csv', './pubs.csv'];
const STORAGE_KEY = 'drinking_admin_local_draft_v3';
const SETTINGS_KEY = 'drinking_admin_github_settings_v3';
const MAX_SEARCH_RESULTS = 14;
const APP_TIME_ZONE = 'Europe/London';
const KNOWN_HEADERS = [
  'id','name','address','lat','lng','spot_a','base_date','spot_a_sun_start','spot_a_horizon','spot_a_sun_end',
  'spot_b','spot_b_sun_start','spot_b_sun_end','spot_b_horizon','image_url','spot_a_photo_url','spot_b_photo_url',
  'notes','worth_the_trip','cycle_friendly'
];

const state = {
  headers: [],
  rows: [],
  filteredIndexes: [],
  selectedIndex: -1,
  loadedFilename: 'pubs.csv',
  draftSavedAt: '',
  restoredFromDraft: false,
  githubSha: '',
  githubLastLoadedAt: '',
  isSavingGitHub: false
};

const els = {
  fileInput: document.getElementById('fileInput'),
  btnReload: document.getElementById('btnReload'),
  btnDownload: document.getElementById('btnDownload'),
  btnSaveDraft: document.getElementById('btnSaveDraft'),
  btnRestoreDraft: document.getElementById('btnRestoreDraft'),
  btnClearDraft: document.getElementById('btnClearDraft'),
  draftStatus: document.getElementById('draftStatus'),
  btnNewPub: document.getElementById('btnNewPub'),
  btnDuplicate: document.getElementById('btnDuplicate'),
  btnDelete: document.getElementById('btnDelete'),
  searchInput: document.getElementById('searchInput'),
  pubList: document.getElementById('pubList'),
  pubCount: document.getElementById('pubCount'),
  previewDateA: document.getElementById('previewDateA'),
  previewDateB: document.getElementById('previewDateB'),
  previewSummaryA: document.getElementById('previewSummaryA'),
  previewSummaryB: document.getElementById('previewSummaryB'),
  graphA: document.getElementById('graphA'),
  graphB: document.getElementById('graphB'),
  spotAStatus: document.getElementById('spotAStatus'),
  spotBStatus: document.getElementById('spotBStatus'),
  githubOwner: document.getElementById('github-owner'),
  githubRepo: document.getElementById('github-repo'),
  githubBranch: document.getElementById('github-branch'),
  githubPath: document.getElementById('github-path'),
  githubToken: document.getElementById('github-token'),
  githubRememberToken: document.getElementById('github-remember-token'),
  githubMessage: document.getElementById('github-message'),
  btnGitHubLoad: document.getElementById('btnGitHubLoad'),
  btnGitHubSave: document.getElementById('btnGitHubSave'),
  gitStatus: document.getElementById('gitStatus')
};

const fieldIds = KNOWN_HEADERS.reduce((acc, header) => {
  const el = document.getElementById(`field-${header}`);
  if (el) acc[header] = el;
  return acc;
}, {});

const pointLists = {
  a: document.getElementById('pointList-a'),
  b: document.getElementById('pointList-b')
};

const pointRowTemplate = document.getElementById('pointRowTemplate');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  wireUi();
  restoreSettings();
  const today = formatDate(new Date());
  els.previewDateA.value = today;
  els.previewDateB.value = today;
  if (!restoreDraftFromLocal()) {
    await loadDefaultCsv();
  }
  updateDraftStatus();
  updateGitStatus();
}

function wireUi() {
  els.fileInput.addEventListener('change', onFileChosen);
  els.btnReload.addEventListener('click', async () => {
    await loadDefaultCsv();
    updateDraftStatus('Reloaded bundled CSV from the tool folder.');
  });
  els.btnDownload.addEventListener('click', downloadCsv);
  els.btnSaveDraft.addEventListener('click', () => saveDraftToLocal(true));
  els.btnRestoreDraft.addEventListener('click', () => {
    if (restoreDraftFromLocal()) updateDraftStatus('Restored local draft from this device.');
    else updateDraftStatus('No local draft found on this device.');
  });
  els.btnClearDraft.addEventListener('click', () => {
    clearLocalDraft();
    updateDraftStatus('Local draft cleared from this device.');
  });
  els.btnNewPub.addEventListener('click', createNewPub);
  els.btnDuplicate.addEventListener('click', duplicateSelectedPub);
  els.btnDelete.addEventListener('click', deleteSelectedPub);
  els.searchInput.addEventListener('input', renderPubList);

  Object.entries(fieldIds).forEach(([key, el]) => {
    el.addEventListener('input', () => {
      if (!hasSelection()) return;
      state.rows[state.selectedIndex][key] = normalizeFieldValue(key, el.value);
      if (key === 'id' || key === 'name' || key === 'spot_a' || key === 'spot_b') renderPubList();
      if (key === 'spot_a_horizon') rebuildPointRowsFromString('a', true);
      if (key === 'spot_b_horizon') rebuildPointRowsFromString('b', true);
      updatePreview();
      updateDirtyUi();
      saveDraftToLocal();
    });
  });

  document.querySelectorAll('[data-add-point]').forEach(btn => btn.addEventListener('click', () => addPointRow(btn.dataset.addPoint)));
  document.querySelectorAll('[data-sort-point]').forEach(btn => btn.addEventListener('click', () => sortPointRows(btn.dataset.sortPoint)));
  document.querySelectorAll('[data-rebuild-point]').forEach(btn => btn.addEventListener('click', () => syncPointRowsToField(btn.dataset.rebuildPoint)));
  els.previewDateA.addEventListener('input', () => { updatePreview(); saveDraftToLocal(); });
  els.previewDateB.addEventListener('input', () => { updatePreview(); saveDraftToLocal(); });

  [
    els.githubOwner,
    els.githubRepo,
    els.githubBranch,
    els.githubPath,
    els.githubToken,
    els.githubRememberToken,
    els.githubMessage
  ].forEach(el => {
    const eventName = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      persistSettings();
      updateDirtyUi();
      updateGitStatus();
    });
  });

  els.btnGitHubLoad.addEventListener('click', loadCsvFromGitHub);
  els.btnGitHubSave.addEventListener('click', saveCsvToGitHub);
}

async function loadDefaultCsv() {
  state.githubSha = '';
  state.githubLastLoadedAt = '';
  for (const path of DEFAULT_FETCH_PATHS) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      loadCsvText(text, path.split('/').pop() || 'pubs.csv');
      return;
    } catch {}
  }
  state.headers = [...KNOWN_HEADERS];
  state.rows = [];
  state.loadedFilename = 'pubs.csv';
  renderPubList();
  clearEditor('Load pubs.csv to start.');
  updateDirtyUi();
}

async function loadCsvFromGitHub() {
  const settings = getGitHubSettings();
  if (!settings.owner || !settings.repo || !settings.path) {
    updateGitStatus('Enter owner, repository, and CSV path first.', true);
    return;
  }

  updateGitStatus('Loading CSV from GitHub…');
  try {
    const file = await githubGetFile(settings);
    loadCsvText(file.text, file.path.split('/').pop() || 'pubs.csv');
    state.githubSha = file.sha || '';
    state.githubLastLoadedAt = new Date().toISOString();
    updateGitStatus(`Loaded ${file.path} from ${settings.owner}/${settings.repo}${settings.branch ? ` (${settings.branch})` : ''}.`);
    updateDirtyUi();
  } catch (err) {
    updateGitStatus(err.message || 'Could not load from GitHub.', true);
  }
}

async function saveCsvToGitHub() {
  if (state.isSavingGitHub) return;
  const settings = getGitHubSettings();
  if (!settings.owner || !settings.repo || !settings.path) {
    updateGitStatus('Enter owner, repository, and CSV path first.', true);
    return;
  }
  if (!settings.token) {
    updateGitStatus('Enter a fine-grained GitHub token before saving.', true);
    return;
  }
  if (!state.headers.length) {
    updateGitStatus('No CSV is loaded yet.', true);
    return;
  }

  state.isSavingGitHub = true;
  updateDirtyUi();
  updateGitStatus('Saving pubs.csv to GitHub…');

  try {
    let sha = state.githubSha;
    if (!sha) {
      try {
        const existing = await githubGetFile(settings);
        sha = existing.sha || '';
      } catch (err) {
        if (!/404/.test(String(err.message || ''))) throw err;
      }
    }

    const message = settings.message || `Update pubs.csv via admin tool ${formatDate(new Date())}`;
    const csvText = buildCsvText();
    const result = await githubPutFile(settings, csvText, sha, message);
    state.githubSha = result.content?.sha || sha || '';
    state.githubLastLoadedAt = new Date().toISOString();
    state.loadedFilename = settings.path.split('/').pop() || 'pubs.csv';
    updateGitStatus(`Saved ${settings.path} to ${settings.owner}/${settings.repo}.`);
  } catch (err) {
    updateGitStatus(err.message || 'Could not save to GitHub.', true);
  } finally {
    state.isSavingGitHub = false;
    updateDirtyUi();
  }
}

async function githubGetFile(settings) {
  const url = buildGitHubContentsUrl(settings.owner, settings.repo, settings.path, settings.branch);
  const headers = { Accept: 'application/vnd.github+json' };
  if (settings.token) headers.Authorization = `Bearer ${settings.token}`;

  const res = await fetch(url, { headers });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.message ? `GitHub load failed: ${data.message}` : `GitHub load failed (${res.status}).`);
  }
  const content = String(data?.content || '').replace(/\n/g, '');
  return {
    sha: data?.sha || '',
    path: data?.path || settings.path,
    text: decodeBase64Utf8(content)
  };
}

async function githubPutFile(settings, csvText, sha, message) {
  const url = buildGitHubContentsUrl(settings.owner, settings.repo, settings.path, '');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${settings.token}`,
    'Content-Type': 'application/json'
  };
  const body = {
    message,
    content: encodeBase64Utf8(csvText),
    branch: settings.branch || 'main'
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.message ? `GitHub save failed: ${data.message}` : `GitHub save failed (${res.status}).`);
  }
  return data;
}

function buildGitHubContentsUrl(owner, repo, path, branch = '') {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  return branch ? `${base}?ref=${encodeURIComponent(branch)}` : base;
}

function getGitHubSettings() {
  return {
    owner: String(els.githubOwner.value || '').trim(),
    repo: String(els.githubRepo.value || '').trim(),
    branch: String(els.githubBranch.value || '').trim() || 'main',
    path: String(els.githubPath.value || '').trim() || 'public/data/pubs.csv',
    token: String(els.githubToken.value || '').trim(),
    rememberToken: !!els.githubRememberToken.checked,
    message: String(els.githubMessage.value || '').trim()
  };
}

function persistSettings() {
  const settings = getGitHubSettings();
  const payload = {
    owner: settings.owner,
    repo: settings.repo,
    branch: settings.branch,
    path: settings.path,
    message: settings.message,
    rememberToken: settings.rememberToken,
    token: settings.rememberToken ? settings.token : ''
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {}
}

function restoreSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) || '';
    if (!raw) return;
    const payload = JSON.parse(raw);
    els.githubOwner.value = payload.owner || '';
    els.githubRepo.value = payload.repo || '';
    els.githubBranch.value = payload.branch || 'main';
    els.githubPath.value = payload.path || 'public/data/pubs.csv';
    els.githubMessage.value = payload.message || 'Update pubs.csv via admin tool';
    els.githubRememberToken.checked = !!payload.rememberToken;
    els.githubToken.value = payload.rememberToken ? (payload.token || '') : '';
  } catch {}
}

function updateGitStatus(message = '', isError = false) {
  let text = message;
  if (!text) {
    const settings = getGitHubSettings();
    text = settings.owner && settings.repo
      ? `Target repo: ${settings.owner}/${settings.repo} · branch: ${settings.branch} · path: ${settings.path}`
      : 'Load is optional for public repos. Save needs a token with repository Contents write permission.';
  }
  els.gitStatus.textContent = text;
  els.gitStatus.classList.toggle('errorText', !!isError);
}

function onFileChosen(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.githubSha = '';
    state.githubLastLoadedAt = '';
    loadCsvText(String(reader.result || ''), file.name);
  };
  reader.readAsText(file);
}

function loadCsvText(text, filename = 'pubs.csv') {
  const parsed = parseCsv(text);
  if (!parsed.headers.length) {
    clearEditor('CSV looks empty.');
    return;
  }
  state.headers = mergeHeaders(parsed.headers);
  state.rows = parsed.rows.map(row => materializeRow(row, state.headers));
  state.loadedFilename = filename;
  state.selectedIndex = state.rows.length ? 0 : -1;
  state.restoredFromDraft = false;
  state.draftSavedAt = '';
  renderPubList();
  if (hasSelection()) populateEditor();
  else clearEditor('No rows in CSV.');
  updateDirtyUi();
}

function mergeHeaders(headers) {
  const seen = new Set();
  const out = [];
  for (const h of headers) {
    const name = String(h || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  for (const h of KNOWN_HEADERS) {
    if (!seen.has(h)) out.push(h);
  }
  return out;
}

function materializeRow(row, headers) {
  const obj = {};
  headers.forEach(h => { obj[h] = String(row[h] ?? '').trim(); });
  return obj;
}

function parseCsv(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map(v => String(v || '').trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = String(cols[i] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
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

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[,"\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function buildCsvText() {
  return [state.headers.map(escapeCsvCell).join(',')]
    .concat(state.rows.map(row => state.headers.map(h => escapeCsvCell(row[h] ?? '')).join(',')))
    .join('\n');
}

function renderPubList() {
  const q = els.searchInput.value.trim().toLowerCase();
  state.filteredIndexes = [];

  if (q) {
    state.rows.forEach((row, idx) => {
      const hay = `${row.id} ${row.name} ${row.address}`.toLowerCase();
      if (hay.includes(q)) state.filteredIndexes.push(idx);
    });
    state.filteredIndexes = state.filteredIndexes.slice(0, MAX_SEARCH_RESULTS);
  } else if (hasSelection()) {
    state.filteredIndexes = [state.selectedIndex];
  }

  els.pubList.innerHTML = '';

  if (!state.rows.length) {
    els.pubList.innerHTML = '<div class="emptyList">No pubs loaded yet.</div>';
  } else if (!q && hasSelection()) {
    const row = state.rows[state.selectedIndex];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pubBtn active';
    btn.innerHTML = `<span class="name">${escapeHtml(row.name || '(untitled pub)')}</span><span class="meta">${escapeHtml(row.id || 'no-id')} · current selection</span>`;
    els.pubList.appendChild(btn);
  } else if (!q) {
    els.pubList.innerHTML = '<div class="emptyList">Type to search for a pub, or tap New pub.</div>';
  } else if (!state.filteredIndexes.length) {
    els.pubList.innerHTML = '<div class="emptyList">No matching pubs found.</div>';
  } else {
    state.filteredIndexes.forEach(idx => {
      const row = state.rows[idx];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pubBtn' + (idx === state.selectedIndex ? ' active' : '');
      btn.innerHTML = `<span class="name">${escapeHtml(row.name || '(untitled pub)')}</span><span class="meta">${escapeHtml(row.id || 'no-id')} · ${escapeHtml(row.spot_a || '')}</span>`;
      btn.addEventListener('click', () => {
        state.selectedIndex = idx;
        populateEditor();
        els.searchInput.value = '';
        renderPubList();
        updateDirtyUi();
        saveDraftToLocal();
      });
      els.pubList.appendChild(btn);
    });
  }

  const selected = hasSelection() ? state.rows[state.selectedIndex] : null;
  const selectedText = selected ? ` · selected: ${selected.name || selected.id || '(untitled pub)'}` : '';
  const draftText = state.restoredFromDraft ? ' · local draft active' : '';
  els.pubCount.textContent = `${state.rows.length} row${state.rows.length === 1 ? '' : 's'} · ${state.loadedFilename}${selectedText}${draftText}`;
}

function hasSelection() { return state.selectedIndex >= 0 && state.selectedIndex < state.rows.length; }
function getSelectedRow() { return hasSelection() ? state.rows[state.selectedIndex] : null; }

function populateEditor() {
  const row = getSelectedRow();
  if (!row) return clearEditor('No pub selected.');
  Object.entries(fieldIds).forEach(([key, el]) => {
    el.value = row[key] ?? '';
  });
  rebuildPointRowsFromString('a', false);
  rebuildPointRowsFromString('b', false);
  updatePreview();
  updateDirtyUi();
}

function clearEditor(message) {
  Object.values(fieldIds).forEach(el => { el.value = ''; });
  pointLists.a.innerHTML = '';
  pointLists.b.innerHTML = '';
  els.previewSummaryA.textContent = message || 'No preview yet';
  els.previewSummaryB.textContent = message || 'No preview yet';
  els.graphA.innerHTML = '';
  els.graphB.innerHTML = '';
  els.spotAStatus.className = 'pill muted';
  els.spotAStatus.textContent = 'Waiting for points';
  els.spotBStatus.className = 'pill muted';
  els.spotBStatus.textContent = 'Optional';
  updateDirtyUi();
}

function normalizeFieldValue(key, value) {
  if (key === 'worth_the_trip' || key === 'cycle_friendly') return String(value || '').trim().toLowerCase();
  return String(value ?? '').trim();
}

function createNewPub() {
  const row = {};
  state.headers.forEach(h => { row[h] = ''; });
  row.id = uniqueId('new_pub', state.rows.map(r => r.id));
  row.base_date = formatDate(new Date());
  state.rows.unshift(row);
  state.selectedIndex = 0;
  renderPubList();
  populateEditor();
  saveDraftToLocal();
}

function duplicateSelectedPub() {
  const row = getSelectedRow();
  if (!row) return;
  const copy = { ...row };
  copy.id = uniqueId((row.id || 'copy') + '_copy', state.rows.map(r => r.id));
  state.rows.splice(state.selectedIndex + 1, 0, copy);
  state.selectedIndex += 1;
  renderPubList();
  populateEditor();
  saveDraftToLocal();
}

function deleteSelectedPub() {
  if (!hasSelection()) return;
  state.rows.splice(state.selectedIndex, 1);
  state.selectedIndex = state.rows.length ? Math.min(state.selectedIndex, state.rows.length - 1) : -1;
  renderPubList();
  if (hasSelection()) populateEditor();
  else clearEditor('No pub selected.');
  saveDraftToLocal();
}

function uniqueId(base, existing) {
  const clean = String(base || 'pub').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'pub';
  let candidate = clean;
  let n = 2;
  const used = new Set(existing.filter(Boolean));
  while (used.has(candidate)) candidate = `${clean}_${n++}`;
  return candidate;
}

function addPointRow(spot, az = '', alt = '') {
  const row = pointRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.pointAz').value = az;
  row.querySelector('.pointAlt').value = alt;
  row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
    syncPointRowsToField(spot, false);
    updatePreview();
  }));
  row.querySelector('.pointDelete').addEventListener('click', () => {
    row.remove();
    syncPointRowsToField(spot, false);
    updatePreview();
  });
  pointLists[spot].appendChild(row);
  syncPointRowsToField(spot, false);
  saveDraftToLocal();
}

function rebuildPointRowsFromString(spot, preserveManualFocus) {
  const field = fieldIds[`spot_${spot}_horizon`];
  pointLists[spot].innerHTML = '';
  parseHorizonProfile(field.value).forEach(point => addPointRow(spot, point.az, point.alt));
  if (!parseHorizonProfile(field.value).length && !preserveManualFocus) {
    // keep list empty
  }
  syncPointRowsToField(spot, false);
}

function getPointRows(spot) {
  return [...pointLists[spot].querySelectorAll('.pointRow')].map(row => ({
    row,
    az: row.querySelector('.pointAz').value,
    alt: row.querySelector('.pointAlt').value
  }));
}

function sortPointRows(spot) {
  const points = collectPointsFromRows(spot).sort((a, b) => a.az - b.az);
  pointLists[spot].innerHTML = '';
  points.forEach(p => addPointRow(spot, p.az, p.alt));
  syncPointRowsToField(spot, true);
  updatePreview();
}

function collectPointsFromRows(spot) {
  return getPointRows(spot)
    .map(({ az, alt }) => ({ az: Number(az), alt: Number(alt) }))
    .filter(p => Number.isFinite(p.az) && Number.isFinite(p.alt));
}

function syncPointRowsToField(spot, sort = false) {
  let points = collectPointsFromRows(spot);
  if (sort) points = points.sort((a, b) => a.az - b.az);
  const text = points.map(p => `${trimNumber(p.az)}:${trimNumber(p.alt)}`).join('|');
  fieldIds[`spot_${spot}_horizon`].value = text;
  if (hasSelection()) state.rows[state.selectedIndex][`spot_${spot}_horizon`] = text;
  renderSpotStatus(spot, points);
  updateDirtyUi();
  saveDraftToLocal();
}

function trimNumber(n) {
  const s = Number(n).toFixed(4);
  return s.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}

function renderSpotStatus(spot, points) {
  const pill = spot === 'a' ? els.spotAStatus : els.spotBStatus;
  if (!points.length) {
    pill.className = 'pill muted';
    pill.textContent = spot === 'a' ? 'Waiting for points' : 'Optional';
    return;
  }
  if (points.length < 2) {
    pill.className = 'pill warn';
    pill.textContent = 'Need at least 2 points';
    return;
  }
  pill.className = 'pill good';
  pill.textContent = `${points.length} point${points.length === 1 ? '' : 's'}`;
}

function updatePreview() {
  const row = getSelectedRow();
  if (!row) return;
  updateSpotPreview('a', row, els.previewDateA.value || row.base_date || formatDate(new Date()));
  updateSpotPreview('b', row, els.previewDateB.value || row.base_date || formatDate(new Date()));
}

function updateSpotPreview(spot, row, dateStr) {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const horizon = row[`spot_${spot}_horizon`] || '';
  const summaryEl = spot === 'a' ? els.previewSummaryA : els.previewSummaryB;
  const graphEl = spot === 'a' ? els.graphA : els.graphB;
  const profile = parseHorizonProfile(horizon);
  const dateText = dateStr || formatDate(new Date());

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    summaryEl.textContent = 'Enter latitude and longitude for preview.';
    graphEl.innerHTML = '';
    return;
  }

  const preview = hasHorizonProfile(horizon)
    ? getWindowFromHorizon(lat, lng, horizon, dateText)
    : null;

  if (preview) {
    summaryEl.textContent = `Sun from ${fmtTime(preview.start)} to ${fmtTime(preview.end)} on ${dateText}`;
  } else if (profile.length >= 2) {
    summaryEl.textContent = `No sun window found on ${dateText}.`;
  } else {
    summaryEl.textContent = 'Add at least two horizon points for preview.';
  }

  renderGraph(graphEl, lat, lng, profile, dateText, preview);
}

function renderGraph(svg, lat, lng, profile, dateStr, preview) {
  const width = 360;
  const height = 220;
  const padL = 26;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const yForAlt = alt => padT + innerH - clamp(alt, 0, 90) / 90 * innerH;
  const xForAz = az => padL + clamp(az, 0, 360) / 360 * innerW;

  const sunPath = [];
  const targetDate = parseISODate(dateStr || formatDate(new Date()));
  for (let minutes = 7 * 60; minutes <= 23 * 60; minutes += 6) {
    const dt = minutesToLocalDate(targetDate, minutes);
    const sun = getSunPositionLocal(lat, lng, dt);
    sunPath.push({ az: sun.azimuth, alt: sun.elevation, minutes });
  }
  const visibleSunPath = sunPath.filter(p => p.alt > -6 && p.az >= 0 && p.az <= 360);

  let parts = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#fcfbf7" rx="14" ry="14"></rect>`);

  [0,90,180,270,360].forEach(az => {
    const x = xForAz(az);
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + innerH}" class="graphBoundary"></line>`);
    parts.push(`<text x="${x}" y="${height - 8}" text-anchor="middle" class="graphLabel">${az}°</text>`);
  });
  [0,15,30,45,60,75,90].forEach(alt => {
    const y = yForAlt(alt);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" class="graphBoundary"></line>`);
    parts.push(`<text x="4" y="${y + 4}" class="graphLabel">${alt}°</text>`);
  });

  if (visibleSunPath.length) {
    const sunPolyline = visibleSunPath.map(p => `${xForAz(p.az)},${yForAlt(p.alt)}`).join(' ');
    parts.push(`<polyline points="${sunPolyline}" class="graphLine graphSun"></polyline>`);
  }

  if (profile.length) {
    const horizonPolyline = profile.map(p => `${xForAz(p.az)},${yForAlt(p.alt)}`).join(' ');
    parts.push(`<polyline points="${horizonPolyline}" class="graphLine graphHorizon"></polyline>`);
    profile.forEach(p => {
      parts.push(`<circle cx="${xForAz(p.az)}" cy="${yForAlt(p.alt)}" r="3" class="graphPoint"></circle>`);
      parts.push(`<text x="${xForAz(p.az)+4}" y="${yForAlt(p.alt)-6}" class="graphLabel">${trimNumber(p.az)}:${trimNumber(p.alt)}</text>`);
    });
    if (profile.length >= 2) {
      parts.push(`<line x1="${xForAz(profile[0].az)}" y1="${padT}" x2="${xForAz(profile[0].az)}" y2="${padT+innerH}" class="graphBoundary"></line>`);
      parts.push(`<line x1="${xForAz(profile[profile.length-1].az)}" y1="${padT}" x2="${xForAz(profile[profile.length-1].az)}" y2="${padT+innerH}" class="graphBoundary"></line>`);
    }
  }

  if (preview) {
    const startSun = getSunPositionLocal(lat, lng, preview.start);
    const endSun = getSunPositionLocal(lat, lng, preview.end);
    [
      { label: `Start ${fmtTime(preview.start)}`, sun: startSun },
      { label: `End ${fmtTime(preview.end)}`, sun: endSun }
    ].forEach((item, idx) => {
      const x = xForAz(item.sun.azimuth);
      const y = yForAlt(item.sun.elevation);
      parts.push(`<circle cx="${x}" cy="${y}" r="4" fill="${idx === 0 ? '#1f6a20' : '#a12d22'}"></circle>`);
      parts.push(`<text x="${x + 5}" y="${y + (idx === 0 ? -6 : 14)}" class="graphLabel">${item.label}</text>`);
    });
  }

  parts.push(`<text x="${padL}" y="12" class="legend">Horizon profile</text>`);
  parts.push(`<text x="${padL + 104}" y="12" class="legend">·</text>`);
  parts.push(`<text x="${padL + 114}" y="12" class="legend">Sun path ${escapeHtml(dateStr)}</text>`);
  svg.innerHTML = parts.join('');
}

function downloadCsv() {
  if (!state.headers.length) return;
  const csv = buildCsvText();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pubs.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  updateDraftStatus('Downloaded pubs.csv. Upload that file to GitHub when ready.');
}

function updateDirtyUi() {
  const enabled = state.headers.length > 0;
  const settings = getGitHubSettings();
  els.btnDownload.disabled = !enabled;
  els.btnSaveDraft.disabled = !enabled;
  els.btnRestoreDraft.disabled = !hasLocalDraft();
  els.btnClearDraft.disabled = !hasLocalDraft();
  els.btnDuplicate.disabled = !hasSelection();
  els.btnDelete.disabled = !hasSelection();
  els.btnGitHubSave.disabled = !enabled || state.isSavingGitHub || !settings.owner || !settings.repo || !settings.path;
}

function saveDraftToLocal(manual = false) {
  if (!state.headers.length) return;
  const payload = {
    headers: state.headers,
    rows: state.rows,
    selectedIndex: state.selectedIndex,
    loadedFilename: state.loadedFilename,
    searchQuery: els.searchInput.value || '',
    previewDateA: els.previewDateA.value || '',
    previewDateB: els.previewDateB.value || '',
    githubSha: state.githubSha || '',
    savedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    state.draftSavedAt = payload.savedAt;
    state.restoredFromDraft = true;
    updateDraftStatus(manual ? 'Draft saved on this device.' : 'Draft auto-saved on this device.');
    updateDirtyUi();
  } catch {
    updateDraftStatus('Could not save local draft on this device.');
  }
}

function hasLocalDraft() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function restoreDraftFromLocal() {
  let raw = '';
  try {
    raw = localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload.headers) || !Array.isArray(payload.rows)) return false;
    state.headers = mergeHeaders(payload.headers);
    state.rows = payload.rows.map(row => materializeRow(row, state.headers));
    state.selectedIndex = Number.isInteger(payload.selectedIndex) ? Math.max(0, Math.min(payload.selectedIndex, Math.max(0, state.rows.length - 1))) : (state.rows.length ? 0 : -1);
    state.loadedFilename = payload.loadedFilename || 'pubs.csv';
    state.draftSavedAt = payload.savedAt || '';
    state.githubSha = payload.githubSha || '';
    state.restoredFromDraft = true;
    els.searchInput.value = payload.searchQuery || '';
    if (payload.previewDateA) els.previewDateA.value = payload.previewDateA;
    if (payload.previewDateB) els.previewDateB.value = payload.previewDateB;
    renderPubList();
    if (hasSelection()) populateEditor();
    else clearEditor('No rows in local draft.');
    updateDirtyUi();
    return true;
  } catch {
    return false;
  }
}

function clearLocalDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  state.draftSavedAt = '';
  state.restoredFromDraft = false;
  updateDirtyUi();
}

function updateDraftStatus(message = '') {
  let text = message;
  if (!text) {
    if (state.restoredFromDraft && state.draftSavedAt) {
      text = `Local draft active on this device · last saved ${formatDraftStamp(state.draftSavedAt)}.`;
    } else if (hasLocalDraft()) {
      text = 'Local draft available on this device.';
    } else {
      text = 'Latest CSV will load by default. Local draft restore is available on this device.';
    }
  }
  els.draftStatus.textContent = text;
}

function formatDraftStamp(isoText) {
  const dt = new Date(isoText);
  if (Number.isNaN(dt.getTime())) return 'recently';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(dt);
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

function hasHorizonProfile(horizonStr) {
  return parseHorizonProfile(horizonStr).length >= 2;
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
  return Infinity;
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
  return { start: firstSun, end: lastSun };
}

function getSunPositionLocal(lat, lng, dateObj) {
  const parts = getLondonDateParts(dateObj);
  const localMinutes = parts.hour + (parts.minute / 60) + (parts.second / 3600);
  const dayDate = createUtcAnchorDate(parts.year, parts.month, parts.day);
  const n = dayOfYear(dayDate);
  const gamma = (2 * Math.PI / 365) * (n - 1 + ((localMinutes - 12) / 24));
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const tzOffsetMin = getLondonOffsetMinutesForDateParts(parts.year, parts.month, parts.day);
  const minutesNow = (parts.hour * 60) + parts.minute + (parts.second / 60);
  const trueSolarTime = (minutesNow + eqTime + (4 * lng) - tzOffsetMin + 1440) % 1440;
  const hourAngleDeg = (trueSolarTime / 4) - 180;
  const hourAngle = deg2rad(hourAngleDeg);
  const latRad = deg2rad(lat);
  const cosZenith = (Math.sin(latRad) * Math.sin(decl)) + (Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle));
  const zenith = Math.acos(clamp(cosZenith, -1, 1));
  const elevation = 90 - rad2deg(zenith);
  const azimuthRad = Math.atan2(Math.sin(hourAngle), (Math.cos(hourAngle) * Math.sin(latRad)) - (Math.tan(decl) * Math.cos(latRad)));
  const azimuth = (rad2deg(azimuthRad) + 180 + 360) % 360;
  return { azimuth, elevation };
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
  return new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
function deg2rad(d) { return d * Math.PI / 180; }
function rad2deg(r) { return r * 180 / Math.PI; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
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
  return utcMs >= getLondonDstStartUtc(year) && utcMs < getLondonDstEndUtc(year);
}
function getLondonOffsetMinutesForDateParts(year, month, day) {
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  return isLondonDstAtUtc(noonUtc) ? 60 : 0;
}
function getLondonDateParts(dateObj) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(dateObj instanceof Date ? dateObj : new Date(dateObj));
  const out = {};
  for (const part of parts) if (part.type !== 'literal') out[part.type] = Number(part.value);
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
}
function createUtcAnchorDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}
function minutesToLocalDate(dateObj, minutes) {
  const year = dateObj.getUTCFullYear();
  const month = dateObj.getUTCMonth() + 1;
  const day = dateObj.getUTCDate();
  const offsetMinutes = getLondonOffsetMinutesForDateParts(year, month, day);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes, 0, 0) - (offsetMinutes * 60000));
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(base64Text) {
  const binary = atob(base64Text || '');
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}
