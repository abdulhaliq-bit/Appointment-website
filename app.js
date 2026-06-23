/* ─── Config — replace these two values ──────────────────────── */
var CONFIG = {
  CLIENT_ID:        '235751329614-igv6su08k8v2je8fenccts0qc0184mgv.apps.googleusercontent.com',
  CALENDAR_ID:      'qilahludba@gmail.com',
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
var accessToken   = null;  /* preserved for entire session — never cleared until reset */
var pendingSubmit = false;
var selectedType  = '';
var bookedSlots   = {};
var toastTimer    = null;

/* ─── DOM ready ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  var today = new Date().toISOString().split('T')[0];
  var dateEl = document.getElementById('f-date');
  if (dateEl) dateEl.min = today;

  try {
    var stored = sessionStorage.getItem('bookedSlots');
    if (stored) bookedSlots = JSON.parse(stored);
  } catch(e) { bookedSlots = {}; }

  /* Date picker */
  if (dateEl) {
    dateEl.addEventListener('change', function() {
      if (this.value) { clearFieldErr('f-date','e-date'); renderTimeSlots(this.value); }
    });
  }

  /* Time picker */
  var timeEl = document.getElementById('f-time');
  if (timeEl) timeEl.addEventListener('change', function() { clearFieldErr('f-time','e-time'); });

  /* Pills */
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

  /* Text fields */
  ['f-name','f-phone','f-email','f-area'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() { clearFieldErr(id,'e-'+id.replace('f-','')); });
  });

  /* Modal close on backdrop click */
  var overlay = document.getElementById('thankyou-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closeModalAndReset();
    });
  }

  /* Escape closes modal */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var ov = document.getElementById('thankyou-overlay');
      if (ov && ov.style.display !== 'none') closeModalAndReset();
    }
  });

  /* Init GSI — use prompt:'select_account' only first time, then silent */
  setTimeout(initGsi, 1500);
});

/* ─── Google Identity Services ────────────────────────────────── */
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
      /* Store token — keep it for the whole session */
      accessToken = response.access_token;
      if (pendingSubmit) {
        pendingSubmit = false;
        doAddToCalendar();
      }
    },
  });
}

/* ─── Time slot rendering ─────────────────────────────────────── */
function renderTimeSlots(date) {
  var select = document.getElementById('f-time');
  if (!select) return;
  var booked = bookedSlots[date] || [];
  select.innerHTML = '<option value="">Select a time...</option>';
  ALL_SLOTS.forEach(function(slot) {
    var taken = booked.indexOf(slot.value) !== -1;
    var opt = document.createElement('option');
    opt.value = taken ? '' : slot.value;
    opt.textContent = taken ? slot.label + ' - Unavailable' : slot.label;
    opt.disabled = taken;
    select.appendChild(opt);
  });
  var allTaken = ALL_SLOTS.every(function(s) { return booked.indexOf(s.value) !== -1; });
  if (allTaken) select.innerHTML = '<option value="">No slots available on this date</option>';
  var notice = document.getElementById('date-full-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'date-full-notice';
    notice.className = 'date-full-notice';
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
function clearFieldErr(i, e) { setFieldErr(i, e, false); }

/* ─── Step 1 ──────────────────────────────────────────────────── */
function nextStep1() {
  var valid = true;
  var name  = document.getElementById('f-name').value.trim();
  var phone = document.getElementById('f-phone').value.trim();
  var email = document.getElementById('f-email').value.trim();
  var area  = document.getElementById('f-area').value.trim();
  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setFieldErr('f-name','e-name',!name);       if (!name)    valid=false;
  setFieldErr('f-phone','e-phone',!phone);    if (!phone)   valid=false;
  setFieldErr('f-email','e-email',!emailOk);  if (!emailOk) valid=false;
  setFieldErr('f-area','e-area',!area);       if (!area)    valid=false;
  if (!selectedType) { document.getElementById('e-type').classList.add('show'); valid=false; }
  if (valid) goStep(2);
}

/* ─── Step 2 ──────────────────────────────────────────────────── */
function nextStep2() {
  var valid = true;
  var date  = document.getElementById('f-date').value;
  var time  = document.getElementById('f-time').value;
  setFieldErr('f-date','e-date',!date); if (!date) valid=false;
  setFieldErr('f-time','e-time',!time); if (!time) valid=false;
  if (valid) { buildReview(); goStep(3); }
}

/* ─── Navigation ──────────────────────────────────────────────── */
function goStep(n) {
  [1,2,3].forEach(function(i) {
    var el = document.getElementById('step'+i);
    if (el) el.style.display = i===n ? 'block' : 'none';
  });
  updateStepDots(n);
  window.scrollTo({top:0,behavior:'smooth'});
}

function updateStepDots(n) {
  [1,2,3].forEach(function(i) {
    var dot = document.getElementById('sd'+i);
    var lbl = document.getElementById('sl-'+i);
    if (!dot) return;
    if (i < n)       { dot.className='step-dot done';   dot.textContent='\u2713'; }
    else if (i===n)  { dot.className='step-dot active'; dot.textContent=String(i); }
    else             { dot.className='step-dot idle';   dot.textContent=String(i); }
    if (lbl) lbl.className = i===n ? 'active-lbl' : '';
  });
  ['sl1','sl2'].forEach(function(id,idx) {
    var l = document.getElementById(id);
    if (l) l.className = (idx+1)<n ? 'step-line done' : 'step-line';
  });
}

/* ─── Review table ────────────────────────────────────────────── */
function buildReview() {
  var tv = document.getElementById('f-time').value;
  var sm = ALL_SLOTS.filter(function(s){return s.value===tv;});
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
  if (rt) rt.innerHTML = rows.map(function(r){
    return '<tr><td>'+r[0]+'</td><td>'+escHtml(r[1])+'</td></tr>';
  }).join('');
}

/* ─── Confirm clicked ─────────────────────────────────────────── */
function handleConfirm() {
  var btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent='Confirming...'; btn.classList.add('btn-loading'); }

  /* If we already have a valid token, skip OAuth entirely */
  if (accessToken) {
    doAddToCalendar();
    return;
  }

  /* Need to get a token — set flag so callback proceeds */
  pendingSubmit = true;
  if (tokenClient) {
    /* First time: prompt consent. Subsequent: silent (no prompt param) */
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    pendingSubmit = false;
    showToast('Google sign-in not ready. Please refresh and try again.');
    resetConfirmBtn();
  }
}

/* ─── POST to admin calendar only ────────────────────────────── */
function doAddToCalendar() {
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

  var sm = ALL_SLOTS.filter(function(s){return s.value===time;});
  var sl = sm.length ? sm[0].label : time;

  var tp  = time.split(':');
  var sh  = parseInt(tp[0],10), sm2 = parseInt(tp[1],10);
  var tot = sh*60 + sm2 + CONFIG.DURATION_MINUTES;
  var eh  = Math.floor(tot/60), em = tot%60;
  var pad = function(x){return x<10?'0'+x:''+x;};

  var event = {
    summary: 'Appointment - ' + name,
    description: 'Name: '+name+'\nPhone: '+phone+'\nEmail: '+email+
                 '\nProperty: '+selectedType+'\nArea: '+area+
                 '\nTime: '+sl+'\nNotes: '+notes,
    start: { dateTime: date+'T'+pad(sh)+':'+pad(sm2)+':00', timeZone: CONFIG.TIMEZONE },
    end:   { dateTime: date+'T'+pad(eh)+':'+pad(em)+':00',  timeZone: CONFIG.TIMEZONE },
    reminders: { useDefault: false, overrides: [
      { method:'email', minutes:1440 },
      { method:'popup', minutes:30   },
    ]},
  };

  fetch(
    'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CONFIG.CALENDAR_ID)+'/events',
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
      markSlotBooked(date, time);
      showThankYouModal();
    } else if (r.status === 401) {
      /* Token expired — clear it and ask user to try again */
      accessToken = null;
      showToast('Session expired. Please click Confirm again to re-authenticate.');
      resetConfirmBtn();
    } else {
      r.text().then(function(t){ console.error('[Calendar]', r.status, t); });
      showToast('Something went wrong. Please try again.');
      resetConfirmBtn();
    }
  })
  .catch(function(err) {
    console.error('[Calendar] Fetch failed:', err);
    showToast('Something went wrong. Please try again.');
    resetConfirmBtn();
  });
}

/* ─── Thank You Modal ─────────────────────────────────────────── */
function showThankYouModal() {
  resetConfirmBtn();

  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var ref = 'BK-';
  for (var i=0;i<6;i++) ref += chars[Math.floor(Math.random()*chars.length)];
  var refEl = document.getElementById('ref-code');
  if (refEl) refEl.textContent = ref;

  var tv = document.getElementById('f-time').value;
  var sm = ALL_SLOTS.filter(function(s){return s.value===tv;});
  var sl = sm.length ? sm[0].label : tv;

  var rows = [
    ['Name',  document.getElementById('f-name').value.trim()],
    ['Date',  formatDate(document.getElementById('f-date').value)],
    ['Time',  sl],
    ['Email', document.getElementById('f-email').value.trim()],
  ];
  var summaryEl = document.getElementById('modal-summary');
  if (summaryEl) {
    summaryEl.innerHTML = rows.map(function(r){
      return '<div class="modal-summary-row"><span>'+r[0]+'</span><span>'+escHtml(r[1])+'</span></div>';
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
  ['f-name','f-phone','f-email','f-area','f-notes','f-date'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var sel = document.getElementById('f-time');
  if (sel) {
    sel.innerHTML = '<option value="">Select a time...</option>';
    ALL_SLOTS.forEach(function(s){
      var o = document.createElement('option');
      o.value = s.value; o.textContent = s.label;
      sel.appendChild(o);
    });
  }
  document.querySelectorAll('.pill').forEach(function(p){p.classList.remove('selected');});
  selectedType = '';
  document.querySelectorAll('.err-msg,.pills-err').forEach(function(el){el.classList.remove('show');});
  document.querySelectorAll('.err').forEach(function(el){el.classList.remove('err');});
  var notice = document.getElementById('date-full-notice');
  if (notice) notice.style.display = 'none';
  /* Keep accessToken alive — no need to re-authenticate for next booking */
  pendingSubmit = false;
  goStep(1);
}

/* ─── Utilities ───────────────────────────────────────────────── */
function resetConfirmBtn() {
  var btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent='Confirm booking'; btn.classList.remove('btn-loading'); }
}

function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){t.classList.remove('show');}, 4000);
}

function formatDate(s) {
  if (!s) return '';
  var p = s.split('-');
  var d = new Date(+p[0], +p[1]-1, +p[2]);
  return d.toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
