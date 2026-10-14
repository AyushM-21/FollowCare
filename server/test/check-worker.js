import { initWorker } from '../src/worker.js';
import { redis } from '../src/config/redis.js';

async function main() {
  let exitCode = 0;
  try {
    const result = await initWorker();
    console.log('Worker initialization check succeeded:', JSON.stringify(result));
    if (!result.redisConnected) {
      console.error('Warning: Redis is not reported as connected.');
      exitCode = 1;
    }
  } catch (err) {
    console.error('Worker initialization check failed with error:', err.message);
    exitCode = 1;
  } finally {
    try {
      await redis.quit();
      console.log('Redis connection closed gracefully.');
    } catch (closeErr) {
      console.error('Error closing Redis connection:', closeErr.message);
    }
    process.exit(exitCode);
  }
}

main();
