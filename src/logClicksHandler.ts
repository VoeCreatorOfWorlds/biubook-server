import { Request, Response } from 'express';
import { AppLogger } from './services/loggerService';

const logger = AppLogger.child({ service: 'clickTrackingHandler' });

// Types for the click tracking
interface ProductClick {
    productName: string;
    productUrl: string;
    price: number;
    timestamp: string;
    siteUrl: string;
}

interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email?: string;
    };
}

export const trackProductClickHandler = async (
    req: AuthenticatedRequest,
    res: Response
): Promise<void> => {
    const clickData: ProductClick = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!clickData.productUrl || !clickData.productName) {
        logger.warn('Missing required parameters in click tracking request', {
            providedData: clickData,
            userId,
            userEmail
        });

        res.status(400).json({
            success: false,
            error: 'Missing required parameters: productUrl and productName are required'
        });
        return;
    }

    try {
        // Enrich click data with user info and metadata
        const enrichedClickData = {
            ...clickData,
            userId,
            userEmail,
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
            referrer: req.headers.referer || req.headers.referrer
        };

        // Log the enriched click data
        logger.info('Product click tracked', {
            ...enrichedClickData,
            eventType: 'product_click'
        });

        res.json({
            success: true,
            message: 'Click tracked successfully',
            timestamp: enrichedClickData.timestamp
        });

    } catch (error) {
        logger.error('Error tracking product click:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            clickData,
            userId,
            userEmail
        });

        res.status(500).json({
            success: false,
            error: 'Failed to track product click'
        });
    }
};