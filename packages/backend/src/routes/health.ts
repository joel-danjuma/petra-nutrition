import { Router } from 'express';
import { getHealthStatus, PerformanceMonitor, ErrorTracker } from '../utils/monitoring';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error';

const router = Router();
const monitor = PerformanceMonitor.getInstance();
const errorTracker = ErrorTracker.getInstance();

// Basic health check
router.get('/health', asyncHandler(async (req, res) => {
  const health = await getHealthStatus();
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
}));

// Readiness check (for Kubernetes/Docker health checks)
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Quick checks for essential services
    const { prisma } = require('../database');
    const { cache } = require('../config/redis');
    
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      cache.ping(),
    ]);
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}));

// Liveness check (for Kubernetes/Docker health checks)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Performance metrics endpoint
router.get('/metrics', asyncHandler(async (req, res) => {
  const metrics = {
    performance: monitor.getAllMetrics(),
    errors: errorTracker.getErrorStats(),
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    timestamp: new Date().toISOString(),
  };
  
  res.json(metrics);
}));

// Prometheus-style metrics endpoint
router.get('/metrics/prometheus', asyncHandler(async (req, res) => {
  const metrics = monitor.getAllMetrics();
  const errorStats = errorTracker.getErrorStats();
  const memUsage = process.memoryUsage();
  
  let output = '';
  
  // Memory metrics
  output += `# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes\n`;
  output += `# TYPE nodejs_memory_usage_bytes gauge\n`;
  output += `nodejs_memory_usage_bytes{type="rss"} ${memUsage.rss}\n`;
  output += `nodejs_memory_usage_bytes{type="heap_total"} ${memUsage.heapTotal}\n`;
  output += `nodejs_memory_usage_bytes{type="heap_used"} ${memUsage.heapUsed}\n`;
  output += `nodejs_memory_usage_bytes{type="external"} ${memUsage.external}\n`;
  
  // Response time metrics
  output += `# HELP http_request_duration_ms HTTP request duration in milliseconds\n`;
  output += `# TYPE http_request_duration_ms histogram\n`;
  
  for (const [metricName, data] of Object.entries(metrics)) {
    if (metricName.startsWith('response_time:') && data) {
      const route = metricName.replace('response_time:', '');
      output += `http_request_duration_ms{route="${route}",quantile="0.5"} ${data.average}\n`;
      output += `http_request_duration_ms{route="${route}",quantile="0.95"} ${data.max}\n`;
    }
  }
  
  // Error count metrics
  output += `# HELP application_errors_total Total number of application errors\n`;
  output += `# TYPE application_errors_total counter\n`;
  
  for (const [errorKey, count] of Object.entries(errorStats)) {
    const [errorName] = errorKey.split(':');
    output += `application_errors_total{error_type="${errorName}"} ${count}\n`;
  }
  
  // Uptime metric
  output += `# HELP nodejs_process_uptime_seconds Node.js process uptime in seconds\n`;
  output += `# TYPE nodejs_process_uptime_seconds gauge\n`;
  output += `nodejs_process_uptime_seconds ${process.uptime()}\n`;
  
  res.set('Content-Type', 'text/plain');
  res.send(output);
}));

// Debug endpoint (only in development)
router.get('/debug', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const { prisma } = require('../database');
  const { cache } = require('../config/redis');
  
  try {
    // Get database connection info
    const dbInfo = await prisma.$queryRaw`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        version() as version
    `;
    
    // Get Redis info
    const redisInfo = await cache.info();
    
    // Get environment variables (filtered)
    const filteredEnv = Object.keys(process.env)
      .filter(key => !key.includes('PASSWORD') && !key.includes('SECRET') && !key.includes('KEY'))
      .reduce((obj, key) => {
        obj[key] = process.env[key];
        return obj;
      }, {} as Record<string, string | undefined>);
    
    res.json({
      database: dbInfo,
      redis: redisInfo,
      environment: filteredEnv,
      performance: monitor.getAllMetrics(),
      errors: errorTracker.getErrorStats(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Debug endpoint error:', error);
    res.status(500).json({
      error: 'Failed to collect debug information',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}));

export default router;
