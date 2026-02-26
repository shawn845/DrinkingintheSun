// Drinking in the Sun — starter data + simple filtering
// IMPORTANT: The sun windows below are DEMO placeholders.
// Replace with your own observations/estimates later.

const pubs = [
  {
    id: 'angel',
    name: 'The Angel Microbrewery',
    area: 'Nottingham (Hockley / City)',
    notes: 'Starter demo entry. Update sun windows based on real observations.',
    sunWindows: {
      May: [{ spot: 'Front window', start: '14:00', end: '15:00' }],
      Jun: [{ spot: 'Front window', start: '13:30', end: '16:00' }]
    }
  },
  {
    id: 'canalhouse',
    name: 'The Canalhouse',
    area: 'Nottingham (Canal)',
    notes: 'Starter demo entry.',
    sunWindows: {
      May: [{ spot: 'Outside by canal', start: '12:00', end: '16:30' }],
      Jun: [{ spot: 'Outside by canal', start: '11:30', end: '18:00' }]
    }
  },
  {
    id: 'trip',
    name: 'Ye Olde Trip to Jerusalem',
    area: 'Nottingham (Castle)',
    notes: 'Starter demo entry.',
    sunWindows: {
      May: [{ spot: 'Beer garden', start: '12:30', end: '15:30' }],
      Jun: [{ spot: 'Beer garden', start: '12:00', end: '17:00' }]
    }
  },
  {
    id: 'bell',
    name: 'The Bell Inn',
    area: 'Nottingham (Market Square)',
    notes: 'Starter demo entry.',
    sunWindows: {
      May: [{ spot: 'Front seating', start: '15:00', end: '18:00' }],
      Jun: [{ spot: 'Front seating', start: '14:00', end: '19:00' }]
    }
  },
  {
    id: 'roundhouse',
    name: 'The Roundhouse',
    area: 'Nottingham (Lace Market)',
    notes: 'Starter demo entry.',
    sunWindows: {
      May: [{ spot: 'Courtyard', start: '11:30', end: '14:30' }],
      Jun: [{ spot: 'Courtyard', start: '11:00', end: '16:00' }]
    }
  }
];

const monthSelect = document.getElementById('monthSelect');
const timeInput = document.getElementById('timeInput');
const searchInput = document.getElementById('searchInput');
const pubList = document.getElementById('pubList');
const summary = document.getElementById('summary');

function toMinutes(hhmm){
  const [h,m] = hhmm.split(':').map(Number);
  return (h*60) + m;
}

function matchesWindow(windows, timeHHMM){
  if(!windows || windows.length === 0) return { ok:false };
  const t = toMinutes(timeHHMM);
  for(const w of windows){
    const s = toMinutes(w.start);
    const e = toMinutes(w.end);
    if(t >= s && t <= e) return { ok:true, window:w };
  }
  return { ok:false };
}

function render(){
  const month = monthSelect.value;
  const t = timeInput.value || '12:00';
  const q = (searchInput.value || '').trim().toLowerCase();

  const results = pubs
    .map(p => {
      const win = p.sunWindows?.[month] || [];
      const match = matchesWindow(win, t);
      return { pub:p, match };
    })
    .filter(x => {
      if(!q) return true;
      return (
        x.pub.name.toLowerCase().includes(q) ||
        x.pub.area.toLowerCase().includes(q)
      );
    })
    .sort((a,b) => Number(b.match.ok) - Number(a.match.ok));

  const sunnyCount = results.filter(r => r.match.ok).length;
  summary.innerHTML = `
    <strong>${sunnyCount}</strong> of <strong>${results.length}</strong> pubs match your filters for <strong>${month}</strong> at <strong>${t}</strong>.
    <div class="small">These are starter demo windows. Edit <code>public/app.js</code> to replace with real observations.</div>
  `;

  pubList.innerHTML = results.map(({pub, match}) => {
    const badge = match.ok
      ? `<span class="badge yes">☀️ Likely sun — ${match.window.spot} (${match.window.start}–${match.window.end})</span>`
      : `<span class="badge no">⛅ No sun window set at this time</span>`;

    return `
      <article class="card">
        <h3>${pub.name}</h3>
        <div class="meta">${pub.area}</div>
        ${badge}
        <div class="small">${pub.notes || ''}</div>
      </article>
    `;
  }).join('');
}

monthSelect.addEventListener('change', render);
timeInput.addEventListener('input', render);
searchInput.addEventListener('input', render);

// PWA install button
let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// Service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

render();
