import winston from 'winston';

const logDirectory = process.env.LOG_DIR?.trim();
const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
  ...(logDirectory ? [
    new winston.transports.File({ dirname: logDirectory, filename: 'error.log', level: 'error' }),
    new winston.transports.File({ dirname: logDirectory, filename: 'combined.log' }),
  ] : []),
];

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports,
});
