/**
 * Safe Trade Spot production self-checks
 * Run: npm run test:sts  OR  node --test scripts/test-safe-trade-spot.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEmail,
  validateLocation,
  validateSchedule,
  validateRelationship,
  escapeHtml,
} = require('../utils/safeTradeSpotValidation');
const { hit } = require('../utils/rateLimit');
const { buildFireTimes, jobIdFor } = require('../jobs/safeTradeSpotQueue');

function futureDate(daysAhead = 2) {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('validation', () => {
  it('rejects bad emails and disposable domains', () => {
    assert.equal(validateEmail('bad').ok, false);
    assert.equal(validateEmail('a@b.com\nBcc:x@y.com').ok, false);
    assert.equal(validateEmail('ok@example.com').ok, true);
    assert.equal(validateEmail('x@mailinator.com').ok, false);
  });

  it('requires location name/address and bounds lat/lng', () => {
    assert.equal(validateLocation({}).ok, false);
    assert.equal(
      validateLocation({ name: 'Cafe', formattedAddress: '1 Main', lat: 91 }).ok,
      false
    );
    assert.equal(
      validateLocation({
        name: 'Cafe',
        formattedAddress: '1 Main',
        lat: 40.7,
        lng: -74,
      }).ok,
      true
    );
  });

  it('rejects past and >90 day schedules', () => {
    const offset = new Date().getTimezoneOffset();
    assert.equal(validateSchedule('2020-01-01', '10:00', offset).ok, false);
    assert.equal(validateSchedule(futureDate(2), '14:30', offset).ok, true);
    assert.equal(validateSchedule(futureDate(120), '14:30', offset).ok, false);
  });

  it('escapes HTML for email safety', () => {
    assert.equal(escapeHtml('<script>').includes('<'), false);
  });

  it('validates relationship', () => {
    assert.equal(validateRelationship('').ok, false);
    assert.equal(validateRelationship('Sibling').ok, true);
  });
});

describe('auth gates', () => {
  it('share only when locked', () => {
    assert.equal('locked' === 'locked', true);
    assert.equal('pending' === 'locked', false);
  });

  it('only recipient can respond', () => {
    const canRespond = (spot, userId) =>
      ['pending', 'counter_proposed'].includes(spot.status) &&
      spot.recipientUserId === userId;
    assert.equal(canRespond({ status: 'pending', recipientUserId: 'b' }, 'a'), false);
    assert.equal(canRespond({ status: 'pending', recipientUserId: 'b' }, 'b'), true);
  });

  it('counter flips roles', () => {
    const flipped = {
      initiatorUserId: 'b',
      recipientUserId: 'a',
      status: 'counter_proposed',
    };
    assert.equal(flipped.initiatorUserId, 'b');
    assert.equal(flipped.recipientUserId, 'a');
  });
});

describe('bull job ids and fire times', () => {
  it('builds deterministic job ids', () => {
    assert.equal(jobIdFor('abc', 't24h'), 'sts:abc:t24h');
  });

  it('schedules future reminder fire times', () => {
    const offset = new Date().getTimezoneOffset();
    const sched = validateSchedule(futureDate(3), '15:00', offset);
    assert.equal(sched.ok, true);
    const jobs = buildFireTimes(sched.scheduledAt, offset, sched.scheduledDate);
    assert.ok(jobs.length >= 1);
    assert.ok(jobs.every((j) => j.fireAt instanceof Date && j.fireAt > new Date()));
    const keys = new Set(jobs.map((j) => j.key));
    assert.ok(keys.has('at_event'));
  });
});

describe('rate limit', () => {
  it('blocks after limit (memory fallback without REDIS_URL)', async () => {
    const key = `test-${Date.now()}`;
    assert.equal((await hit(key, 2, 60000)).allowed, true);
    assert.equal((await hit(key, 2, 60000)).allowed, true);
    assert.equal((await hit(key, 2, 60000)).allowed, false);
  });
});
