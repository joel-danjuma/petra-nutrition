import winston from 'winston';
import path from 'path';
import { config } from '../config';

// Create logs directory if it doesn't exist
const logsDir = path.dirname(config.LOG_FILE_PATH);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    level: config.LOG_LEVEL,
    format: consoleFormat,
  }),
];

// Add file transport in production
if (config.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: config.LOG_FILE_PATH,
      level: config.LOG_LEVEL,
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  transports,
  exitOnError: false,
});

// Add request logging helper
export const logRequest = (req: any, res: any, responseTime?: number) => {
  const { method, url, ip, headers } = req;
  const { statusCode } = res;
  const userAgent = headers['user-agent'] || 'Unknown';
  
  const logData = {
    method,
    url,
    statusCode,
    ip,
    userAgent,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
  };

  if (statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Add error logging helper
export const logError = (error: Error, context?: any) => {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    context,
  });
};

// Add database query logging helper
export const logQuery = (query: string, params?: any[], duration?: number) => {
  if (config.NODE_ENV === 'development') {
    logger.debug('Database Query', {
      query,
      params,
      duration: duration ? `${duration}ms` : undefined,
    });
  }
};

// Add AI service logging helper
export const logAIRequest = (service: string, operation: string, duration?: number, tokens?: number) => {
  logger.info('AI Service Request', {
    service,
    operation,
    duration: duration ? `${duration}ms` : undefined,
    tokens,
  });
};

// Add cache operation logging helper
export const logCacheOperation = (operation: string, key: string, hit?: boolean) => {
  if (config.NODE_ENV === 'development') {
    logger.debug('Cache Operation', {
      operation,
      key,
      hit,
    });
  }
};

// Stream for morgan HTTP request logging
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
