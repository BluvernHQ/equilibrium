/**
 * Structured Logging Utility
 * 
 * Provides consistent, structured logging throughout the application.
 * Replaces console.log/error/warn with structured logging.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    [key: string]: any;
  };
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        ...(this.isDevelopment && { stack: error.stack }),
        ...(error && typeof error === 'object' && 'code' in error
          ? { code: (error as any).code }
          : {}),
      };
    }

    return entry;
  }

  private output(entry: LogEntry) {
    const jsonString = JSON.stringify(entry, null, this.isDevelopment ? 2 : 0);
    
    switch (entry.level) {
      case 'error':
        console.error(jsonString);
        break;
      case 'warn':
        console.warn(jsonString);
        break;
      case 'debug':
        if (this.isDevelopment) {
          console.debug(jsonString);
        }
        break;
      default:
        console.log(jsonString);
    }
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      this.output(this.formatLog('debug', message, context));
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, context?: LogContext) {
    this.output(this.formatLog('info', message, context));
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: LogContext) {
    this.output(this.formatLog('warn', message, context));
  }

  /**
   * Log error messages
   */
  error(message: string, error?: Error, context?: LogContext) {
    this.output(this.formatLog('error', message, context, error));
  }

  /**
   * Log API request
   */
  request(method: string, path: string, context?: LogContext) {
    this.info(`${method} ${path}`, {
      type: 'api_request',
      method,
      path,
      ...context,
    });
  }

  /**
   * Log API response
   */
  response(method: string, path: string, statusCode: number, duration?: number, context?: LogContext) {
    this.info(`${method} ${path} ${statusCode}`, {
      type: 'api_response',
      method,
      path,
      statusCode,
      ...(duration && { durationMs: duration }),
      ...context,
    });
  }

  /**
   * Log database operation
   */
  database(operation: string, context?: LogContext) {
    this.debug(`Database: ${operation}`, {
      type: 'database',
      operation,
      ...context,
    });
  }

  /**
   * Log external service call
   */
  externalService(service: string, operation: string, context?: LogContext) {
    this.info(`${service}: ${operation}`, {
      type: 'external_service',
      service,
      operation,
      ...context,
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export Logger class for testing
export { Logger };
