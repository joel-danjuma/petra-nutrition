import winston from 'winston';

/**
 * Structured logging, shared by every Petra service.
 *
 * This is a factory rather than a ready-made logger because the two services
 * configure it differently and neither may import the other's `config` module.
 * Each service creates one instance at startup and re-exports it locally, so
 * call sites keep importing `../utils/logger` and never see this file.
 */

export interface LoggerOptions {
  /** winston level: error | warn | info | http | verbose | debug | silly */
  level: string;
  /** Drives colourised console vs. JSON file output. */
  nodeEnv: string;
  /** Absolute or relative path for the production file transport. */
  filePath?: string;
  /** Prefixes every line, so interleaved dev output says which service spoke. */
  service?: string;
}

export type Logger = winston.Logger;

const consoleFormat = (service?: string) =>
  winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const tag = service ? ` (${service})` : '';
      let log = `${timestamp} [${level}]${tag}: ${message}`;

      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
      }

      return log;
    })
  );

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const createLogger = (options: LoggerOptions): Logger => {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      level: options.level,
      format: consoleFormat(options.service),
    }),
  ];

  if (options.nodeEnv === 'production' && options.filePath) {
    transports.push(
      new winston.transports.File({
        filename: options.filePath,
        level: options.level,
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  }

  return winston.createLogger({
    level: options.level,
    transports,
    exitOnError: false,
  });
};

/** Request/response line used by both services' HTTP middleware. */
export const logRequest = (
  logger: Logger,
  req: any,
  res: any,
  responseTime?: number
) => {
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

export const logError = (logger: Logger, error: Error, context?: unknown) => {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    context,
  });
};
