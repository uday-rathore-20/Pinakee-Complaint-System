const morgan = require('morgan');
const logger = require('../utils/logger');

// Production format logs structured details; development format is short and readable
const formatString = process.env.NODE_ENV === 'production'
  ? ':remote-addr - :method :url :status - :response-time ms - :user-agent'
  : 'dev';

const httpLogger = morgan(formatString, {
  stream: {
    // Pipe morgan request log output streams directly to winston
    write: (message) => {
      logger.info(message.trim());
    }
  }
});

module.exports = httpLogger;
