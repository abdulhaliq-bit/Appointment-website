/* ================================================================
   CONFIG — replace these two values before deploying
   ================================================================ */
var CONFIG = {
  CLIENT_ID:        '235751329614-igv6su08k8v2je8fenccts0qc0184mgv.apps.googleusercontent.com',
  CALENDAR_ID:      'qilahludba@gmail.com',
  DURATION_MINUTES: 60,
  TIMEZONE:         'Asia/Colombo',
};

/* ================================================================
   TIME SLOTS
   ================================================================ */
var ALL_SLOTS = [
  { value: '09:00', label: '9:00 AM - 10:00 AM'  },
  { value: '10:00', label: '10:00 AM - 11:00 AM' },
  { value: '11:00', label: '11:00 AM - 12:00 PM' },
  { value: '13:00', label: '1:00 PM - 2:00 PM'   },
  { value: '14:00', label: '2:00 PM - 3:00 PM'   },
  { value: '15:00', label: '3:00 PM - 4:00 PM'   },
];

/* ================================================================
   STATE
   ================================================================ */
var tokenClient   = null;
var accessToken   = null;   /* kept alive for entire browser session */
var pendingSubmit = false;
var selectedType  = '';
var toastTimer    = null;

/*
  bookedSlots is stored in localStorage so it persists across
  page closes/refreshes — format: { "YYYY-MM-DD": ["09:00","13:00"] }
*/
var bookedSlots = {};

function loadBookedSlots() {
  try {
    var raw = localStorage.getItem('appt_booked_slots');
    if (raw) bookedSlots = JSON.parse(raw);
  } catch(e) { bookedSlots = {}; }
}

function saveBookedSlots() {
  try { localStorage.setItem('appt_booked_slots', JSON.stringify(bookedSlots)); } catch(e) {}
}

function markSlotBooked(date, time) {
  if (!bookedSlots[date]) bookedSlots[date] = [];
  if (bookedSlots[date].indexOf(time) === -1) bookedSlots[date].push(time);
  saveBookedSlots();
}

/* ================================================================
   DOM READY
   ================================================================ */
document.addEventListener('DOMContentLoaded', function() {

  loadBookedSlots();

  /* Minimum date = today */
  var dateEl = document.getElementById('f-date');
  if (dateEl) {
    dateEl.min = new Date().toISOString().split('T')[0];
    dateEl.addEventListener('change', function() {
      if (this.value) {
        clearFieldErr('f-date', 'e-date');
        renderTimeSlots(this.value);
      }
    });
  }

  /* Time slot change */
  var timeEl = document.getElementById('f-time');
  if (timeEl) {
    timeEl.addEventListener('change', function() { clearFieldErr('f-time','e-time'); });
  }

  /* Property type pills */
  var pillsEl = document.getElementById('pills');
  if (pillsEl) {
    pillsEl.addEventListener('click', function(e) {
      var pill = e.target.closest('.pill');
      if (!pill) return;
      document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('selected'); });
      pill.classList.add('selected');
      selectedType = pill.dataset.val;
      var et = document.getElementById('e-type');
      if (et) et.classList.remove('show');
    });
  }

  /* Inline error clear on text input */
  ['f-name','f-phone','f-email','f-area'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() {
      clearFieldErr(id, 'e-' + id.replace('f-',''));
    });
  });

  /* Modal backdrop click closes it */
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
      if (ov && ov.style.display !== 'none') closeModalAndReset();
    }
  });

  /* Start loading GSI script */
  setTimeout(initGsi, 1500);
});

/* ================================================================
   GOOGLE IDENTITY SERVICES
   Only the admin signs in — token is kept in memory, never stored.
   prompt:'consent' only on first auth; afterwards no prompt needed.
   ================================================================ */
var gsiReady = false;

function initGsi() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    setTimeout(initGsi, 1500);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: function(response) {
      if (response.error || !response.access_token) {
        pendingSubmit = false;
        showToast('Sign-in was cancelled. Please try again.');
        resetConfirmBtn();
        return;
      }
      /* Store token in memory for this session only */
      accessToken = response.access_token;
      gsiReady    = true;
      if (pendingSubmit) {
        pendingSubmit = false;
        doAddToCalendar();
      }
    },
  });
  gsiReady = true;
}

/* ================================================================
   TIME SLOT RENDERING
   Reads from localStorage so booked slots persist across sessions
   ================================================================ */
function renderTimeSlots(date) {
  var select = document.getElementById('f-time');
  if (!select) return;

  var booked = bookedSlots[date] || [];
  select.innerHTML = '<option value="">Select a time...</option>';

  var availableCount = 0;
  ALL_SLOTS.forEach(function(slot) {
    var taken = booked.indexOf(slot.value) !== -1;
    var opt   = document.createElement('option');
    opt.value       = taken ? '' : slot.value;
    opt.textContent = taken ? slot.label + ' - Unavailable' : slot.label;
    opt.disabled    = taken;
    if (!taken) availableCount++;
    select.appendChild(opt);
  });

  /* Show/hide fully-booked notice */
  var notice = document.getElementById('date-full-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id          = 'date-full-notice';
    notice.className   = 'date-full-notice';
    notice.textContent = 'This date is fully booked. Please choose a different date.';
    var row = document.getElementById('f-date').closest('.row');
    if (row && row.parentNode) row.parentNode.appendChild(notice);
  }

  if (availableCount === 0) {
    select.innerHTML = '<option value="">No slots available on this date</option>';
    notice.style.display = 'block';
  } else {
    notice.style.display = 'none';
  }
}

/* ================================================================
   FORM VALIDATION
   ================================================================ */
function setFieldErr(inputId, errId, hasError) {
  var input = document.getElementById(inputId);
  var msg   = document.getElementById(errId);
  if (input) input.classList.toggle('err', hasError);
  if (msg)   msg.classList.toggle('show', hasError);
}
function clearFieldErr(inputId, errId) { setFieldErr(inputId, errId, false); }

/* ================================================================
   STEP 1 — validate details
   ================================================================ */
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

/* ================================================================
   STEP 2 — validate date & time
   ================================================================ */
function nextStep2() {
  var valid = true;
  var date  = document.getElementById('f-date').value;
  var time  = document.getElementById('f-time').value;
  setFieldErr('f-date','e-date',!date); if (!date) valid = false;
  setFieldErr('f-time','e-time',!time); if (!time) valid = false;
  if (valid) { buildReview(); goStep(3); }
}

/* ================================================================
   STEP NAVIGATION
   ================================================================ */
function goStep(n) {
  [1,2,3].forEach(function(i) {
    var el = document.getElementById('step'+i);
    if (el) el.style.display = i===n ? 'block' : 'none';
  });
  updateStepDots(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepDots(n) {
  [1,2,3].forEach(function(i) {
    var dot = document.getElementById('sd'+i);
    var lbl = document.getElementById('sl-'+i);
    if (!dot) return;
    if (i < n)       { dot.className = 'step-dot done';   dot.textContent = '\u2713'; }
    else if (i === n){ dot.className = 'step-dot active'; dot.textContent = String(i); }
    else             { dot.className = 'step-dot idle';   dot.textContent = String(i); }
    if (lbl) lbl.className = i===n ? 'active-lbl' : '';
  });
  ['sl1','sl2'].forEach(function(id, idx) {
    var line = document.getElementById(id);
    if (line) line.className = (idx+1)<n ? 'step-line done' : 'step-line';
  });
}

/* ================================================================
   REVIEW TABLE
   ================================================================ */
function buildReview() {
  var tv = document.getElementById('f-time').value;
  var sm = ALL_SLOTS.filter(function(s){ return s.value===tv; });
  var sl = sm.length ? sm[0].label : tv;

  var rows = [
    ['Full name',       document.getElementById('f-name').value.trim()],
    ['Phone',           document.getElementById('f-phone').value.trim()],
    ['Email',           document.getElementById('f-email').value.trim()],
    ['Property type',   selectedType],
    ['Area / District', document.getElementById('f-area').value.trim()],
    ['Notes',           document.getElementById('f-notes').value.trim() || '-'],
    ['Date',            formatDate(document.getElementById('f-date').value)],
    ['Time slot',       sl],
  ];

  var rt = document.getElementById('review-table');
  if (rt) rt.innerHTML = rows.map(function(r) {
    return '<tr><td>'+r[0]+'</td><td>'+escHtml(r[1])+'</td></tr>';
  }).join('');
}

/* ================================================================
   CONFIRM BUTTON
   If token already exists → go straight to calendar POST.
   If not → request token (popup shows once), then POST in callback.
   ================================================================ */
function handleConfirm() {
  var btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent = 'Confirming...'; btn.classList.add('btn-loading'); }

  if (accessToken) {
    /* Token already in memory — no popup needed */
    doAddToCalendar();
  } else {
    pendingSubmit = true;
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      /* GSI not ready yet — retry */
      setTimeout(function() {
        if (tokenClient) {
          tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          pendingSubmit = false;
          showToast('Google sign-in not ready. Please refresh the page.');
          resetConfirmBtn();
        }
      }, 2000);
    }
  }
}

/* ================================================================
   CALENDAR API — POST event to ADMIN calendar only
   No attendees field = event goes only to the admin's calendar.
   ================================================================ */
function doAddToCalendar() {
  if (!accessToken) {
    showToast('Authentication required. Please try again.');
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

  var sm  = ALL_SLOTS.filter(function(s){ return s.value===time; });
  var sl  = sm.length ? sm[0].label : time;
  var tp  = time.split(':');
  var sh  = parseInt(tp[0],10);
  var smi = parseInt(tp[1],10);
  var tot = sh*60 + smi + CONFIG.DURATION_MINUTES;
  var eh  = Math.floor(tot/60);
  var em  = tot%60;
  var pad = function(x){ return x<10?'0'+x:''+x; };

  var event = {
    summary: 'Appointment - ' + name,
    description:
      'Name: '      + name      + '\n' +
      'Phone: '     + phone     + '\n' +
      'Email: '     + email     + '\n' +
      'Property: '  + selectedType + '\n' +
      'Area: '      + area      + '\n' +
      'Time slot: ' + sl        + '\n' +
      'Notes: '     + notes,
    start: {
      dateTime: date + 'T' + pad(sh)  + ':' + pad(smi) + ':00',
      timeZone: CONFIG.TIMEZONE,
    },
    end: {
      dateTime: date + 'T' + pad(eh)  + ':' + pad(em)  + ':00',
      timeZone: CONFIG.TIMEZONE,
    },
    /* NO attendees field — event only appears on admin's calendar */
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 }, /* 24h before */
        { method: 'popup', minutes: 30   }, /* 30 min before */
      ],
    },
  };

  fetch(
    'https://www.googleapis.com/calendar/v3/calendars/' +
    encodeURIComponent(CONFIG.CALENDAR_ID) + '/events',
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + accessToken,
      },
      body: JSON.stringify(event),
    }
  )
  .then(function(r) {
    if (r.status === 200 || r.status === 201) {
      /* Success — mark slot as booked in localStorage, then show modal */
      markSlotBooked(date, time);
      showThankYouModal();
    } else if (r.status === 401) {
      /* Token expired — clear and ask user to click confirm again */
      accessToken = null;
      showToast('Your session expired. Please click Confirm again.');
      resetConfirmBtn();
    } else {
      r.text().then(function(t) {
        console.error('[Calendar] Error ' + r.status + ':', t);
      });
      showToast('Something went wrong. Please try again.');
      resetConfirmBtn();
    }
  })
  .catch(function(err) {
    console.error('[Calendar] Network error:', err);
    showToast('Something went wrong. Please check your connection.');
    resetConfirmBtn();
  });
}

/* ================================================================
   THANK YOU MODAL
   ================================================================ */
function showThankYouModal() {
  resetConfirmBtn();

  /* Generate booking reference */
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var ref   = 'BK-';
  for (var i=0; i<6; i++) ref += chars[Math.floor(Math.random() * chars.length)];

  var refEl = document.getElementById('ref-code');
  if (refEl) refEl.textContent = ref;

  /* Summary rows inside modal */
  var tv  = document.getElementById('f-time').value;
  var sm  = ALL_SLOTS.filter(function(s){ return s.value===tv; });
  var sl  = sm.length ? sm[0].label : tv;
  var rows = [
    ['Name',  document.getElementById('f-name').value.trim()],
    ['Date',  formatDate(document.getElementById('f-date').value)],
    ['Time',  sl],
    ['Email', document.getElementById('f-email').value.trim()],
  ];
  var summaryEl = document.getElementById('modal-summary');
  if (summaryEl) {
    summaryEl.innerHTML = rows.map(function(r) {
      return '<div class="modal-summary-row"><span>'+r[0]+'</span><span>'+escHtml(r[1])+'</span></div>';
    }).join('');
  }

  /* Show the overlay */
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

/* ================================================================
   RESET FORM
   Token is intentionally NOT cleared — admin stays authenticated
   for the whole session so the popup never fires again.
   ================================================================ */
function resetForm() {
  ['f-name','f-phone','f-email','f-area','f-notes','f-date'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

  /* Reset time dropdown to default (no date picked yet) */
  var sel = document.getElementById('f-time');
  if (sel) {
    sel.innerHTML = '<option value="">Select a time...</option>';
    ALL_SLOTS.forEach(function(s) {
      var o = document.createElement('option');
      o.value = s.value; o.textContent = s.label;
      sel.appendChild(o);
    });
  }

  document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('selected'); });
  selectedType = '';

  document.querySelectorAll('.err-msg,.pills-err').forEach(function(el) { el.classList.remove('show'); });
  document.querySelectorAll('.err').forEach(function(el) { el.classList.remove('err'); });

  var notice = document.getElementById('date-full-notice');
  if (notice) notice.style.display = 'none';

  pendingSubmit = false;
  goStep(1);
}

/* ================================================================
   UTILITIES
   ================================================================ */
function resetConfirmBtn() {
  var btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent = 'Confirm booking'; btn.classList.remove('btn-loading'); }
}

function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 4000);
}

function formatDate(s) {
  if (!s) return '';
  var p = s.split('-');
  var d = new Date(+p[0], +p[1]-1, +p[2]);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
