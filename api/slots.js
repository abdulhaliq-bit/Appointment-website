/* =================================================================
   Vercel Serverless Function — /api/slots?date=YYYY-MM-DD
   Returns booked slots for a given date from Firestore.
   ================================================================= */
const admin = require('firebase-admin');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   'appointment-booking-8a83b',
          clientEmail: 'qilahludba@appoinment-500209.iam.gserviceaccount.com',
          privateKey:  '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDYWqAx84HRDQxE\nWffR1Js92Ej4CZNJiT3i5Nia5ophrRAW7/3qucmlcAgmKL7F/ovyZYY7Xb0WPCmW\nfqRQAbfS+9O7CdCLhxpEBwkGJPS9on7wH5OnkMrkl+BSTVGQe0g9jeM/bpo3qhKw\n1wveKk8ECs9JIJ3VQnO+CwqOV0dJ8A2aIFS6NWGWQfw4WIAvsQThzLqVx/Sepmvi\noyM1K6aK9oXGsB3xcUqvaWHyVq+6noykOzzKG7mcEobNhJoxxtIa3/HRm+vJ2rDu\nojg//UdqZY4d2WQ1oyKEqST83A66mi1tziapHdLCbuwFWnff4EdDtTlzrH+kVdGJ\nsm5nh4VbAgMBAAECggEAMarUXcM+CQTKzSIuPxBktxTg43gnRNlpyJ2qkBzepb+6\nEtnzW6BdB0qpxEDUUtW1wObHovdJAkK7dV4LUIakcZ34JFcDdhSE1hsbWjq/qI0W\nQP+uwOf/e+zVxW8Ui2uR0PeytIwqgR7c/ZXQlqb1zsLAhVQkh6Giun0EZlro9bLm\nyMLITAO2yie6n6BcxO+IIJ+dF9M053u6+17YMGRrD7GUHciYNdAnmNjS6+TVw3xe\nJOeJ5Ye6tqMNMidf87MkF8PQMhLlnfNj61AZ3/0a+rcnD/CJg+AEpYpd8e7/RYKh\nZ2O5Pz2G1YtunqSJ1w/3DoyR4YRI0mmwH4Cm4zHKsQKBgQD8peFjhFi8KeNKfZ8y\nhpHTrGGdPcTBD5L75aYP7vGV9pWVhPII7kNN+yuUNqLn8UuZaGM0V05rX3qRjisr\ncr7TBCbCRDsKz7X7yck/+Fd+z5ero/P5lnx7DRUkV9hyw2f+jZW35jtG3GR42F9M\nTIrTlV7VJptPtEUYvIPSnk3IOQKBgQDbOXkIVox4z4LW1ZvXtApunYqZLQ9a69nv\nCsqL4IOdlg1lIYUUcaflpdsmqWFuPqlYQDjoA/f1qgZow1RtnzXfw71jp/Awi3Tn\niECgNJuBuH6HERHagmcMpkTNtjNrba1tv4xcITkwUb7C+kn2Gis77dia4rvUxfFn\nbfdrlVmyMwKBgAWd5nng6lwcjkoMqupjpYBQN8dYJTSplPn2rA90n3hXCBJP51Wd\nfm+QYvKjmFGRwr2BXZs/SaYHdGEiCQGpRmbIk9gDzlA6N/CGFuxOKBvQn62YModc\n+h1+N/cb4NsETx6QpUB2ZOD5a15oaQ34MansizQv7IoEFvkqz79x94a5AoGBANDO\n2li1z1DXHqGwjqMTawhXaIdj4wdQNKG6XpiC/fogzZtxJQgHBcv4gVg+532Rk81q\nRonAFfNZwocQ3h8YEcGT+JWuhVpHys8p+Zxe32vcpi/Sc3X01WC4Ejr6e9msew9Y\n7sFmJ8m9YvzmV4JhBKMtdi55Hj2ZWMmSdaN0ex3/AoGBANci2c05CqyZF1aQJFu1\nIpxbEBAQZjiBH/HG7VmdKCMyVRcUW+AiE4Gr7bythHaqOqkF7vihghHuxhKSwAEO\ns6m23MI+uBSfoYOJB4bOfgUbYvTvMWS+lSJdU2HTIc9+g35FJYmOOtS10ZzBsgsN\nrYFYNY66rx8UsKwh+SWNZWyb\n-----END PRIVATE KEY-----\n',
        }),
      });
    }
    const db  = admin.firestore();
    const doc = await db.collection('booked_slots').doc(date).get();
    const slots = doc.exists ? (doc.data().slots || []) : [];
    res.status(200).json({ slots });
  } catch(err) {
    console.error('[slots]', err.message);
    res.status(200).json({ slots: [] }); /* fail open so UI still works */
  }
};
