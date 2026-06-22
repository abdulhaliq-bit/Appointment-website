/* ─── Config — replace these two values ──────────────────────── */
var CONFIG = {
  CLIENT_ID:        'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  CALENDAR_ID:      'YOUR_CALENDAR_ID_HERE',
  DURATION_MINUTES: 60,
  TIMEZONE:         'Asia/Colombo',
};

/* ─── Time slots ──────────────────────────────────────────────── */
var ALL_SLOTS = [
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

/* ─── Wait for full DOM before attaching anything ────────────── */
document.addEventListener('DOMContentLoaded', function() {

  /* Set minimum date to today */
  var today = new Date().toISOString().split('T')[0];
  var dateEl = document.getElementById('f-date');
  if (dateEl) dateEl.min = today;

  /* Restore booked slots from session */
  try {
    var stored = sessionStorage.getItem('bookedSlots');
    if (stored) bookedSlots = JSON.parse(stored);
  } catch(e) { bookedSlots = {}; }

  /* Date change → re-render time slots */
  if (dateEl) {
    dateEl.addEventListener('change', function() {
      if (this.value) {
        clearFieldErr('f-date', 'e-date');
        renderTimeSlots(this.value);
      }
    });
  }

  /* Time change → clear error */
  var timeEl = document.getElementById('f-time');
  if (timeEl) {
    timeEl.addEventListener('change', function() {
      clearFieldErr('f-time', 'e-time');
    });
  }

  /* Pill selector */
  var pillsEl = document.getElementById('pills');
  if (pillsEl) {
    pillsEl.addEventListener('click', function(e) {
      var pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('.pill').forEach(function(p) {
        p.classList.remove('selected');
      });
      pill.classList.add('selected');
      selectedType = pill.dataset.val;
      var errType = document.getElementById('e-type');
      if (errType) errType.classList.remove('show');
    });
  }

  /* Text field live validation clear */
  ['f-name','f-phone','f-email','f-area'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      clearFieldErr(id, 'e-' + id.replace('f-', ''));
    });
  });

  /* Modal overlay click to close */
  var overlay = document.getElementById('thankyou-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closeModalAndReset();
    });
  }

  /* Escape key closes modal */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var ov = document.getElementById('thankyou-overlay');
      if (ov && ov.style.display === 'flex') closeModalAndReset();
    }
  });

  /* Init Google Identity Services after a short delay */
  setTimeout(initGsi, 2000);
});

/* ─── Google Identity Services init ──────────────────────────── */
function initGsi() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    /* Retry once more after another second */
    setTimeout(initGsi, 2000);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: function(response) {
      if (response.error || !response.access_token) {
        pendingSubmit = false;
        showToast('Something went wrong. Please try again.');
        resetConfirmBtn();
        return;
      }
      /* Store token and immediately proceed if confirm was waiting */
      accessToken = response.access_token;
      if (pendingSubmit) {
        pendingSubmit = false;
        doAddToCalendar();
      }
    },
  });
}

/* ─── Render time slots for a date ───────────────────────────── */
function renderTimeSlots(date) {
  var select = document.getElementById('f-time');
  if (!select) return;

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

  var allTaken = ALL_SLOTS.every(function(s) {
    return booked.indexOf(s.value) !== -1;
  });

  if (allTaken) {
    select.innerHTML = '<option value="">No slots available on this date</option>';
  }

  /* Show or hide fully-booked notice */
  var notice = document.getElementById('date-full-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id          = 'date-full-notice';
    notice.className   = 'date-full-notice';
    notice.textContent = 'This date is fully booked. Please choose a different date.';
    var row = document.getElementById('f-date').closest('.row');
    if (row && row.parentNode) row.parentNode.appendChild(notice);
  }
  notice.style.display = allTaken ? 'block' : 'none';
}

function markSlotBooked(date, time) {
  if (!bookedSlots[date]) bookedSlots[date] = [];
  if (bookedSlots[date].indexOf(time) === -1) bookedSlots[date].push(time);
  try { sessionStorage.setItem('bookedSlots', JSON.stringify(bookedSlots)); } catch(e) {}
}

/* ─── Validation ──────────────────────────────────────────────── */
function setFieldErr(inputId, errId, hasError) {
  var input = document.getElementById(inputId);
  var msg   = document.getElementById(errId);
  if (input) input.classList.toggle('err', hasError);
  if (msg)   msg.classList.toggle('show', hasError);
}
function clearFieldErr(inputId, errId) {
  setFieldErr(inputId, errId, false);
}

/* ─── Step 1 ──────────────────────────────────────────────────── */
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
    var et = document.getElementById('e-type');
    if (et) et.classList.add('show');
    valid = false;
  }
  if (valid) goStep(2);
}

/* ─── Step 2 ──────────────────────────────────────────────────── */
function nextStep2() {
  var valid = true;
  var date  = document.getElementById('f-date').value;
  var time  = document.getElementById('f-time').value;
  setFieldErr('f-date', 'e-date', !date); if (!date) valid = false;
  setFieldErr('f-time', 'e-time', !time); if (!time) valid = false;
  if (valid) { buildReview(); goStep(3); }
}

/* ─── Navigation ──────────────────────────────────────────────── */
function goStep(n) {
  [1,2,3].forEach(function(i) {
    var el = document.getElementById('step' + i);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
  updateStepDots(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepDots(n) {
  [1,2,3].forEach(function(i) {
    var dot = document.getElementById('sd' + i);
    var lbl = document.getElementById('sl-' + i);
    if (!dot) return;
    if (i < n)        { dot.className = 'step-dot done';   dot.textContent = '\u2713'; }
    else if (i === n) { dot.className = 'step-dot active'; dot.textContent = String(i); }
    else              { dot.className = 'step-dot idle';   dot.textContent = String(i); }
    if (lbl) lbl.className = i === n ? 'active-lbl' : '';
  });
  ['sl1','sl2'].forEach(function(id, idx) {
    var line = document.getElementById(id);
    if (line) line.className = (idx + 1) < n ? 'step-line done' : 'step-line';
  });
}

/* ─── Review table ────────────────────────────────────────────── */
function buildReview() {
  var timeVal   = document.getElementById('f-time').value;
  var slotMatch = ALL_SLOTS.filter(function(s) { return s.value === timeVal; });
  var slotLabel = slotMatch.length ? slotMatch[0].label : timeVal;

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

  var rt = document.getElementById('review-table');
  if (rt) {
    rt.innerHTML = rows.map(function(r) {
      return '<tr><td>' + r[0] + '</td><td>' + escHtml(r[1]) + '</td></tr>';
    }).join('');
  }
}

/* ─── Confirm button clicked ──────────────────────────────────── */
function handleConfirm() {
  var btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent = 'Confirming...'; btn.classList.add('btn-loading'); }

  if (!accessToken) {
    pendingSubmit = true;
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      /* GSI not ready — retry init then try again */
      initGsi();
      setTimeout(function() {
        if (tokenClient) {
          tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          pendingSubmit = false;
          showToast('Could not connect to Google. Please refresh and try again.');
          resetConfirmBtn();
        }
      }, 2000);
    }
  } else {
    doAddToCalendar();
  }
}

/* ─── POST event to admin calendar only ──────────────────────── */
function doAddToCalendar() {
  /* Double-check token exists */
  if (!accessToken) {
    showToast('Something went wrong. Please try again.');
    resetConfirmBtn();
    return;
  }

  var name  = document.getElementById('f-name').value.trim();
  var phone = document.getElementById('f-phone').value.trim();
  var email = document.getElementById('f-email').value.trim();
  var area  = document.getElementById('f-area').value.trim();
  var notes = document.getElementById('f-notes').value.trim() || '-';
  var date  = document.getElementById('f-date').value;
  var time  = document.getElementById('f-time').value;

  var slotMatch = ALL_SLOTS.filter(function(s) { return s.value === time; });
  var slotLabel = slotMatch.length ? slotMatch[0].label : time;

  /* Build start/end without toISOString to avoid UTC shift */
  var tp    = time.split(':');
  var sh    = parseInt(tp[0], 10);
  var sm    = parseInt(tp[1], 10);
  var total = sh * 60 + sm + CONFIG.DURATION_MINUTES;
  var eh    = Math.floor(total / 60);
  var em    = total % 60;
  var pad   = function(x) { return x < 10 ? '0' + x : '' + x; };

  var startDT = date + 'T' + pad(sh) + ':' + pad(sm) + ':00';
  var endDT   = date + 'T' + pad(eh) + ':' + pad(em) + ':00';

  var event = {
    summary: 'Appointment - ' + name,
    description: [
      'Name: '      + name,
      'Phone: '     + phone,
      'Email: '     + email,
      'Property: '  + selectedType,
      'Area: '      + area,
      'Time slot: ' + slotLabel,
      'Notes: '     + notes,
    ].join('\n'),
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

  var apiUrl = 'https://www.googleapis.com/calendar/v3/calendars/' +
               encodeURIComponent(CONFIG.CALENDAR_ID) + '/events';

  fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + accessToken,
    },
    body: JSON.stringify(event),
  })
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

  var refEl = document.getElementById('ref-code');
  if (refEl) refEl.textContent = ref;

  var timeVal   = document.getElementById('f-time').value;
  var slotMatch = ALL_SLOTS.filter(function(s) { return s.value === timeVal; });
  var slotLabel = slotMatch.length ? slotMatch[0].label : timeVal;

  var rows = [
    ['Name',  document.getElementById('f-name').value.trim()],
    ['Date',  formatDate(document.getElementById('f-date').value)],
    ['Time',  slotLabel],
    ['Email', document.getElementById('f-email').value.trim()],
  ];

  var summaryEl = document.getElementById('modal-summary');
  if (summaryEl) {
    summaryEl.innerHTML = rows.map(function(r) {
      return '<div class="modal-summary-row"><span>' + r[0] + '</span><span>' + escHtml(r[1]) + '</span></div>';
    }).join('');
  }

  var overlay = document.getElementById('thankyou-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
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
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

  var select = document.getElementById('f-time');
  if (select) {
    select.innerHTML = '<option value="">Select a time...</option>';
    ALL_SLOTS.forEach(function(slot) {
      var opt = document.createElement('option');
      opt.value = slot.value;
      opt.textContent = slot.label;
      select.appendChild(opt);
    });
  }

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

/* ─── Helpers ─────────────────────────────────────────────────── */
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
  var p = dateStr.split('-');
  var d = new Date(parseInt(p[0],10), parseInt(p[1],10) - 1, parseInt(p[2],10));
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
