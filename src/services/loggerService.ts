import { createLogger, transports, format, Logger } from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';
import morgan from 'morgan';
import { LOGTAIL_SOURCE_TOKEN, NODE_ENV, LOG_LEVEL } from '../constants';

if (!LOGTAIL_SOURCE_TOKEN) {
    throw new Error('LOGTAIL_SOURCE_TOKEN is not set');
}
const logtail = new Logtail(LOGTAIL_SOURCE_TOKEN);

const morganJsonFormat = JSON.stringify({
    method: ':method',
    url: ':url',
    status: ':status',
    responseTime: ':response-time',
    userAgent: ':user-agent',
    ip: ':remote-addr',
    date: ':date[iso]'
});

export const morganMiddleware = morgan(morganJsonFormat);

const AppLogger: Logger = createLogger({
    level: LOG_LEVEL,
    format: format.combine(
        format.errors({ stack: true }),
        format.timestamp(),
        format.json(),
    ),
    defaultMeta: {
        service: 'buybook',
        environment: NODE_ENV,
    },
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        }),
        new LogtailTransport(logtail)
    ],
    exceptionHandlers: [
        new transports.Console(),
        new LogtailTransport(logtail)
    ],
    rejectionHandlers: [
        new transports.Console(),
        new LogtailTransport(logtail)
    ]
});

export { AppLogger };