// Drinking in the Sun — starter data + simple filtering
// IMPORTANT: The sun windows below are DEMO placeholders.

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
  {
  id: 'pitcher',
  name: 'Pitcher & Piano',
  area: 'Nottingham (Lace Market)',
  notes: 'Large terrace facing south-west. Good afternoon sun.',
  sunWindows: {
    May: [{ spot: 'Front terrace', start: '13:00', end: '18:30' }],
    Jun: [{ spot: 'Front terrace', start: '12:00', end: '20:00' }]
  }
},
{
  id: 'barrel',
  name: 'Barrel Drop',
  area: 'Nottingham (Hurts Yard)',
  notes: 'Street seating catches late sun.',
  sunWindows: {
    May: [{ spot: 'Outdoor tables', start: '16:00', end: '19:30' }],
    Jun: [{ spot: 'Outdoor tables', start: '15:00', end: '20:30' }]
  }
},
{
  id: 'tripitaly',
  name: 'Bunkers Hill',
  area: 'Nottingham (Hockley)',
  notes: 'Small outside area on street.',
  sunWindows: {
    May: [{ spot: 'Street seating', start: '15:30', end: '18:00' }],
    Jun: [{ spot: 'Street seating', start: '14:30', end: '19:00' }]
  }
},
{
  id: 'keanshead',
  name: 'Kean’s Head',
  area: 'Nottingham (Lace Market)',
  notes: 'Front pavement seating.',
  sunWindows: {
    May: [{ spot: 'Front tables', start: '14:00', end: '17:30' }],
    Jun: [{ spot: 'Front tables', start: '13:30', end: '19:00' }]
  }
},
{
  id: 'canalturn',
  name: 'The Canal Turn',
  area: 'Nottingham (Canal)',
  notes: 'Large waterside terrace.',
  sunWindows: {
    May: [{ spot: 'Canal terrace', start: '11:30', end: '17:30' }],
    Jun: [{ spot: 'Canal terrace', start: '11:00', end: '19:30' }]
  }
},
{
  id: 'vatandfiddle',
  name: 'Vat & Fiddle',
  area: 'Nottingham (Canal / Station)',
  notes: 'Canal-side seating gets good midday sun.',
  sunWindows: {
    May: [{ spot: 'Canal seating', start: '12:00', end: '16:00' }],
    Jun: [{ spot: 'Canal seating', start: '11:30', end: '18:00' }]
  }
},
{
  id: 'foxhound',
  name: 'The Fox & Grapes',
  area: 'Nottingham (Sneinton Market)',
  notes: 'Outside tables face west.',
  sunWindows: {
    May: [{ spot: 'Outdoor seating', start: '15:00', end: '19:00' }],
    Jun: [{ spot: 'Outdoor seating', start: '14:00', end: '20:30' }]
  }
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
    .map((p) => {
      const win = p.sunWindows?.[month] || [];
      const match = matchesWindow(win, t);
      return { pub:p, match };
    })
    .filter((x) => {
      if(!q) return true;
      return (
        x.pub.name.toLowerCase().includes(q) ||
        x.pub.area.toLowerCase().includes(q)
      );
    })
    .sort((a,b) => Number(b.match.ok) - Number(a.match.ok));

  const sunnyCount = results.filter((r) => r.match.ok).length;

  summary.innerHTML = `
    <strong>${sunnyCount}</strong> of <strong>${results.length}</strong> pubs match your filters for <strong>${month}</strong> at <strong>${t}</strong>.
    <div class="small">Demo windows. Edit <code>public/app.js</code> to replace with real observations.</div>
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
