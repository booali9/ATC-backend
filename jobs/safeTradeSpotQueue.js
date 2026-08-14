const { Queue } = require('bullmq');
const { createBullConnection, isRedisConfigured } = require('../config/redis');

const QUEUE_REMINDERS = 'safe-trade-spot-reminders';
const QUEUE_EMAIL = 'trusted-contact-email';

let reminderQueue = null;
let emailQueue = null;

function getReminderQueue() {
  if (!isRedisConfigured()) return null;
  if (!reminderQueue) {
    reminderQueue = new Queue(QUEUE_REMINDERS, {
      connection: createBullConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return reminderQueue;
}

function getEmailQueue() {
  if (!isRedisConfigured()) return null;
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_EMAIL, {
      connection: createBullConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 2,
        backoff: { type: 'fixed', delay: 10000 },
      },
    });
  }
  return emailQueue;
}

function jobIdFor(spotId, key) {
  return `sts:${spotId}:${key}`;
}

function buildFireTimes(scheduledAt, timezoneOffsetMinutes, scheduledDate) {
  const eventMs = scheduledAt.getTime();
  const jobs = [];

  const t24 = new Date(eventMs - 24 * 60 * 60 * 1000);
  if (t24.getTime() > Date.now()) {
    jobs.push({ key: 't24h', fireAt: t24 });
  }

  const [y, mo, d] = String(scheduledDate || '').split('-').map(Number);
  if (y && mo && d) {
    const morningUtc = new Date(
      Date.UTC(y, mo - 1, d, 8, 0, 0) + timezoneOffsetMinutes * 60 * 1000
    );
    if (morningUtc.getTime() > Date.now() && morningUtc.getTime() < eventMs) {
      jobs.push({ key: 'day_morning', fireAt: morningUtc });
    }
  }

  const t2 = new Date(eventMs - 2 * 60 * 60 * 1000);
  if (t2.getTime() > Date.now()) {
    jobs.push({ key: 't2h', fireAt: t2 });
  }

  if (eventMs > Date.now()) {
    jobs.push({ key: 'at_event', fireAt: new Date(eventMs) });
  }

  return jobs;
}

/**
 * Idempotent: deterministic job IDs prevent duplicate schedules on double-accept.
 */
async function scheduleLockNotifications(spot) {
  if (spot.status !== 'locked') return spot;

  const queue = getReminderQueue();
  if (!queue) {
    console.warn('⚠️ REDIS_URL missing — Safe Trade Spot reminders not queued');
    return spot;
  }

  // Cancel any prior jobs first (reschedule / re-lock safety)
  await cancelNotificationJobs(spot);

  const fireTimes = buildFireTimes(
    spot.scheduledAt,
    spot.timezoneOffsetMinutes,
    spot.scheduledDate
  );

  const bullJobs = [];
  for (const ft of fireTimes) {
    const jobId = jobIdFor(spot._id.toString(), ft.key);
    const delay = Math.max(0, ft.fireAt.getTime() - Date.now());
    try {
      await queue.add(
        ft.key,
        {
          safeTradeSpotId: spot._id.toString(),
          key: ft.key,
          chatId: spot.chatThreadId.toString(),
        },
        { jobId, delay }
      );
      bullJobs.push({
        key: ft.key,
        jobId,
        fireAt: ft.fireAt,
        status: 'scheduled',
      });
    } catch (err) {
      // Job already exists with same id = idempotent success
      if (String(err.message || '').includes('Job') && String(err.message).includes('exists')) {
        bullJobs.push({
          key: ft.key,
          jobId,
          fireAt: ft.fireAt,
          status: 'scheduled',
        });
      } else {
        console.error('Failed to enqueue reminder', ft.key, err.message);
      }
    }
  }

  spot.bullJobs = bullJobs;
  await spot.save();
  return spot;
}

async function cancelNotificationJobs(spot) {
  const queue = getReminderQueue();
  const keys = ['t24h', 'day_morning', 't2h', 'at_event'];

  if (queue) {
    for (const key of keys) {
      const jobId = jobIdFor(spot._id.toString(), key);
      try {
        const job = await queue.getJob(jobId);
        if (job) await job.remove();
      } catch (err) {
        console.warn('cancel job', jobId, err.message);
      }
    }
  }

  if (spot.bullJobs?.length) {
    spot.bullJobs = spot.bullJobs.map((j) => ({
      ...j.toObject?.() ?? j,
      status: j.status === 'sent' ? 'sent' : 'cancelled',
    }));
    await spot.save();
  }
  return spot;
}

async function enqueueTrustedContactEmail(shareId) {
  const queue = getEmailQueue();
  if (!queue) {
    throw new Error('REDIS_URL required to queue trusted-contact email');
  }
  await queue.add(
    'send',
    { shareId: shareId.toString() },
    { jobId: `sts-email:${shareId}` }
  );
}

module.exports = {
  QUEUE_REMINDERS,
  QUEUE_EMAIL,
  getReminderQueue,
  getEmailQueue,
  scheduleLockNotifications,
  cancelNotificationJobs,
  enqueueTrustedContactEmail,
  buildFireTimes,
  jobIdFor,
};
