import { fileURLToPath } from 'url';
import express, { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { pool } from './config/db.js';
import { redis, pingRedis } from './config/redis.js';
import { logger } from './config/logger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { sessionMiddleware } from './middleware/session.js';
import { errorHandler, AppError } from './middleware/errorHandler.js';

// Domain Modules
import { authRouter } from './modules/auth/routes.js';
import { departmentsRouter } from './modules/departments/routes.js';
import { patientsRouter } from './modules/patients/routes.js';
import { plansRouter } from './modules/plans/routes.js';
import { tasksRouter } from './modules/tasks/routes.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { priorityRouter } from './modules/priority/routes.js';
import { appointmentsRouter } from './modules/appointments/routes.js';
import { patientPortalRouter } from './modules/patient-portal/routes.js';
import { privacyRouter } from './modules/privacy/routes.js';

export const app = express();

// 1. Security & Request Pipeline (ARCHITECTURE.md Section 9.1)
app.use(requestIdMiddleware);
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false
}));
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sessionMiddleware);

// 2. Health & Readiness Probes (ARCHITECTURE.md Section 15)
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'followcare-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/readyz', async (req, res) => {
  let dbOk = false;
  let redisOk = false;

  try {
    const dbRes = await pool.query('SELECT 1');
    dbOk = dbRes.rowCount === 1;
  } catch (err) {
    logger.error({ err: err.message }, 'Readiness check: DB failed');
  }

  try {
    redisOk = await pingRedis();
  } catch (err) {
    logger.error({ err: err.message }, 'Readiness check: Redis failed');
  }

  const isReady = dbOk && redisOk;
  const status = isReady ? 200 : 503;

  res.status(status).json({
    status: isReady ? 'ready' : 'not_ready',
    database: dbOk ? 'connected' : 'disconnected',
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// 3. Domain API Routes (Mounted under /api)
const api = Router();
api.use(authRouter);
api.use(departmentsRouter);
api.use(patientsRouter);
api.use(plansRouter);
api.use(tasksRouter);
api.use(dashboardRouter);
api.use(priorityRouter);
api.use(appointmentsRouter);
api.use(patientPortalRouter);
api.use(privacyRouter);

app.use('/api', api);

// 4. Fallback 404 Handler
app.use((req, res, next) => {
  next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404));
});

// 5. Central RFC 7807 Error Handler
app.use(errorHandler);

// Start server if invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = app.listen(config.port, () => {
    logger.info(`FollowCare API listening on port ${config.port} (env: ${config.nodeEnv})`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) {
      logger.warn(`Shutdown already in progress, ignoring duplicate ${signal}`);
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(async (err) => {
      if (err) {
        logger.error({ err: err.message }, 'Error closing HTTP server');
      } else {
        logger.info('HTTP server closed');
      }

      try {
        await pool.end();
        logger.info('PostgreSQL pool drained successfully');
      } catch (dbErr) {
        logger.error({ err: dbErr.message }, 'Error draining PostgreSQL pool');
      }

      try {
        await redis.quit();
        logger.info('Redis connection closed successfully');
      } catch (redisErr) {
        logger.error({ err: redisErr.message }, 'Error closing Redis connection');
      }

      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
