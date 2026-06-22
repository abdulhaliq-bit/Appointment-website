/**
 * Appointment Booking — app.js
 *
 * Replace the two values in CONFIG before deploying:
 *   CLIENT_ID   — your OAuth 2.0 client ID from Google Cloud Console
 *   CALENDAR_ID — your Google Calendar ID (Settings → Integrate calendar)
 *
 * Required OAuth scope: https://www.googleapis.com/auth/calendar.events
 * Ensure your domain is added as an Authorized JavaScript Origin in
 * the Google Cloud Console OAuth client settings.
 *
 * Slot rules:
 *   - 6 slots per day: 9–10, 10–11, 11–12, 1–2, 2–3, 3–4
 *   - Each slot holds exactly 1 customer (1 hour duration)
 *   - Booked slots are greyed out and unselectable
 */

/* ─── Config ──────────────────────────────────────────────────── */
const CONFIG = {
  CLIENT_ID:        '235751329614-igv6su08k8v2je8fenccts0qc0184mgv.apps.googleusercontent.com',
  CALENDAR_ID:      'qilahludba@gmail.com',
  DURATION_MINUTES: 60,
  TIMEZONE:         'Asia/Colombo',
};

/* ─── Available time slots ────────────────────────────────────── */
const ALL_SLOTS = [
  { value: '09:00', label: '9:00 AM – 10:00 AM' },
  { value: '10:00', label: '10:00 AM – 11:00 AM' },
  { value: '11:00', label: '11:00 AM – 12:00 PM' },
  { value: '13:00', label: '1:00 PM – 2:00 PM' },
  { value: '14:00', label: '2:00 PM – 3:00 PM' },
  { value: '15:00', label: '3:00 PM – 4:00 PM' },
];

/* ─── State ───────────────────────────────────────────────────── */
let tokenClient    = null;
let accessToken    = null;
let pendingSubmit  = false;
let selectedType   = '';
let currentStep    = 1;
// bookedSlots: { "YYYY-MM-DD": Set<"HH:00"> }
// Persisted in sessionStorage so refreshing the page retains slots
// booked during the current browser session.
let bookedSlots    = {};

/* ─── Init ────────────────────────────────────────────────────── */
window.addEventListener('load', () => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('f-date').min = today;

  // Restore any slots booked this session
  try {
    const stored = sessionStorage.getItem('bookedSlots');
    if (stored) bookedSlots = JSON.parse(stored);
  } catch (e) { bookedSlots = {}; }

  // Re-render slots whenever the date changes
  document.getElementById('f-date').addEventListener('change', () => {
    const date = document.getElementById('f-date').value;
    if (date) {
      clearFieldErr('f-date', 'e-date');
      renderTimeSlots(date);
    }
  });

  setTimeout(initGsi, 1500);
});

/* ─── Render time slots for a given date ─────────────────────── */
function renderTimeSlots(date) {
  const select = document.getElementById('f-time');
  const booked = bookedSlots[date] ? bookedSlots[date] : [];

  select.innerHTML = '<option value="">Select a time...</option>';

  ALL_SLOTS.forEach(slot => {
    const taken = booked.includes(slot.value);
    const opt   = document.createElement('option');
    opt.value    = taken ? '' : slot.value;
    opt.textContent = taken ? `${slot.label} — Unavailable` : slot.label;
    opt.disabled = taken;
    if (taken) opt.style.color = '#aaa';
    select.appendChild(opt);
  });

  // Check if all slots are taken
  const allTaken = ALL_SLOTS.every(s => booked.includes(s.value));
  if (allTaken) {
    select.innerHTML = '<option value="">No slots available on this date</option>';
    showDateFullNotice(true);
  } else {
    showDateFullNotice(false);
  }
}

function showDateFullNotice(show) {
  let notice = document.getElementById('date-full-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'date-full-notice';
    notice.className = 'date-full-notice';
    notice.textContent = 'This date is fully booked. Please choose a different date.';
    const dateField = document.getElementById('f-date').parentNode;
    dateField.parentNode.insertBefore(notice, dateField.parentNode.nextSibling);
  }
  notice.style.display = show ? 'block' : 'none';
}

/* ─── Mark a slot as booked (called after successful Calendar POST) */
function markSlotBooked(date, time) {
  if (!bookedSlots[date]) bookedSlots[date] = [];
  if (!bookedSlots[date].includes(time)) bookedSlots[date].push(time);
  try { sessionStorage.setItem('bookedSlots', JSON.stringify(bookedSlots)); } catch (e) {}
}

/* ─── Google Identity Services ───────────────────────────────── */
function initGsi() {
  if (typeof google === 'undefined' || !google.accounts) return;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: (response) => {
      if (response.error) {
        pendingSubmit = false;
        showToast('Something went wrong. Please try again.');
        resetConfirmBtn();
        return;
      }
      accessToken = response.access_token;
      if (pendingSubmit) {
        pendingSubmit = false;
        doAddToCalendar();
      }
    },
  });
}

/* ─── Pill selector ───────────────────────────────────────────── */
document.getElementById('pills').addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
  pill.classList.add('selected');
  selectedType = pill.dataset.val;
  document.getElementById('e-type').classList.remove('show');
});

/* ─── Validation helpers ──────────────────────────────────────── */
function setFieldErr(inputId, errId, hasError) {
  const input = document.getElementById(inputId);
  const msg   = document.getElementById(errId);
  if (input) input.classList.toggle('err', hasError);
  if (msg)   msg.classList.toggle('show', hasError);
}

function clearFieldErr(inputId, errId) {
  setFieldErr(inputId, errId, false);
}

['f-name', 'f-phone', 'f-email', 'f-area'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  const errId = 'e-' + id.replace('f-', '');
  el.addEventListener('input', () => clearFieldErr(id, errId));
});

document.getElementById('f-time').addEventListener('change', () => {
  clearFieldErr('f-time', 'e-time');
});

/* ─── Step 1: validate & advance ─────────────────────────────── */
function nextStep1() {
  let valid = true;

  const name      = document.getElementById('f-name').value.trim();
  const phone     = document.getElementById('f-phone').value.trim();
  const email     = document.getElementById('f-email').value.trim();
  const area      = document.getElementById('f-area').value.trim();
  const emailOk   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  setFieldErr('f-name',  'e-name',  !name);       if (!name)    valid = false;
  setFieldErr('f-phone', 'e-phone', !phone);      if (!phone)   valid = false;
  setFieldErr('f-email', 'e-email', !emailOk);    if (!emailOk) valid = false;
  setFieldErr('f-area',  'e-area',  !area);       if (!area)    valid = false;

  if (!selectedType) {
    document.getElementById('e-type').classList.add('show');
    valid = false;
  }

  if (valid) goStep(2);
}

/* ─── Step 2: validate & advance ─────────────────────────────── */
function nextStep2() {
  let valid = true;

  const date = document.getElementById('f-date').value;
  const time = document.getElementById('f-time').value;

  setFieldErr('f-date', 'e-date', !date); if (!date) valid = false;
  setFieldErr('f-time', 'e-time', !time); if (!time) valid = false;

  if (valid) {
    buildReview();
    goStep(3);
  }
}

/* ─── Step navigation ─────────────────────────────────────────── */
function goStep(n) {
  [1, 2, 3, 4].forEach(i => {
    document.getElementById('step' + i).style.display = i === n ? 'block' : 'none';
  });
  currentStep = n;
  updateStepDots(n);

  const stepsWrapper = document.getElementById('steps-wrapper');
  if (stepsWrapper) stepsWrapper.style.display = n === 4 ? 'none' : 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepDots(n) {
  [1, 2, 3].forEach(i => {
    const dot = document.getElementById('sd' + i);
    const lbl = document.getElementById('sl-' + i);

    if (i < n)      { dot.className = 'step-dot done';   dot.textContent = '✓'; }
    else if (i === n) { dot.className = 'step-dot active'; dot.textContent = i; }
    else            { dot.className = 'step-dot idle';   dot.textContent = i; }

    if (lbl) lbl.className = i === n ? 'active-lbl' : '';
  });

  ['sl1', 'sl2'].forEach((id, idx) => {
    const line = document.getElementById(id);
    if (line) line.className = (idx + 1) < n ? 'step-line done' : 'step-line';
  });
}

/* ─── Build review table ──────────────────────────────────────── */
function buildReview() {
  const timeVal  = document.getElementById('f-time').value;
  const slot     = ALL_SLOTS.find(s => s.value === timeVal);
  const slotLabel = slot ? slot.label : formatTime(timeVal);

  const rows = [
    ['Full name',       document.getElementById('f-name').value.trim()],
    ['Phone',           document.getElementById('f-phone').value.trim()],
    ['Email',           document.getElementById('f-email').value.trim()],
    ['Property type',   selectedType],
    ['Area / District', document.getElementById('f-area').value.trim()],
    ['Notes',           document.getElementById('f-notes').value.trim() || '—'],
    ['Date',            formatDate(document.getElementById('f-date').value)],
    ['Time slot',       slotLabel],
  ];

  document.getElementById('review-table').innerHTML = rows
    .map(([key, val]) => `<tr><td>${key}</td><td>${escHtml(val)}</td></tr>`)
    .join('');
}

/* ─── Confirm & calendar integration ─────────────────────────── */
function handleConfirm() {
  const btn = document.getElementById('confirm-btn');
  btn.textContent = 'Confirming...';
  btn.classList.add('btn-loading');

  if (!accessToken) {
    pendingSubmit = true;
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      pendingSubmit = false;
      doAddToCalendar();
    }
  } else {
    doAddToCalendar();
  }
}

function doAddToCalendar() {
  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const area  = document.getElementById('f-area').value.trim();
  const notes = document.getElementById('f-notes').value.trim();
  const date  = document.getElementById('f-date').value;
  const time  = document.getElementById('f-time').value;

  const slot      = ALL_SLOTS.find(s => s.value === time);
  const slotLabel = slot ? slot.label : formatTime(time);

  const startDT = `${date}T${time}:00`;
  const endDate = new Date(`${date}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + CONFIG.DURATION_MINUTES);
  const endDT = endDate.toISOString().slice(0, 19);

  const event = {
    summary: `Appointment — ${name}`,
    description: [
      `Name:      ${name}`,
      `Phone:     ${phone}`,
      `Email:     ${email}`,
      `Property:  ${selectedType}`,
      `Area:      ${area}`,
      `Time slot: ${slotLabel}`,
      `Notes:     ${notes || '—'}`,
    ].join('\n'),
    start: { dateTime: startDT, timeZone: CONFIG.TIMEZONE },
    end:   { dateTime: endDT,   timeZone: CONFIG.TIMEZONE },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
  };

  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.CALENDAR_ID)}/events`;

  fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(event) })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`)))
    .then(() => {
      // Mark this slot as taken before showing success
      markSlotBooked(date, time);
      showSuccess();
    })
    .catch(err => {
      console.error('[Calendar] Event creation failed:', err.message);
      showToast('Something went wrong. Please try again.');
      resetConfirmBtn();
    });
}

/* ─── Success screen ──────────────────────────────────────────── */
function showSuccess() {
  document.getElementById('ref-code').textContent = generateRef();
  goStep(4);
}

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BK-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

/* ─── Reset form ──────────────────────────────────────────────── */
function resetForm() {
  ['f-name', 'f-phone', 'f-email', 'f-area', 'f-notes', 'f-date'].forEach(id => {
    document.getElementById(id).value = '';
  });

  // Reset time slot dropdown to default (no date selected yet)
  const select = document.getElementById('f-time');
  select.innerHTML = '<option value="">Select a time...</option>';
  ALL_SLOTS.forEach(slot => {
    const opt = document.createElement('option');
    opt.value = slot.value;
    opt.textContent = slot.label;
    select.appendChild(opt);
  });

  document.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
  selectedType = '';

  document.querySelectorAll('.err-msg, .pills-err').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.err').forEach(el => el.classList.remove('err'));

  const notice = document.getElementById('date-full-notice');
  if (notice) notice.style.display = 'none';

  accessToken   = null;
  pendingSubmit = false;

  goStep(1);
}

/* ─── Utilities ───────────────────────────────────────────────── */
function resetConfirmBtn() {
  const btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent = 'Confirm booking'; btn.classList.remove('btn-loading'); }
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, min] = timeStr.split(':');
  const hour = parseInt(h, 10);
  return `${hour > 12 ? hour - 12 : hour || 12}:${min} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
