/**
 * Tests for logger utility functions.
 */

import { createLogger, generateRequestId, Logger } from './logger';

describe('createLogger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  it('creates a logger with info, warn, and error methods', () => {
    const logger = createLogger('Test');

    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  describe('info', () => {
    it('logs message with prefix', () => {
      const logger = createLogger('MyAPI');
      logger.info('Operation completed');

      expect(consoleSpy.log).toHaveBeenCalledWith('[MyAPI] Operation completed');
    });

    it('logs message with context object', () => {
      const logger = createLogger('MyAPI');
      const ctx = { userId: 123, action: 'create' };
      logger.info('User action', ctx);

      expect(consoleSpy.log).toHaveBeenCalledWith('[MyAPI] User action', ctx);
    });

    it('handles empty context object', () => {
      const logger = createLogger('Test');
      logger.info('Message', {});

      expect(consoleSpy.log).toHaveBeenCalledWith('[Test] Message', {});
    });
  });

  describe('warn', () => {
    it('logs warning with prefix', () => {
      const logger = createLogger('Session');
      logger.warn('Deprecated method used');

      expect(consoleSpy.warn).toHaveBeenCalledWith('[Session] Deprecated method used');
    });

    it('logs warning with context', () => {
      const logger = createLogger('Session');
      const ctx = { method: 'oldApi', since: 'v2.0' };
      logger.warn('Deprecation warning', ctx);

      expect(consoleSpy.warn).toHaveBeenCalledWith('[Session] Deprecation warning', ctx);
    });
  });

  describe('error', () => {
    it('logs error with prefix', () => {
      const logger = createLogger('Database');
      logger.error('Connection failed');

      expect(consoleSpy.error).toHaveBeenCalledWith('[Database] Connection failed');
    });

    it('logs error with context', () => {
      const logger = createLogger('Database');
      const ctx = { error: new Error('timeout'), retries: 3 };
      logger.error('Query failed', ctx);

      expect(consoleSpy.error).toHaveBeenCalledWith('[Database] Query failed', ctx);
    });
  });

  it('uses different prefixes for different loggers', () => {
    const apiLogger = createLogger('API');
    const dbLogger = createLogger('DB');

    apiLogger.info('API message');
    dbLogger.info('DB message');

    expect(consoleSpy.log).toHaveBeenNthCalledWith(1, '[API] API message');
    expect(consoleSpy.log).toHaveBeenNthCalledWith(2, '[DB] DB message');
  });

  it('handles special characters in prefix', () => {
    const logger = createLogger('Auth/Session');
    logger.info('Test');

    expect(consoleSpy.log).toHaveBeenCalledWith('[Auth/Session] Test');
  });

  it('handles empty prefix', () => {
    const logger = createLogger('');
    logger.info('Message');

    expect(consoleSpy.log).toHaveBeenCalledWith('[] Message');
  });
});

describe('generateRequestId', () => {
  it('returns a string starting with "req_"', () => {
    const id = generateRequestId();

    expect(typeof id).toBe('string');
    expect(id.startsWith('req_')).toBe(true);
  });

  it('contains timestamp component', () => {
    const before = Date.now();
    const id = generateRequestId();
    const after = Date.now();

    // Extract timestamp part: req_{timestamp}_{random}
    const parts = id.split('_');
    expect(parts.length).toBe(3);

    const timestamp = parseInt(parts[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('contains random component', () => {
    const id = generateRequestId();
    const parts = id.split('_');

    // Random part should be 7 characters (substring(2, 9) of base36)
    const randomPart = parts[2];
    expect(randomPart.length).toBe(7);
    expect(/^[a-z0-9]+$/.test(randomPart)).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }

    // All 100 IDs should be unique
    expect(ids.size).toBe(100);
  });

  it('format matches expected pattern', () => {
    const id = generateRequestId();

    // Should match: req_{timestamp}_{7 alphanumeric chars}
    const pattern = /^req_\d+_[a-z0-9]{7}$/;
    expect(pattern.test(id)).toBe(true);
  });
});
