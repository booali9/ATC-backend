const fetch = require('node-fetch');
const { hit } = require('../utils/rateLimit');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const UA = 'AdversityTradingCircle/1.0 (safe-trade-spot; contact@atc.app)';

async function nominatimGet(path, params) {
  const url = new URL(path, NOMINATIM);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Geocoding failed (${res.status}): ${text.slice(0, 120)}`);
  }
  return res.json();
}

function mapResult(item) {
  return {
    name: item.name || item.display_name?.split(',')[0] || 'Selected location',
    formattedAddress: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    placeId: item.place_id != null ? String(item.place_id) : undefined,
  };
}

/**
 * GET /api/geo/search?q=
 */
exports.search = async (req, res) => {
  try {
    const rate = await hit(`geo-search:${req.user._id}`, 30, 60 * 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, message: 'Geocode search rate limit' });
    }

    const q = String(req.query.q || '').trim();
    if (q.length < 2 || q.length > 200) {
      return res.status(400).json({ success: false, message: 'Query must be 2–200 characters' });
    }

    const data = await nominatimGet('/search', {
      q,
      format: 'json',
      addressdetails: 0,
      limit: 5,
    });

    res.json({
      success: true,
      results: (Array.isArray(data) ? data : []).map(mapResult),
    });
  } catch (err) {
    console.error('geo search', err);
    res.status(502).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/geo/reverse?lat=&lng=
 */
exports.reverse = async (req, res) => {
  try {
    const rate = await hit(`geo-reverse:${req.user._id}`, 60, 60 * 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, message: 'Reverse geocode rate limit' });
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ success: false, message: 'Invalid latitude' });
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, message: 'Invalid longitude' });
    }

    const data = await nominatimGet('/reverse', {
      lat,
      lon: lng,
      format: 'json',
    });

    if (!data || data.error) {
      return res.status(404).json({ success: false, message: 'No address found' });
    }

    res.json({ success: true, location: mapResult(data) });
  } catch (err) {
    console.error('geo reverse', err);
    res.status(502).json({ success: false, message: err.message });
  }
};
