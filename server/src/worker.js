import { fileURLToPath } from 'url';
import { Queue, Worker } from 'bullmq';
import { redis, pingRedis } from './config/redis.js';
import { logger } from './config/logger.js';
import { config } from './config/env.js';
import { dispatchDueReminders, sweepOverdueWindows, markNoShows } from './jobs/processors.js';

const QUEUE_NAME = 'followcare-jobs';

// Repeatable schedules (ARCHITECTURE.md §9.6)
const SCHEDULES = [
  { name: 'reminder.dispatch', every: 60 * 1000 },
  { name: 'window.sweep', every: 15 * 60 * 1000 },
  { name: 'appointment.noshow', every: 15 * 60 * 1000 }
];

const PROCESSORS = {
  'reminder.dispatch': dispatchDueReminders,
  'window.sweep': sweepOverdueWindows,
  'appointment.noshow': markNoShows
};

export async function initWorker() {
  logger.info({ redisUrl: config.redisUrl }, 'Initializing FollowCare background worker...');
  const isRedisReady = await pingRedis();
  if (!isRedisReady) {
    logger.warn('Worker startup: Redis is not reachable yet, worker will retry connection');
  } else {
    logger.info('FollowCare background worker connected to Redis successfully');
  }
  return { status: 'initialized', redisConnected: isRedisReady };
}

/** Registers repeatable jobs and starts the consumer. Separate from initWorker so tests stay side-effect free. */
export async function startWorker() {
  const queue = new Queue(QUEUE_NAME, { connection: redis });
  for (const s of SCHEDULES) {
    await queue.add(s.name, {}, {
      repeat: { every: s.every },
      jobId: s.name, // stable id: restarts never duplicate schedules
      removeOnComplete: 50,
      removeOnFail: 200
    });
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const fn = PROCESSORS[job.name];
      if (!fn) throw new Error(`Unknown job: ${job.name}`);
      return fn();
    },
    { connection: redis, concurrency: 1 }
  );
  worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err.message }, 'Job failed'));
  return { queue, worker };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let handles;
  initWorker()
    .then(() => startWorker())
    .then((h) => {
      handles = h;
      logger.info('FollowCare worker process running. Awaiting job queues.');
    })
    .catch((err) => {
      logger.error({ err: err.message }, 'Fatal error during worker initialization');
      process.exit(1);
    });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, closing worker gracefully...`);
    try {
      await handles?.worker.close();
      await handles?.queue.close();
      await redis.quit();
    } catch (e) { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
