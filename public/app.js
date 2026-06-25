/* ================================================================
   Firebase config — fill these in from Firebase Console
   Project Settings → General → Your apps → Config
   ================================================================ */
var FIREBASE_CONFIG = {
  apiKey:     'AIzaSyA3iL6nq6gjnVfJPclxdmCONgdisZ1_fv4',
  authDomain: 'appointment-booking-8a83b.firebaseapp.com',
  projectId:  'appointment-booking-8a83b',
};

/* ================================================================
   Google Calendar config — fill these in
   ================================================================ */
var CALENDAR_CONFIG = {
  CLIENT_ID:        'YOUR_GOOGLE_CLIENT_ID.apps.googleuserconten235751329614-igv6su08k8v2je8fenccts0qc0184mgv.apps.googleusercontent.com',
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
var db           = null;
var tokenClient  = null;
var accessToken  = null;
var pendingSubmit = false;
var selectedType  = '';
var toastTimer    = null;

/* ================================================================
   INIT FIREBASE
   ================================================================ */
function initFirebase() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.firestore();
    console.log('[Firebase] Ready');
  } catch(e) {
    console.error('[Firebase] Init failed:', e);
  }
}

/* ================================================================
   FIREBASE SLOT FUNCTIONS
   ================================================================ */

/* Get booked slots for a date — returns Promise<string[]> */
function getBookedSlots(date) {
  if (!db) return Promise.resolve([]);
  return db.collection('booked_slots').doc(date).get()
    .then(function(doc) {
      return doc.exists ? (doc.data().slots || []) : [];
    })
    .catch(function() { return []; });
}

/*
  Try to atomically claim a slot using Firestore transaction.
  Returns Promise<true> if claimed, Promise<false> if already taken.
*/
function claimSlot(date, time) {
  if (!db) return Promise.resolve(true); /* fallback if Firebase not ready */
  var ref = db.collection('booked_slots').doc(date);
  return db.runTransaction(function(tx) {
    return tx.get(ref).then(function(doc) {
      var slots = doc.exists ? (doc.data().slots || []) : [];
      if (slots.indexOf(time) !== -1) {
        /* Already booked — reject */
        return Promise.reject({ alreadyBooked: true });
      }
      slots.push(time);
      tx.set(ref, { slots: slots });
      return true;
    });
  });
}

/* ================================================================
   DOM READY
   ================================================================ */
document.addEventListener('DOMContentLoaded', function() {
  initFirebase();

  var dateEl = document.getElementById('f-date');
  if (dateEl) {
    dateEl.min = new Date().toISOString().split('T')[0];
    dateEl.addEventListener('change', function() {
      if (this.value) {
        clearFieldErr('f-date', 'e-date');
        loadAndRenderSlots(this.value);
      }
    });
  }

  var timeEl = document.getElementById('f-time');
  if (timeEl) timeEl.addEventListener('change', function() { clearFieldErr('f-time','e-time'); });

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

  ['f-name','f-phone','f-email','f-area'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() { clearFieldErr(id,'e-'+id.replace('f-','')); });
  });

  var overlay = document.getElementById('thankyou-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closeModalAndReset();
    });
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var ov = document.getElementById('thankyou-overlay');
      if (ov && ov.style.display !== 'none') closeModalAndReset();
    }
  });

  setTimeout(initGsi, 1500);
});

/* ================================================================
   LOAD SLOTS FROM FIREBASE — shared across ALL devices
   ================================================================ */
function loadAndRenderSlots(date) {
  var select = document.getElementById('f-time');
  var notice = document.getElementById('date-full-notice');
  if (!select) return;

  select.innerHTML = '<option value="">Checking availability...</option>';
  select.disabled  = true;
  if (notice) notice.style.display = 'none';

  getBookedSlots(date).then(function(booked) {
    select.disabled = false;
    renderTimeSlots(booked);
  });
}

function renderTimeSlots(booked) {
  var select = document.getElementById('f-time');
  var notice = document.getElementById('date-full-notice');
  if (!select) return;
  if (!booked) booked = [];

  select.innerHTML = '<option value="">Select a time...</option>';
  var available = 0;

  ALL_SLOTS.forEach(function(slot) {
    var taken = booked.indexOf(slot.value) !== -1;
    var opt   = document.createElement('option');
    opt.value       = taken ? '' : slot.value;
    opt.textContent = taken ? slot.label + ' - Unavailable' : slot.label;
    opt.disabled    = taken;
    if (!taken) available++;
    select.appendChild(opt);
  });

  if (available === 0) {
    select.innerHTML = '<option value="">No slots available on this date</option>';
    if (notice) notice.style.display = 'block';
  } else {
    if (notice) notice.style.display = 'none';
  }
}

/* ================================================================
   GOOGLE IDENTITY SERVICES
   ================================================================ */
function initGsi() {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    setTimeout(initGsi, 1500);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CALENDAR_CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: function(response) {
      if (response.error || !response.access_token) {
        pendingSubmit = false;
        showToast('Sign-in was cancelled. Please try again.');
        resetConfirmBtn();
        return;
      }
      accessToken = response.access_token;
      if (pendingSubmit) {
        pendingSubmit = false;
        doBooking();
      }
    },
  });
}

/* ================================================================
   VALIDATION
   ================================================================ */
function setFieldErr(inputId, errId, hasError) {
  var input = document.getElementById(inputId);
  var msg   = document.getElementById(errId);
  if (input) input.classList.toggle('err', hasError);
  if (msg)   msg.classList.toggle('show', hasError);
}
function clearFieldErr(i, e) { setFieldErr(i, e, false); }

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

function nextStep2() {
  var valid = true;
  var date  = document.getElementById('f-date').value;
  var time  = document.getElementById('f-time').value;
  setFieldErr('f-date','e-date',!date); if (!date) valid = false;
  setFieldErr('f-time','e-time',!time); if (!time) valid = false;
  if (valid) { buildReview(); goStep(3); }
}

/* ================================================================
   NAVIGATION
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
   CONFIRM — first claim the slot in Firebase, then add to calendar
   Using a transaction means two devices CAN'T book the same slot
   ================================================================ */
function handleConfirm() {
  var btn = document.getElementById('confirm-btn');
  if (btn) { btn.textContent = 'Confirming...'; btn.classList.add('btn-loading'); }

  if (accessToken) {
    doBooking();
  } else {
    pendingSubmit = true;
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      setTimeout(function() {
        if (tokenClient) {
          tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          pendingSubmit = false;
          showToast('Google sign-in not ready. Please refresh.');
          resetConfirmBtn();
        }
      }, 2000);
    }
  }
}

function doBooking() {
  var date = document.getElementById('f-date').value;
  var time = document.getElementById('f-time').value;

  /* Step 1: Atomically claim the slot in Firebase */
  claimSlot(date, time)
    .then(function() {
      /* Slot claimed — now add to Google Calendar */
      doAddToCalendar(date, time);
    })
    .catch(function(err) {
      if (err && err.alreadyBooked) {
        /* Someone else just booked this slot — refresh slots and warn user */
        showToast('Sorry, this slot was just taken. Please choose another time.');
        resetConfirmBtn();
        loadAndRenderSlots(date);
        goStep(2);
      } else {
        console.error('[Firestore] claimSlot error:', err);
        /* Firebase failed — proceed anyway so booking still works */
        doAddToCalendar(date, time);
      }
    });
}

/* ================================================================
   GOOGLE CALENDAR — admin only, no attendees
   ================================================================ */
function doAddToCalendar(date, time) {
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

  var sm  = ALL_SLOTS.filter(function(s){ return s.value===time; });
  var sl  = sm.length ? sm[0].label : time;
  var tp  = time.split(':');
  var sh  = parseInt(tp[0],10), smi = parseInt(tp[1],10);
  var tot = sh*60 + smi + CALENDAR_CONFIG.DURATION_MINUTES;
  var eh  = Math.floor(tot/60), em = tot%60;
  var pad = function(x){ return x<10?'0'+x:''+x; };

  var event = {
    summary: 'Appointment - ' + name,
    description:
      'Name: '      + name         + '\n' +
      'Phone: '     + phone        + '\n' +
      'Email: '     + email        + '\n' +
      'Property: '  + selectedType + '\n' +
      'Area: '      + area         + '\n' +
      'Time slot: ' + sl           + '\n' +
      'Notes: '     + notes,
    start: { dateTime: date+'T'+pad(sh)+':'+pad(smi)+':00', timeZone: CALENDAR_CONFIG.TIMEZONE },
    end:   { dateTime: date+'T'+pad(eh)+':'+pad(em)+':00',  timeZone: CALENDAR_CONFIG.TIMEZONE },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 },
        { method: 'popup', minutes: 30   },
      ],
    },
  };

  fetch(
    'https://www.googleapis.com/calendar/v3/calendars/' +
    encodeURIComponent(CALENDAR_CONFIG.CALENDAR_ID) + '/events',
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
      showThankYouModal();
    } else if (r.status === 401) {
      accessToken = null;
      showToast('Session expired. Please click Confirm again.');
      resetConfirmBtn();
    } else {
      r.text().then(function(t){ console.error('[Calendar]', r.status, t); });
      showToast('Something went wrong. Please try again.');
      resetConfirmBtn();
    }
  })
  .catch(function(err) {
    console.error('[Calendar] Error:', err);
    showToast('Something went wrong. Please try again.');
    resetConfirmBtn();
  });
}

/* ================================================================
   THANK YOU MODAL
   ================================================================ */
function showThankYouModal() {
  resetConfirmBtn();

  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var ref   = 'BK-';
  for (var i=0; i<6; i++) ref += chars[Math.floor(Math.random()*chars.length)];
  var refEl = document.getElementById('ref-code');
  if (refEl) refEl.textContent = ref;

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

  var overlay = document.getElementById('thankyou-overlay');
  if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeModalAndReset() {
  var overlay = document.getElementById('thankyou-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  resetForm();
}

/* ================================================================
   RESET
   ================================================================ */
function resetForm() {
  ['f-name','f-phone','f-email','f-area','f-notes','f-date'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
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
  return d.toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
