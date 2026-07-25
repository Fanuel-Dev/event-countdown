const COLORS = [
  {name:'cobalt', hex:'#5b7fd1'},
  {name:'amber', hex:'#e0a458'},
  {name:'sage', hex:'#7fae94'},
  {name:'rust', hex:'#c1552e'},
];
let selectedColor = COLORS[0].name;
let events = [];        // {id, title, targetISO, color}
let featuredId = null;
let storageOK = true;

const colorPicks = document.getElementById('colorPicks');
COLORS.forEach(c => {
  const el = document.createElement('div');
  el.className = 'swatch' + (c.name === selectedColor ? ' selected' : '');
  el.style.background = c.hex;
  el.dataset.name = c.name;
  el.addEventListener('click', () => {
    selectedColor = c.name;
    colorPicks.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
  });
  colorPicks.appendChild(el);
});
function colorHex(name){ return (COLORS.find(c => c.name === name) || COLORS[0]).hex; }

async function safeGet(key){
  try{ const r = await window.storage.get(key, false); return r ? r.value : null; }
  catch(e){ return null; }
}
async function safeSet(key, value){
  try{ return await window.storage.set(key, value, false); }
  catch(e){ storageOK = false; return null; }
}
async function safeDelete(key){
  try{ return await window.storage.delete(key, false); }
  catch(e){ return null; }
}

async function loadEvents(){
  const idxRaw = await safeGet('events:index');
  const ids = idxRaw ? JSON.parse(idxRaw) : [];
  const loaded = [];
  for(const id of ids){
    const raw = await safeGet(`events:${id}`);
    if(raw){ try{ loaded.push(JSON.parse(raw)); }catch(e){} }
  }
  events = loaded.sort((a,b) => new Date(a.targetISO) - new Date(b.targetISO));
  featuredId = await safeGet('featured-id');
  if(!featuredId || !events.find(e => e.id === featuredId)){
    const upcoming = events.find(e => new Date(e.targetISO) > new Date());
    featuredId = upcoming ? upcoming.id : (events[0] ? events[0].id : null);
  }
}

async function saveIndex(){
  await safeSet('events:index', JSON.stringify(events.map(e => e.id)));
}
async function saveEvent(evt){
  await safeSet(`events:${evt.id}`, JSON.stringify(evt));
}
async function deleteEventStorage(id){
  await safeDelete(`events:${id}`);
}
async function saveFeatured(id){
  featuredId = id;
  await safeSet('featured-id', id || "");
}

/* ---------------- Flap digit widget ---------------- */
function buildFlapGroup(label, digitCount){
  const group = document.createElement('div');
  group.className = 'flap-group';
  const row = document.createElement('div');
  row.className = 'flap-row';
  const cells = [];
  for(let i=0;i<digitCount;i++){
    const cell = document.createElement('div');
    cell.className = 'flap-digit';
    cell.dataset.value = '0';
    cell.innerHTML = `
      <div class="flap-half top"><span>0</span></div>
      <div class="flap-half bottom"><span>0</span></div>
      <div class="flip-panel">
        <div class="face front"><span>0</span></div>
        <div class="face back"><span>0</span></div>
      </div>`;
    row.appendChild(cell);
    cells.push(cell);
  }
  const lbl = document.createElement('div');
  lbl.className = 'flap-label';
  lbl.textContent = label;
  group.appendChild(row);
  group.appendChild(lbl);
  return { group, cells };
}

function updateDigit(cell, newVal){
  const oldVal = cell.dataset.value;
  if(oldVal === String(newVal)) return;
  const bottomSpan = cell.querySelector('.flap-half.bottom span');
  const topSpan = cell.querySelector('.flap-half.top span');
  const flip = cell.querySelector('.flip-panel');
  const front = flip.querySelector('.front span');
  const back = flip.querySelector('.back span');

  bottomSpan.textContent = newVal;          // bottom updates immediately, like a real leaf drop
  front.textContent = oldVal;
  back.textContent = newVal;
  flip.classList.remove('flipping');
  void flip.offsetWidth; // restart animation
  flip.classList.add('flipping');

  const onEnd = () => {
    topSpan.textContent = newVal;
    flip.classList.remove('flipping');
    flip.removeEventListener('animationend', onEnd);
  };
  flip.addEventListener('animationend', onEnd);
  cell.dataset.value = String(newVal);
}

function setDigitsInstant(cells, str){
  const padded = str.padStart(cells.length, '0');
  cells.forEach((cell, i) => {
    const v = padded[i];
    cell.dataset.value = v;
    cell.querySelector('.flap-half.top span').textContent = v;
    cell.querySelector('.flap-half.bottom span').textContent = v;
    cell.querySelector('.front span').textContent = v;
    cell.querySelector('.back span').textContent = v;
  });
}
function setDigitsAnimated(cells, str){
  const padded = str.padStart(cells.length, '0');
  cells.forEach((cell, i) => updateDigit(cell, padded[i]));
}

/* ---------------- Board setup ---------------- */
const flapGroups = document.getElementById('flapGroups');
const daysG = buildFlapGroup('Days', 3);
const hoursG = buildFlapGroup('Hours', 2);
const minsG = buildFlapGroup('Minutes', 2);
const secsG = buildFlapGroup('Seconds', 2);
[daysG, hoursG, minsG, secsG].forEach(g => flapGroups.appendChild(g.group));

let firstTick = true;

function computeParts(targetISO){
  const diff = new Date(targetISO) - new Date();
  if(diff <= 0) return null;
  const totalSec = Math.floor(diff/1000);
  const days = Math.min(999, Math.floor(totalSec / 86400));
  const hours = Math.floor((totalSec % 86400)/3600);
  const mins = Math.floor((totalSec % 3600)/60);
  const secs = totalSec % 60;
  return { days, hours, mins, secs };
}

function renderBoard(){
  const featTitle = document.getElementById('featTitle');
  const featSub = document.getElementById('featSub');
  const featDot = document.getElementById('featDot');
  const boardBody = document.getElementById('boardBody');

  if(!events.length){
    featTitle.textContent = "No events yet";
    featSub.textContent = "Add one below to start the countdown";
    boardBody.innerHTML = '';
    boardBody.appendChild(flapGroups);
    return;
  }
  const evt = events.find(e => e.id === featuredId) || events[0];
  featTitle.textContent = evt.title;
  featDot.style.background = colorHex(evt.color);
  const dt = new Date(evt.targetISO);
  featSub.innerHTML = `<b>${dt.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'})}</b> at ${dt.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`;

  const parts = computeParts(evt.targetISO);
  if(!parts){
    boardBody.innerHTML = `<div class="arrived-msg">✦ It's here ✦</div>`;
    return;
  }
  if(boardBody.querySelector('.arrived-msg') || !boardBody.contains(flapGroups)){
    boardBody.innerHTML = '';
    boardBody.appendChild(flapGroups);
  }
  const dStr = String(parts.days), hStr = String(parts.hours).padStart(2,'0'),
        mStr = String(parts.mins).padStart(2,'0'), sStr = String(parts.secs).padStart(2,'0');
  if(firstTick){
    setDigitsInstant(daysG.cells, dStr);
    setDigitsInstant(hoursG.cells, hStr);
    setDigitsInstant(minsG.cells, mStr);
    setDigitsInstant(secsG.cells, sStr);
    firstTick = false;
  } else {
    setDigitsAnimated(daysG.cells, dStr);
    setDigitsAnimated(hoursG.cells, hStr);
    setDigitsAnimated(minsG.cells, mStr);
    setDigitsAnimated(secsG.cells, sStr);
  }
}

/* ---------------- Manifest list ---------------- */
function fmtRemain(targetISO){
  const parts = computeParts(targetISO);
  if(!parts) return { text: 'Departed', departed: true };
  if(parts.days > 0) return { text: `${parts.days}d ${parts.hours}h ${parts.mins}m`, departed: false };
  if(parts.hours > 0) return { text: `${parts.hours}h ${parts.mins}m ${parts.secs}s`, departed: false };
  return { text: `${parts.mins}m ${parts.secs}s`, departed: false };
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderManifest(){
  const manifest = document.getElementById('manifest');
  manifest.innerHTML = '';
  if(!events.length){
    manifest.innerHTML = `<div class="empty-state">Nothing on the board yet. Add your first event above.</div>`;
    return;
  }
  events.forEach(evt => {
    const dt = new Date(evt.targetISO);
    const remain = fmtRemain(evt.targetISO);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="tag" style="background:${colorHex(evt.color)}"></div>
      <div class="title">${escapeHtml(evt.title)}</div>
      <div class="when">${dt.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})} · ${dt.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</div>
      <div class="remain ${remain.departed ? 'departed' : ''}">${remain.text}</div>
      <div class="row-actions">
        <button class="feature ${evt.id === featuredId ? 'featured' : ''}">${evt.id === featuredId ? 'Featured' : 'Feature'}</button>
        <button class="del">Remove</button>
      </div>
    `;
    row.querySelector('.feature').addEventListener('click', async () => {
      await saveFeatured(evt.id);
      firstTick = true;
      renderBoard(); renderManifest();
    });
    row.querySelector('.del').addEventListener('click', async () => {
      events = events.filter(e => e.id !== evt.id);
      await deleteEventStorage(evt.id);
      await saveIndex();
      if(featuredId === evt.id){
        const upcoming = events.find(e => new Date(e.targetISO) > new Date());
        await saveFeatured(upcoming ? upcoming.id : (events[0] ? events[0].id : null));
        firstTick = true;
      }
      renderBoard(); renderManifest();
    });
    manifest.appendChild(row);
  });
}

/* ---------------- Add event ---------------- */
document.getElementById('addBtn').addEventListener('click', async () => {
  const title = document.getElementById('inTitle').value.trim();
  const dateVal = document.getElementById('inDate').value;
  const timeVal = document.getElementById('inTime').value || '00:00';
  if(!title || !dateVal) return;
  const targetISO = new Date(`${dateVal}T${timeVal}:00`).toISOString();
  const id = 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  const evt = { id, title, targetISO, color: selectedColor };
  events.push(evt);
  events.sort((a,b) => new Date(a.targetISO) - new Date(b.targetISO));
  await saveEvent(evt);
  await saveIndex();
  if(events.length === 1 || !featuredId){
    await saveFeatured(id);
  }
  firstTick = true;
  document.getElementById('inTitle').value = '';
  document.getElementById('inDate').value = '';
  document.getElementById('inTime').value = '';
  renderBoard(); renderManifest();
});

/* ---------------- Init + tick loop ---------------- */
(async function init(){
  await loadEvents();
  renderBoard();
  renderManifest();
  setInterval(() => { renderBoard(); renderManifest(); }, 1000);
})();