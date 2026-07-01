import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { cache } from '../config/redis';
import { prisma } from '../database';

// Performance monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // Keep only last 100 values
    if (values.length > 100) {
      values.shift();
    }
    
    // Log if value is unusually high
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (value > avg * 2 && values.length > 10) {
      logger.warn('Performance anomaly detected', {
        metric: name,
        value,
        average: avg,
        threshold: avg * 2,
      });
    }
  }

  getMetrics(name: string) {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return {
      count: values.length,
      average: avg,
      min,
      max,
      latest: values[values.length - 1],
    };
  }

  getAllMetrics() {
    const result: Record<string, any> = {};
    for (const [name, values] of this.metrics) {
      result[name] = this.getMetrics(name);
    }
    return result;
  }
}

// Middleware to track response times
export const responseTimeTracker = (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime.bigint();
  const monitor = PerformanceMonitor.getInstance();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    const route = `${req.method} ${req.route?.path || req.path}`;
    monitor.recordMetric(`response_time:${route}`, duration);
    monitor.recordMetric('response_time:all', duration);

    // Track status codes
    monitor.recordMetric(`status_code:${res.statusCode}`, 1);
  });

  next();
};

// Health check endpoint data
export const getHealthStatus = async () => {
  const monitor = PerformanceMonitor.getInstance();
  
  try {
    // Check database connectivity
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseTime = Date.now() - dbStart;

    // Check Redis connectivity
    const redisStart = Date.now();
    await cache.set('health_check', 'ok', 10);
    const redisResponseTime = Date.now() - redisStart;

    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime)}s`,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV,
      database: {
        status: 'connected',
        responseTime: `${dbResponseTime}ms`,
      },
      redis: {
        status: 'connected',
        responseTime: `${redisResponseTime}ms`,
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      performance: monitor.getAllMetrics(),
    };
  } catch (error) {
    logger.error('Health check failed:', error);
    
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      uptime: `${Math.floor(process.uptime())}s`,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV,
    };
  }
};

// Error tracking and alerting
export class ErrorTracker {
  private static instance: ErrorTracker;
  private errorCounts: Map<string, number> = new Map();
  private lastAlertTimes: Map<string, number> = new Map();

  static getInstance(): ErrorTracker {
    if (!ErrorTracker.instance) {
      ErrorTracker.instance = new ErrorTracker();
    }
    return ErrorTracker.instance;
  }

  trackError(error: Error, context?: Record<string, any>) {
    const errorKey = `${error.name}:${error.message}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    logger.error('Error tracked', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      count: currentCount + 1,
      context,
    });

    // Alert if error count exceeds threshold
    this.checkAlertThreshold(errorKey, currentCount + 1);
  }

  private checkAlertThreshold(errorKey: string, count: number) {
    const ALERT_THRESHOLD = 10;
    const ALERT_COOLDOWN = 300000; // 5 minutes

    if (count >= ALERT_THRESHOLD) {
      const lastAlertTime = this.lastAlertTimes.get(errorKey) || 0;
      const now = Date.now();

      if (now - lastAlertTime > ALERT_COOLDOWN) {
        this.sendAlert(errorKey, count);
        this.lastAlertTimes.set(errorKey, now);
      }
    }
  }

  private sendAlert(errorKey: string, count: number) {
    logger.error('Error threshold exceeded - ALERT', {
      errorKey,
      count,
      threshold: 10,
      timestamp: new Date().toISOString(),
    });

    // In production, you would send this to your alerting system
    // (e.g., Slack, PagerDuty, email, etc.)
  }

  getErrorStats() {
    const stats: Record<string, number> = {};
    for (const [key, count] of this.errorCounts) {
      stats[key] = count;
    }
    return stats;
  }

  resetErrorCounts() {
    this.errorCounts.clear();
    this.lastAlertTimes.clear();
  }
}

// API usage tracking
export const trackApiUsage = async (userId: string, endpoint: string, method: string) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = `api_usage:${userId}:${today}`;
  
  try {
    // Increment usage count
    const current = await cache.get(key) || '0';
    const usage = parseInt(current) + 1;
    await cache.set(key, usage.toString(), 86400); // Expire after 24 hours

    // Track endpoint-specific usage
    const endpointKey = `api_usage:${userId}:${endpoint}:${today}`;
    const endpointCurrent = await cache.get(endpointKey) || '0';
    const endpointUsage = parseInt(endpointCurrent) + 1;
    await cache.set(endpointKey, endpointUsage.toString(), 86400);

    // Log high usage
    if (usage > 1000) { // Alert if user makes more than 1000 API calls per day
      logger.warn('High API usage detected', {
        userId,
        dailyUsage: usage,
        endpoint,
        method,
      });
    }

    return { dailyUsage: usage, endpointUsage };
  } catch (error) {
    logger.error('Failed to track API usage:', error);
    return null;
  }
};

// Database query performance tracking
export const trackDatabaseQuery = (operation: string, duration: number, query?: string) => {
  const monitor = PerformanceMonitor.getInstance();
  monitor.recordMetric(`db_query:${operation}`, duration);
  monitor.recordMetric('db_query:all', duration);

  if (duration > 1000) { // Log slow queries (> 1 second)
    logger.warn('Slow database query detected', {
      operation,
      duration: `${duration}ms`,
      query: query ? query.substring(0, 200) + '...' : undefined,
    });
  }
};

// Memory usage monitoring
export const monitorMemoryUsage = () => {
  setInterval(() => {
    const usage = process.memoryUsage();
    const monitor = PerformanceMonitor.getInstance();

    monitor.recordMetric('memory:rss', usage.rss);
    monitor.recordMetric('memory:heapTotal', usage.heapTotal);
    monitor.recordMetric('memory:heapUsed', usage.heapUsed);
    monitor.recordMetric('memory:external', usage.external);

    // Alert if memory usage is high
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 500) { // Alert if heap usage > 500MB
      logger.warn('High memory usage detected', {
        heapUsed: `${Math.round(heapUsedMB)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      });
    }
  }, 60000); // Check every minute
};

// Initialize monitoring
export const initializeMonitoring = () => {
  logger.info('Initializing monitoring systems...');
  
  // Start memory monitoring
  monitorMemoryUsage();
  
  // Log startup metrics
  const monitor = PerformanceMonitor.getInstance();
  const startupTime = Date.now();
  monitor.recordMetric('startup_time', startupTime);
  
  logger.info('Monitoring systems initialized', {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  });
};
