const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Basic disposable domains — extend as needed
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'yopmail.com',
  'trashmail.com',
]);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return { ok: false, error: 'Email is required' };
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) {
    return { ok: false, error: 'Invalid email format' };
  }
  if (/[\r\n]/.test(trimmed)) {
    return { ok: false, error: 'Invalid email format' };
  }
  const domain = trimmed.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, error: 'Disposable email addresses are not allowed' };
  }
  return { ok: true, email: trimmed };
}

function validateLocation(location) {
  if (!location || typeof location !== 'object') {
    return { ok: false, error: 'Location is required' };
  }
  const name = String(location.name || '').trim();
  const formattedAddress = String(location.formattedAddress || '').trim();
  if (!name || name.length > 120) {
    return { ok: false, error: 'Location name is required (max 120 chars)' };
  }
  if (!formattedAddress || formattedAddress.length > 300) {
    return { ok: false, error: 'Address is required (max 300 chars)' };
  }
  let lat = location.lat;
  let lng = location.lng;
  if (lat !== undefined && lat !== null && lat !== '') {
    lat = Number(lat);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return { ok: false, error: 'Invalid latitude' };
    }
  } else {
    lat = undefined;
  }
  if (lng !== undefined && lng !== null && lng !== '') {
    lng = Number(lng);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return { ok: false, error: 'Invalid longitude' };
    }
  } else {
    lng = undefined;
  }
  const placeId = location.placeId ? String(location.placeId).slice(0, 200) : undefined;
  return {
    ok: true,
    location: { name, formattedAddress, lat, lng, placeId },
  };
}

function deriveDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const local = new Date(y, m - 1, d);
  return DAY_NAMES[local.getDay()];
}

/**
 * scheduledDate: YYYY-MM-DD (user local)
 * scheduledTime: HH:mm (user local)
 * timezoneOffsetMinutes: Date.getTimezoneOffset() from client
 */
function validateSchedule(scheduledDate, scheduledTime, timezoneOffsetMinutes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate || ''))) {
    return { ok: false, error: 'scheduledDate must be YYYY-MM-DD' };
  }
  if (!/^\d{2}:\d{2}$/.test(String(scheduledTime || ''))) {
    return { ok: false, error: 'scheduledTime must be HH:mm' };
  }
  const offset = Number(timezoneOffsetMinutes);
  if (Number.isNaN(offset) || offset < -840 || offset > 840) {
    return { ok: false, error: 'Invalid timezoneOffsetMinutes' };
  }

  const [y, mo, d] = scheduledDate.split('-').map(Number);
  const [hh, mm] = scheduledTime.split(':').map(Number);
  if (hh > 23 || mm > 59) {
    return { ok: false, error: 'Invalid time' };
  }

  // Convert local wall time → UTC using client's getTimezoneOffset
  // UTC = local + offsetMinutes (offset is minutes to add to local to get UTC)
  const asUtcMs = Date.UTC(y, mo - 1, d, hh, mm) + offset * 60 * 1000;
  const scheduledAt = new Date(asUtcMs);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: 'Invalid schedule' };
  }

  const now = Date.now();
  if (scheduledAt.getTime() <= now + 5 * 60 * 1000) {
    return { ok: false, error: 'Meetup must be at least 5 minutes in the future' };
  }
  if (scheduledAt.getTime() > now + 90 * 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'Meetup cannot be more than 90 days out' };
  }

  return {
    ok: true,
    scheduledDate,
    scheduledTime,
    scheduledDay: deriveDay(scheduledDate),
    scheduledAt,
    timezoneOffsetMinutes: offset,
  };
}

function validateRelationship(relationship) {
  const r = String(relationship || '').trim();
  if (!r || r.length > 80) {
    return { ok: false, error: 'Relationship is required (max 80 chars)' };
  }
  if (/[\r\n]/.test(r)) {
    return { ok: false, error: 'Invalid relationship' };
  }
  return { ok: true, relationship: r };
}

module.exports = {
  escapeHtml,
  validateEmail,
  validateLocation,
  validateSchedule,
  validateRelationship,
  deriveDay,
};
