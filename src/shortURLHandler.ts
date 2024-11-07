import { Request, Response } from 'express';
import { UrlShortener } from './services/urlShortner';
import { AppLogger } from './services/loggerService';

interface UrlVisitLog {
    shortId: string;
    originalUrl: string;
    timestamp: Date;
    userAgent?: string;
    referer?: string;
    ip: string;
}

const logger = AppLogger.child({ service: 'ShortURLHandler' });

export const createShortUrlHandler = (urlShortener: UrlShortener) => {
    return async (req: Request, res: Response): Promise<void> => {
        const shortId = req.params.shortId;

        try {
            const originalUrl = await urlShortener.getOriginalUrl(shortId);

            if (!originalUrl) {
                logger.warn(`Attempted to access non-existent short URL: ${shortId}`);
                res.status(404).send('Short URL not found');
                return;
            }

            // Log the visit
            const visitLog: UrlVisitLog = {
                shortId,
                originalUrl,
                timestamp: new Date(),
                userAgent: req.get('user-agent'),
                referer: req.get('referer'),
                ip: getClientIp(req)
            };

            logger.info('URL Visit', {
                ...visitLog,
                ip: maskIpAddress(visitLog.ip)
            });

            // Ensure URL has proper protocol
            let redirectUrl = originalUrl;
            if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
                redirectUrl = `https://${redirectUrl}`;
            }

            logger.debug('Redirecting to:', { originalUrl, redirectUrl });
            res.redirect(redirectUrl);

        } catch (error) {
            logger.error('Error handling shortened URL redirect:', error);
            res.status(500).send('Internal Server Error');
        }
    };
};

// Helper function to get client IP
function getClientIp(req: Request): string {
    const forwardedFor = req.get('X-Forwarded-For');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// Helper function to mask IP address for privacy
function maskIpAddress(ip: string): string {
    if (ip === 'unknown') return ip;

    if (ip.includes('.')) {
        // IPv4
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.*.*`;
    }

    if (ip.includes(':')) {
        // IPv6
        const parts = ip.split(':');
        return `${parts.slice(0, 4).join(':')}:****`;
    }

    return ip;
}