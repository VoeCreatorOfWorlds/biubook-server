import Redis from 'ioredis';
import { AppLogger } from './loggerService';
import { randomBytes } from 'crypto';

const logger = AppLogger.child({ service: 'UrlShortener' });

export class UrlShortener {
    private redis: Redis;
    private readonly SHORT_URL_LENGTH = 8;
    private readonly EXPIRATION_SECONDS = 24 * 60 * 60; // 1 day
    private readonly URL_PREFIX = 'url:';
    private readonly REVERSE_PREFIX = 'reverse:';

    constructor(redisUrl: string) {
        this.redis = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3
        });

        this.redis.on('error', (err) => {
            logger.error('Redis Client Error:', err);
        });

        this.redis.on('connect', () => {
            logger.info('Redis connected successfully');
        });
    }

    /**
     * Generate a random string of specified length
     */
    private generateShortId(): string {
        return randomBytes(Math.ceil(this.SHORT_URL_LENGTH / 2))
            .toString('hex')
            .slice(0, this.SHORT_URL_LENGTH);
    }

    /**
     * Get or create a shortened URL
     * @param url The original URL to shorten
     * @returns The shortened URL identifier
     */
    async getShortenedUrl(url: string): Promise<string> {
        try {
            // Validate URL
            if (!this.isValidUrl(url)) {
                throw new Error('Invalid URL provided');
            }

            // Check if URL already has a shortened version
            const existingId = await this.redis.get(`${this.REVERSE_PREFIX}${url}`);
            if (existingId) {
                logger.debug(`Found existing shortened URL for ${url}`);
                return existingId;
            }

            // Generate new short URL
            let shortId: string;
            let attempts = 0;
            const maxAttempts = 3;

            do {
                shortId = this.generateShortId();
                const exists = await this.redis.get(`${this.URL_PREFIX}${shortId}`);

                if (!exists) {
                    // Use multi to ensure atomic operation
                    const multi = this.redis.multi();
                    multi.setex(`${this.URL_PREFIX}${shortId}`, this.EXPIRATION_SECONDS, url);
                    multi.setex(`${this.REVERSE_PREFIX}${url}`, this.EXPIRATION_SECONDS, shortId);

                    await multi.exec();
                    logger.info(`Created new shortened URL: ${shortId} for ${url}`);
                    return shortId;
                }

                attempts++;
            } while (attempts < maxAttempts);

            throw new Error('Failed to generate unique short URL after multiple attempts');

        } catch (error) {
            logger.error('Error in getShortenedUrl:', error);
            throw error;
        }
    }

    /**
     * Get the original URL from a shortened URL identifier
     * @param shortId The shortened URL identifier
     * @returns The original URL or null if not found
     */
    async getOriginalUrl(shortId: string): Promise<string | null> {
        try {
            const url = await this.redis.get(`${this.URL_PREFIX}${shortId}`);

            if (url) {
                // Use multi to refresh both keys atomically
                const multi = this.redis.multi();
                multi.expire(`${this.URL_PREFIX}${shortId}`, this.EXPIRATION_SECONDS);
                multi.expire(`${this.REVERSE_PREFIX}${url}`, this.EXPIRATION_SECONDS);
                await multi.exec();
            }

            return url;
        } catch (error) {
            logger.error('Error in getOriginalUrl:', error);
            throw error;
        }
    }

    /**
     * Close the Redis connection
     */
    async close(): Promise<void> {
        try {
            await this.redis.quit();
            logger.info('Redis connection closed');
        } catch (error) {
            logger.error('Error closing Redis connection:', error);
            throw error;
        }
    }

    /**
     * Validate URL format
     * @param url URL to validate
     * @returns boolean indicating if URL is valid
     */
    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
}