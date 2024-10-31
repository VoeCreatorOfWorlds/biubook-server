import { Request, Response } from 'express';
import { LLM_API_KEY, REDIS_URL } from './constants';
import { ExpenseCheckRequest, ExpenseCheckResult, CartProduct } from './types';
import BrowserAgent from './BrowserAgent';
import { CartComparisonService } from './services/cartComparisonService';
import { OriginalCart } from './helpers/originalCart';
import { AppLogger } from './services/loggerService';

const logger = AppLogger.child({ service: 'eCommerceHandler' });

if (REDIS_URL === undefined || LLM_API_KEY === undefined) {
    logger.error('Missing required environment variables. Please check your .env file.');
    process.exit(1);
}

export const checkExpenseHandler = async (req: Request<{}, {}, ExpenseCheckRequest>, res: Response): Promise<void> => {
    const { cartProducts, hostname }: ExpenseCheckRequest = req.body;

    if (!cartProducts || !Array.isArray(cartProducts) || cartProducts.length === 0) {
        logger.warn('Missing required parameters in expense check request');
        res.status(400).json({ success: false, error: 'Missing required parameters' });
        return;
    }

    const browserAgent = new BrowserAgent(LLM_API_KEY!);

    try {
        await browserAgent.initialize();

        const cartComparisonService = new CartComparisonService(browserAgent);
        const originalCart = new OriginalCart(cartProducts);
        const alternativeCarts = await cartComparisonService.compareCart(cartProducts, hostname);

        const expenseCheckResult: ExpenseCheckResult = {
            originalCart,
            alternativeCarts
        };

        logger.info(`Expense check result: ${JSON.stringify(expenseCheckResult)}`);

        res.json({ success: true, ...expenseCheckResult });
    } catch (error) {
        logger.error(`Expense check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
        await browserAgent.close();
    }
};