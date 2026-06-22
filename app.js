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
 */

/* ─── Config ──────────────────────────────────────────────────── */
const CONFIG = {
  CLIENT_ID:        'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  CALENDAR_ID:      'YOUR_CALENDAR_ID_HERE',
  DURATION_MINUTES: 60,
  TIMEZONE:         'Asia/Colombo',  // Change to match your timezone
};

/* ─── State ───────────────────────────────────────────────────── */
let tokenClient   = null;
let accessToken   = null;
let pendingSubmit = false;
let selectedType  = '';
let currentStep   = 1;

/* ─── Init ────────────────────────────────────────────────────── */
window.addEventListener('load', () => {
  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('f-date').min = today;

  // Initialize Google Identity Services after GSI script loads
  // Small delay to ensure the external script has fully executed
  setTimeout(initGsi, 1500);
});

/**
 * Initialise Google Identity Services token client.
 * Called once after page load. Safe to call if google is not yet defined —
 * handleConfirm() will fall through to direct calendar POST in that case.
 */
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
      // Token received — store in memory only, never persisted
      accessToken = response.access_token;

      // If confirm was clicked while waiting for auth, proceed immediately
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

  // Clear property type error on selection
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

// Clear errors on input so user gets live feedback
['f-name', 'f-phone', 'f-email', 'f-area'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  const errId = 'e-' + id.replace('f-', '');
  el.addEventListener('input', () => clearFieldErr(id, errId));
});

['f-date', 'f-time'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  const errId = 'e-' + id.replace('f-', '');
  el.addEventListener('change', () => clearFieldErr(id, errId));
});

/* ─── Step 1: validate & advance ─────────────────────────────── */
function nextStep1() {
  let valid = true;

  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const area  = document.getElementById('f-area').value.trim();

  setFieldErr('f-name',  'e-name',  !name);
  if (!name) valid = false;

  setFieldErr('f-phone', 'e-phone', !phone);
  if (!phone) valid = false;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setFieldErr('f-email', 'e-email', !emailValid);
  if (!emailValid) valid = false;

  if (!selectedType) {
    document.getElementById('e-type').classList.add('show');
    valid = false;
  }

  setFieldErr('f-area', 'e-area', !area);
  if (!area) valid = false;

  if (valid) goStep(2);
}

/* ─── Step 2: validate & advance ─────────────────────────────── */
function nextStep2() {
  let valid = true;

  const date = document.getElementById('f-date').value;
  const time = document.getElementById('f-time').value;

  setFieldErr('f-date', 'e-date', !date);
  if (!date) valid = false;

  setFieldErr('f-time', 'e-time', !time);
  if (!time) valid = false;

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

  // Hide the step progress indicator on the success screen
  const stepsWrapper = document.getElementById('steps-wrapper');
  if (stepsWrapper) {
    stepsWrapper.style.display = n === 4 ? 'none' : 'block';
  }

  // Scroll to top of card on step change
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepDots(n) {
  [1, 2, 3].forEach(i => {
    const dot = document.getElementById('sd' + i);
    const lbl = document.getElementById('sl-' + i);

    if (i < n) {
      dot.className   = 'step-dot done';
      dot.textContent = '✓';
    } else if (i === n) {
      dot.className   = 'step-dot active';
      dot.textContent = i;
    } else {
      dot.className   = 'step-dot idle';
      dot.textContent = i;
    }

    if (lbl) {
      lbl.className = i === n ? 'active-lbl' : '';
    }
  });

  // Update connector lines
  ['sl1', 'sl2'].forEach((id, idx) => {
    const line = document.getElementById(id);
    if (line) line.className = (idx + 1) < n ? 'step-line done' : 'step-line';
  });
}

/* ─── Build review table ──────────────────────────────────────── */
function buildReview() {
  const rows = [
    ['Full name',      document.getElementById('f-name').value.trim()],
    ['Phone',          document.getElementById('f-phone').value.trim()],
    ['Email',          document.getElementById('f-email').value.trim()],
    ['Property type',  selectedType],
    ['Area / District',document.getElementById('f-area').value.trim()],
    ['Notes',          document.getElementById('f-notes').value.trim() || '—'],
    ['Date',           formatDate(document.getElementById('f-date').value)],
    ['Time',           formatTime(document.getElementById('f-time').value)],
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
    // No token yet — request one; pendingSubmit ensures doAddToCalendar runs
    // immediately in the OAuth callback once auth completes
    pendingSubmit = true;
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      // GSI not available (e.g. dev/local) — proceed directly
      pendingSubmit = false;
      doAddToCalendar();
    }
  } else {
    doAddToCalendar();
  }
}

/**
 * Builds the Google Calendar event payload and POSTs it to the API.
 * All logic is silent — no calendar branding is shown to the user at any point.
 */
function doAddToCalendar() {
  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const area  = document.getElementById('f-area').value.trim();
  const notes = document.getElementById('f-notes').value.trim();
  const date  = document.getElementById('f-date').value;
  const time  = document.getElementById('f-time').value;

  // Build ISO 8601 start/end datetimes
  const startDT = `${date}T${time}:00`;
  const endDate  = new Date(`${date}T${time}:00`);
  endDate.setMinutes(endDate.getMinutes() + CONFIG.DURATION_MINUTES);
  // Format as YYYY-MM-DDTHH:MM:SS (no Z — timezone is set separately)
  const endDT = endDate.toISOString().slice(0, 19);

  const event = {
    summary: `Appointment — ${name}`,
    description: [
      `Name:     ${name}`,
      `Phone:    ${phone}`,
      `Email:    ${email}`,
      `Property: ${selectedType}`,
      `Area:     ${area}`,
      `Notes:    ${notes || '—'}`,
    ].join('\n'),
    start: {
      dateTime: startDT,
      timeZone: CONFIG.TIMEZONE,
    },
    end: {
      dateTime: endDT,
      timeZone: CONFIG.TIMEZONE,
    },
    attendees: [
      { email: email },
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 24 hours before
        { method: 'popup', minutes: 30 },       // 30 minutes before
      ],
    },
  };

  const headers = {
    'Content-Type': 'application/json',
  };

  // Attach bearer token if available (in-memory only, never stored)
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CONFIG.CALENDAR_ID)}/events`;

  fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
  })
    .then(response => {
      if (!response.ok) {
        return Promise.reject(new Error(`API error ${response.status}`));
      }
      return response.json();
    })
    .then(() => {
      showSuccess();
    })
    .catch((err) => {
      // Log internally for debugging; never expose calendar details to the user
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

/**
 * Generates a booking reference like BK-A3F2K1.
 * Uses an unambiguous character set (no 0/O, 1/I/L) for readability.
 */
function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BK-';
  for (let i = 0; i < 6; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

/* ─── Reset form ──────────────────────────────────────────────── */
function resetForm() {
  // Clear all inputs
  ['f-name', 'f-phone', 'f-email', 'f-area', 'f-notes', 'f-date'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-time').value = '';

  // Clear pill selection
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
  selectedType = '';

  // Clear all error states
  document.querySelectorAll('.err-msg, .pills-err').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.err').forEach(el => el.classList.remove('err'));

  // Reset auth state (token is in-memory only)
  accessToken   = null;
  pendingSubmit = false;

  goStep(1);
}

/* ─── Utility: reset confirm button ──────────────────────────── */
function resetConfirmBtn() {
  const btn = document.getElementById('confirm-btn');
  if (btn) {
    btn.textContent = 'Confirm booking';
    btn.classList.remove('btn-loading');
  }
}

/* ─── Utility: toast notification ────────────────────────────── */
let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

/* ─── Utility: format date for review screen ──────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '';
  // Parse as local date (avoid UTC offset shifting the day)
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}

/* ─── Utility: format time for review screen ──────────────────── */
function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minStr} ${suffix}`;
}

/* ─── Utility: escape HTML for review table ───────────────────── */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
