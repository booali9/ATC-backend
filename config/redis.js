const { Redis } = require('ioredis');

let sharedConnection = null;

function buildRedisOptions() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  // DigitalOcean Managed Redis requires TLS (rediss://)
  const isTls = url.startsWith('rediss://');
  return {
    maxRetriesPerRequest: null, // required by BullMQ workers
    enableReadyCheck: false,
    connectTimeout: 30000,
    ...(isTls ? { tls: {} } : {}),
  };
}

function getRedisConnection() {
  if (!process.env.REDIS_URL) {
    return null;
  }
  if (!sharedConnection) {
    sharedConnection = new Redis(process.env.REDIS_URL, buildRedisOptions());
    sharedConnection.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });
    sharedConnection.on('connect', () => {
      console.log('✅ Redis connected');
    });
  }
  return sharedConnection;
}

function createBullConnection() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required for BullMQ');
  }
  // BullMQ wants a dedicated connection per Queue/Worker
  return new Redis(process.env.REDIS_URL, buildRedisOptions());
}

function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

module.exports = {
  getRedisConnection,
  createBullConnection,
  isRedisConfigured,
  buildRedisOptions,
};
