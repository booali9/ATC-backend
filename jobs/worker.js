const { Worker } = require('bullmq');
const mongoose = require('mongoose');
require('dotenv').config();

const { createBullConnection, isRedisConfigured } = require('../config/redis');
const { QUEUE_REMINDERS, QUEUE_EMAIL } = require('./safeTradeSpotQueue');
const { notifyBothParticipants } = require('../utils/safeTradeSpotNotifications');
const { sendTrustedContactShareEmail } = require('../utils/emailService');

const JOB_COPY = {
  t24h: {
    title: 'Safe Trade Spot — 24 Hours Prior',
    body: (spot) => `Meetup tomorrow at ${spot.scheduledTime}: ${spot.location.name}`,
  },
  day_morning: {
    title: 'Safe Trade Spot — Today',
    body: (spot) => `Today at ${spot.scheduledTime}: ${spot.location.name}. Stay safe.`,
  },
  t2h: {
    title: 'Safe Trade Spot — 2 Hours Prior',
    body: (spot) => `Meetup in ~2 hours at ${spot.location.name}`,
  },
  at_event: {
    title: 'Safe Trade Spot — Now',
    body: (spot) => `It's meetup time at ${spot.location.name}. Open chat for navigation.`,
  },
};

async function processReminder(job) {
  const SafeTradeSpot = require('../models/SafeTradeSpot');
  const { safeTradeSpotId, key } = job.data;
  const spot = await SafeTradeSpot.findById(safeTradeSpotId);
  if (!spot || spot.status !== 'locked') {
    console.log(`Skip reminder ${key}: spot ${safeTradeSpotId} not locked`);
    return { skipped: true };
  }

  const copy = JOB_COPY[key];
  if (copy) {
    await notifyBothParticipants(spot, copy.title, copy.body(spot));
  }

  if (spot.bullJobs?.length) {
    spot.bullJobs = spot.bullJobs.map((j) => {
      const obj = j.toObject?.() ?? j;
      if (obj.key === key && obj.status === 'scheduled') {
        return { ...obj, status: 'sent' };
      }
      return obj;
    });
    await spot.save();
  }

  return { sent: true, key };
}

async function processEmail(job) {
  const TrustedContactShare = require('../models/TrustedContactShare');
  const User = require('../models/User');
  const share = await TrustedContactShare.findById(job.data.shareId);
  if (!share) return { skipped: true };
  if (share.emailStatus === 'sent') return { alreadySent: true };

  const sharedBy = await User.findById(share.sharedByUserId).select('name');
  await sendTrustedContactShareEmail({
    to: share.recipientEmail,
    sharedByName: sharedBy?.name || 'An ATC user',
    relationship: share.relationship,
    snapshotDate: share.snapshotDate,
    snapshotDay: share.snapshotDay,
    snapshotTime: share.snapshotTime,
    locationName: share.snapshotLocation.name,
    locationAddress: share.snapshotLocation.formattedAddress,
  });

  share.emailStatus = 'sent';
  share.emailSentAt = new Date();
  await share.save();
  return { sent: true };
}

async function startWorkers() {
  if (!isRedisConfigured()) {
    console.error('❌ REDIS_URL not set — worker cannot start');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/authapp');
  console.log('✅ Worker MongoDB connected');

  const reminderWorker = new Worker(QUEUE_REMINDERS, processReminder, {
    connection: createBullConnection(),
  });
  const emailWorker = new Worker(QUEUE_EMAIL, processEmail, {
    connection: createBullConnection(),
  });

  reminderWorker.on('completed', (job) => {
    console.log(`✅ Reminder job ${job.id} completed`);
  });
  reminderWorker.on('failed', async (job, err) => {
    console.error(`❌ Reminder job ${job?.id} failed:`, err.message);
  });
  emailWorker.on('completed', (job) => {
    console.log(`✅ Email job ${job.id} completed`);
  });
  emailWorker.on('failed', async (job, err) => {
    console.error(`❌ Email job ${job?.id} failed:`, err.message);
    if (job?.data?.shareId) {
      try {
        const TrustedContactShare = require('../models/TrustedContactShare');
        await TrustedContactShare.findByIdAndUpdate(job.data.shareId, {
          emailStatus: 'failed',
        });
      } catch (_) {}
    }
  });

  console.log('🚀 Safe Trade Spot workers running');
}

if (require.main === module) {
  startWorkers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startWorkers, processReminder, processEmail };
