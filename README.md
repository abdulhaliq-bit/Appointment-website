# Appointment Booking App

A clean, 3-step appointment booking form that silently adds confirmed bookings
to a Google Calendar via OAuth 2.0. No Google branding is shown to the user.

---

## Files

```
appointment-booking/
├── index.html   — markup, step panels, form fields
├── style.css    — all styles (responsive, mobile-first)
├── app.js       — form logic, validation, Google Calendar integration
└── README.md    — this file
```

---

## Quick start (local preview)

Open `index.html` directly in a browser **or** serve with any static server:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .
```

Then visit `http://localhost:8080`.

> **Note:** Google OAuth will not work on `file://` or `http://localhost` unless
> you add it as an Authorized JavaScript Origin in Google Cloud Console (see below).

---

## Google Calendar setup

### 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com/
2. Create a new project (or select an existing one)
3. Enable the **Google Calendar API**:
   - APIs & Services → Library → search "Google Calendar API" → Enable

### 2. Create OAuth 2.0 credentials

1. APIs & Services → Credentials → **Create Credentials** → OAuth client ID
2. Application type: **Web application**
3. Add your domain to **Authorized JavaScript Origins**:
   - e.g. `https://yourdomain.com`
   - For local dev: `http://localhost:8080`
4. Copy the **Client ID** — it looks like `123456789-abc.apps.googleusercontent.com`

### 3. Get your Calendar ID

1. Open Google Calendar → find your target calendar in the left sidebar
2. Click the three-dot menu → **Settings and sharing**
3. Scroll to **Integrate calendar** → copy the **Calendar ID**
   - Your primary calendar ID is your Gmail address
   - Other calendars look like `abc123@group.calendar.google.com`

### 4. Update CONFIG in app.js

```js
const CONFIG = {
  CLIENT_ID:        'YOUR_CLIENT_ID.apps.googleusercontent.com',  // ← paste here
  CALENDAR_ID:      'YOUR_CALENDAR_ID_HERE',                       // ← paste here
  DURATION_MINUTES: 60,
  TIMEZONE:         'Asia/Colombo',  // ← change to your timezone if needed
};
```

Common timezones: `Europe/London`, `America/New_York`, `Asia/Dubai`, `Asia/Kolkata`

---

## Deployment

This is a static site — deploy anywhere:

| Platform       | Command / method                          |
|----------------|-------------------------------------------|
| **Netlify**    | Drag & drop the folder at netlify.com/drop |
| **Vercel**     | `npx vercel` in the project folder        |
| **GitHub Pages** | Push to a repo, enable Pages in Settings |
| **Any web host** | Upload all 3 files via FTP/cPanel        |

After deploying, add your live URL to **Authorized JavaScript Origins** in Google
Cloud Console (same place as step 2 above).

---

## How the OAuth flow works

1. User clicks **Confirm booking**
2. If no token is in memory, `tokenClient.requestAccessToken()` opens a
   Google sign-in popup (only the business owner's Google account should be used)
3. On success, the token is stored **in memory only** — never in localStorage,
   sessionStorage, or cookies
4. `doAddToCalendar()` POSTs the event to the Calendar API with the bearer token
5. On API success → Step 4 success screen is shown
6. On any failure → a generic toast appears; no calendar details are exposed

---

## Customisation

| What                  | Where                              |
|-----------------------|------------------------------------|
| Timezone              | `CONFIG.TIMEZONE` in `app.js`      |
| Appointment duration  | `CONFIG.DURATION_MINUTES`          |
| Time slots            | `<select id="f-time">` in HTML     |
| Brand colour          | `--teal` in `:root` in `style.css` |
| Brand name / tagline  | `.brand` section in `index.html`   |
| Property type options | `.pill` elements in `index.html`   |
| Reminder timing       | `reminders.overrides` in `app.js`  |

---

## Security notes

- No passwords stored anywhere
- OAuth 2.0 only — token is in-memory, cleared on page refresh
- Serve over HTTPS in production (required for Google OAuth)
- All required form fields are validated before any step transition
- Error messages never expose calendar API details to end users
