/* ─── Config — replace these two values ──────────────────────── */
const CONFIG = {
  CLIENT_ID:        'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  CALENDAR_ID:      'YOUR_CALENDAR_ID_HERE',
  DURATION_MINUTES: 60,
  TIMEZONE:         'Asia/Colombo',
};

/* ─── Time slots ──────────────────────────────────────────────── */
const ALL_SLOTS = [
  { value: '09:00', label: '9:00 AM - 10:00 AM'  },
  { value: '10:00', label: '10:00 AM - 11:00 AM' },
  { value: '11:00', label: '11:00 AM - 12:00 PM' },
  { value: '13:00', label: '1:00 PM - 2:00 PM'   },
  { value: '14:00', label: '2:00 PM - 3:00 PM'   },
  { value: '15:00', label: '3:00 PM - 4:00 PM'   },
];

/* ─── State ───────────────────────────────────────────────────── */
var tokenClient   = null;
var accessToken   = null;
var pendingSubmit = false;
var selectedType  = '';
var bookedSlots   = {};
var toastTimer    = null;

/* ─── Init on page load ───────────────────────────────────────── */
window.addEventListener('load', function() {
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('f-date').min = today;

  try {
    var stored = sessionStorage.getItem('bookedSlots');
    if (stored) bookedSlots = JSON.parse(stored);
  } catch(e) { bookedSlots = {}; }

  document.getElementById('f-date').addEventListener('change', function() {
    var date = this.value;
    if (date) {
      clearFieldErr('f-date', 'e-date');
      renderTimeSlots(date);
    }
  });

  document.getElementById('f-time').addEventListener('change', function() {
    clearFieldErr('f-time', 'e-time');
  });

  document.getElementById('pills').addEventListener('click', function(e) {
    var pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('selected'); });
    pill.classList.add('selected');
    selectedType = pill.dataset.val;
    document.getElementById('e-type').classList.remove('show');
  });

  ['f-name','f-phone','f-email','f-area'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      clearFieldErr(id, 'e-' + id.replace('f-',''));
    });
  });

  document.getElementById('thankyou-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeModalAndReset();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var overlay = document.getElementById('thankyou-overlay');
      if (overlay && overlay.style.display === 'flex') closeModalAndReset();
    }
  });

  setTimeout(initGsi, 1500);
});

/* ─── Google Identity Services ───────────────────────────────── */
function initGsi() {
  if (typeof google === 'undefined' || !google.accounts) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: function(response) {
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

/* ─── Render time slots for selected date ─────────────────────── */
function renderTimeSlots(date) {
  var select = document.getElementById('f-time');
  var booked = bookedSlots[date] || [];

  select.innerHTML = '<option value="">Select a time...</option>';
  ALL_SLOTS.forEach(function(slot) {
    var taken = booked.indexOf(slot.value) !== -1;
    var opt   = document.createElement('option');
    opt.value       = taken ? '' : slot.value;
    opt.textContent = taken ? slot.label + ' - Unavailable' : slot.label;
    opt.disabled    = taken;
    select.appendChild(opt);
  });

  var allTaken = ALL_SLOTS.every(function(s) { return booked.indexOf(s.value) !== -1; });
  if (allTaken) {
    select.innerHTML = '<option value="">No slots available on this date</option>';
  }

  var notice = document.getElementById('date-full-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id          = 'date-full-notice';
    notice.className   = 'date-full-notice';
    notice.textContent = 'This date is fully booked. Please choose a different date.';
    var row = document.getElementById('f-date').closest('.row');
    row.parentNode.appendChild(notice);
  }
  notice.style.display = allTaken ? 'block' : 'none';
}

function markSlotBooked(date, time) {
  if (!bookedSlots[date]) bookedSlots[date] = [];
  if (bookedSlots[date].indexOf(time) === -1) bookedSlots[date].push(time);
  try { sessionStorage.setItem('bookedSlots', JSON.stringify(bookedSlots)); } catch(e) {}
}

/* ─── Validation helpers ──────────────────────────────────────── */
function setFieldErr(inputId, errId, hasError) {
  var input = document.getElementById(inputId);
  var msg   = document.getElementById(errId);
  if (input) input.classList.toggle('err', hasError);
  if (msg)   msg.classList.toggle('show', hasError);
}

function clearFieldErr(inputId, errId) {
  setFieldErr(inputId, errId, false);
}

/* ─── Step 1 validate & advance ──────────────────────────────── */
function nextStep1() {
  var valid   = true;
  var name    = document.getElementById('f-name').value.trim();
  var phone   = document.getElementById('f-phone').value.trim();
  var email   = document.getElementById('f-email').value.trim();
  var area    = document.getElementById('f-area').value.trim();
  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  setFieldErr('f-name',  'e-name',  !name);    if (!name)    valid = false;
  setFieldErr('f-phone', 'e-phone', !phone);   if (!phone)   valid = false;
  setFieldErr('f-email', 'e-email', !emailOk); if (!emailOk) valid = false;
  setFieldErr('f-area',  'e-area',  !area);    if (!area)    valid = false;

  if (!selectedType) {
    document.getElementById('e-type').classList.add('show');
    valid = false;
  }

  if (valid) goStep(2);
}

/* ─── Step 2 validate & advance ──────────────────────────────── */
function nextStep2() {
  var valid = true;
  var date  = document.getElementById('f-date').value;
  var time  = document.getElementById('f-time').value;

  setFieldErr('f-date', 'e-date', !date); if (!date) valid = false;
  setFieldErr('f-time', 'e-time', !time); if (!time) valid = false;

  if (valid) { buildReview(); goStep(3); }
}

/* ─── Step navigation ─────────────────────────────────────────── */
function goStep(n) {
  [1,2,3].forEach(function(i) {
    document.getElementById('step'+i).style.display = i === n ? 'block' : 'none';
  });
  updateStepDots(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepDots(n) {
  [1,2,3].forEach(function(i) {
    var dot = document.getElementById('sd'+i);
    var lbl = document.getElementById('sl-'+i);
    if (i < n)        { dot.className = 'step-dot done';   dot.textContent = '\u2713'; }
    else if (i === n) { dot.className = 'step-dot active'; dot.textContent = i; }
    else              { dot.className = 'step-dot idle';   dot.textContent = i; }
    if (lbl) lbl.className = i === n ? 'active-lbl' : '';
  });
  ['sl1','sl2'].forEach(function(id, idx) {
    var line = document.getElementById(id);
    if (line) line.className = (idx + 1) < n ? 'step-line done' : 'step-line';
  });
}

/* ─── Build review table ──────────────────────────────────────── */
function buildReview() {
  var timeVal   = document.getElementById('f-time').value;
  var slotObj   = ALL_SLOTS.filter(function(s) { return s.value === timeVal; })[0];
  var slotLabel = slotObj ? slotObj.label : timeVal;

  var rows = [
    ['Full name',       document.getElementById('f-name').value.trim()],
    ['Phone',           document.getElementById('f-phone').value.trim()],
    ['Email',           document.getElementById('f-email').value.trim()],
    ['Property type',   selectedType],
    ['Area / District', document.getElementById('f-area').value.trim()],
    ['Notes',           document.getElementById('f-notes').value.trim() || '-'],
    ['Date',            formatDate(document.getElementById('f-date').value)],
    ['Time slot',       slotLabel],
  ];

  document.getElementById('review-table').innerHTML = rows.map(function(r) {
    return '<tr><td>' + r[0] + '</td><td>' + escHtml(r[1]) + '</td></tr>';
  }).join('');
}

/* ─── Confirm handler ─────────────────────────────────────────── */
function handleConfirm() {
  var btn = document.getElementById('confirm-btn');
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

/* ─── Add event to admin calendar only ───────────────────────── */
function doAddToCalendar() {
  var name  = document.getElementById('f-name').value.trim();
  var phone = document.getElementById('f-phone').value.trim();
  var email = document.getElementById('f-email').value.trim();
  var area  = document.getElementById('f-area').value.trim();
  var notes = document.getElementById('f-notes').value.trim();
  var date  = document.getElementById('f-date').value;
  var time  = document.getElementById('f-time').value;

  var slotObj   = ALL_SLOTS.filter(function(s) { return s.value === time; })[0];
  var slotLabel = slotObj ? slotObj.label : time;

  // Build end time manually to avoid timezone issues
  var parts    = time.split(':');
  var startH   = parseInt(parts[0], 10);
  var startM   = parseInt(parts[1], 10);
  var endM     = startM + CONFIG.DURATION_MINUTES;
  var endH     = startH + Math.floor(endM / 60);
  endM         = endM % 60;
  var pad      = function(n) { return n < 10 ? '0' + n : '' + n; };
  var startDT  = date + 'T' + pad(startH) + ':' + pad(startM) + ':00';
  var endDT    = date + 'T' + pad(endH)   + ':' + pad(endM)   + ':00';

  var event = {
    summary: 'Appointment - ' + name,
    description: 'Name: ' + name + '\nPhone: ' + phone + '\nEmail: ' + email +
                 '\nProperty: ' + selectedType + '\nArea: ' + area +
                 '\nTime slot: ' + slotLabel + '\nNotes: ' + (notes || '-'),
    start: { dateTime: startDT, timeZone: CONFIG.TIMEZONE },
    end:   { dateTime: endDT,   timeZone: CONFIG.TIMEZONE },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 },
        { method: 'popup', minutes: 30   },
      ],
    },
  };

  var headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;

  var apiUrl = 'https://www.googleapis.com/calendar/v3/calendars/' +
               encodeURIComponent(CONFIG.CALENDAR_ID) + '/events';

  fetch(apiUrl, { method: 'POST', headers: headers, body: JSON.stringify(event) })
    .then(function(r) {
      if (!r.ok) {
        return r.text().then(function(t) { throw new Error('API ' + r.status + ': ' + t); });
      }
      return r.json();
    })
    .then(function() {
      markSlotBooked(date, time);
      showThankYouModal();
    })
    .catch(function(err) {
      console.error('[Calendar] Failed:', err.message);
      showToast('Something went wrong. Please try again.');
      resetConfirmBtn();
    });
}

/* ─── Thank You Modal ─────────────────────────────────────────── */
function showThankYouModal() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var ref   = 'BK-';
  for (var i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('ref-code').textContent = ref;

  var timeVal   = document.getElementById('f-time').value;
  var slotObj   = ALL_SLOTS.filter(function(s) { return s.value === timeVal; })[0];
  var slotLabel = slotObj ? slotObj.label : timeVal;

  var summaryRows = [
    ['Name',  document.getElementById('f-name').value.trim()],
    ['Date',  formatDate(document.getElementById('f-date').value)],
    ['Time',  slotLabel],
    ['Email', document.getElementById('f-email').value.trim()],
  ];

  var html = summaryRows.map(function(r) {
    return '<div class="modal-summary-row"><span>' + r[0] + '</span><span>' + escHtml(r[1]) + '</span></div>';
  }).join('');
  document.getElementById('modal-summary').innerHTML = html;

  var overlay = document.getElementById('thankyou-overlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModalAndReset() {
  var overlay = document.getElementById('thankyou-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  resetForm();
}

/* ─── Reset form ──────────────────────────────────────────────── */
function resetForm() {
  ['f-name','f-phone','f-email','f-area','f-notes','f-date'].forEach(function(id) {
    document.getElementById(id).value = '';
  });

  var select = document.getElementById('f-time');
  select.innerHTML = '<option value="">Select a time...</option>';
  ALL_SLOTS.forEach(function(slot) {
    var opt = document.createElement('option');
    opt.value = slot.value;
    opt.textContent = slot.label;
    select.appendChild(opt);
  });

  document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('selected'); });
  selectedType = '';

  document.querySelectorAll('.err-msg, .pills-err').forEach(function(el) { el.classList.remove('show'); });
  document.querySelectorAll('.err').forEach(function(el) { el.classList.remove('err'); });

  var notice = document.getElementById('date-full-notice');
  if (notice) notice.style.display = 'none';

  accessToken   = null;
  pendingSubmit = false;

  goStep(1);
}

/* ─── Utilities ───────────────────────────────────────────────── */
function resetConfirmBtn() {
  var btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent = 'Confirm booking'; btn.classList.remove('btn-loading'); }
}

function showToast(message) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('show'); }, 4000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
