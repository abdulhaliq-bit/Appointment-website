# Appointment Booking v3 — Setup Guide

This version uses a Vercel serverless function + Service Account.
NO Google popup ever. Works silently on every device.

## Project Structure
```
appointment-booking-v3/
├── api/
│   ├── book.js       ← handles booking + calendar insert
│   └── slots.js      ← returns booked slots for a date
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── package.json
├── vercel.json
└── README.md
```

## Step 1 — Google Service Account

1. Go to https://console.cloud.google.com
2. Your project → IAM & Admin → Service Accounts
3. Click "+ Create Service Account"
   - Name: appointment-booking
   - Click Create and Continue → Done
4. Click the service account → Keys tab → Add Key → JSON
5. A .json file downloads — keep it safe, you need values from it

## Step 2 — Share your calendar with the Service Account

1. Open Google Calendar
2. Find your calendar → Settings and sharing
3. Scroll to "Share with specific people"
4. Click "+ Add people"
5. Paste the service account email (looks like: name@project.iam.gserviceaccount.com)
6. Permission: "Make changes to events"
7. Click Send

## Step 3 — Set up Firebase Firestore

1. Go to https://console.firebase.google.com
2. Add project → name it → Create
3. Left sidebar → Firestore Database → Create database
4. Start in test mode → Next → Done
5. Project Settings → Service accounts tab
6. Click "Generate new private key" — but actually you'll reuse
   the same Google Service Account from Step 1.
   Just note your Project ID from the General tab.

## Step 4 — Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to https://vercel.com → New Project → import your repo
3. In Vercel project → Settings → Environment Variables, add:

   GOOGLE_SERVICE_ACCOUNT_EMAIL = client_email from your JSON file
   GOOGLE_PRIVATE_KEY            = private_key from your JSON file (full value with \n)
   CALENDAR_ID                   = your Google Calendar ID (e.g. yourname@gmail.com)
   FIREBASE_PROJECT_ID           = your Firebase project ID
   TIMEZONE                      = Asia/Colombo

4. Redeploy

## Environment Variable values — where to find them

Open the JSON file you downloaded in Step 1:
- GOOGLE_SERVICE_ACCOUNT_EMAIL → "client_email" field
- GOOGLE_PRIVATE_KEY           → "private_key" field (copy the ENTIRE value)
- CALENDAR_ID                  → from Google Calendar settings
- FIREBASE_PROJECT_ID          → from Firebase Console → Project Settings → General
