const morgan = require('morgan');
const logger = require('../utils/logger');

// Register custom Morgan token for correlation requestId
morgan.token('req-id', (req) => req.requestId || req.id || '-');

// Production format logs structured details with correlation ID; development format includes requestId
const formatString = process.env.NODE_ENV === 'production'
  ? ':remote-addr - [:req-id] :method :url :status - :response-time ms - :user-agent'
  : '[:req-id] :method :url :status - :response-time ms';

const httpLogger = morgan(formatString, {
  stream: {
    // Pipe morgan request log output streams directly to winston
    write: (message) => {
      logger.info(message.trim());
    }
  }
});

module.exports = httpLogger;
