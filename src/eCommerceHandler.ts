import { Request, Response } from 'express';
import { LLM_API_KEY, REDIS_URL } from './constants';
import { ExpenseCheckRequest, ExpenseCheckResult, CartProduct } from './types';
import BrowserAgent from './BrowserAgent';
import { CartComparisonService } from './services/cartComparisonService';
import { OriginalCart } from './helpers/originalCart';
import { createLogger, transports, format } from 'winston';

if (REDIS_URL === undefined || LLM_API_KEY === undefined) {
    console.error('Missing required environment variables. Please check your .env file.');
    process.exit(1);
}



const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'expense-checker.log' })
    ]
});

export const checkExpenseHandler = async (req: Request<{}, {}, ExpenseCheckRequest>, res: Response): Promise<void> => {
    const { cartProducts, hostname }: ExpenseCheckRequest = req.body;
    console.log("Cart products: ", cartProducts);

    if (!cartProducts || !Array.isArray(cartProducts) || cartProducts.length === 0) {
        logger.warn('Missing required parameters in expense check request');
        res.status(400).json({ success: false, error: 'Missing required parameters' });
        return;
    }

    try {
        const browserAgent = new BrowserAgent(LLM_API_KEY!);
        await browserAgent.initialize(); // Ensure browser is initialized

        const cartComparisonService = new CartComparisonService(browserAgent);
        const originalCart = new OriginalCart(cartProducts);
        const alternativeCarts = await cartComparisonService.compareCart(cartProducts, hostname);

        const expenseCheckResult: ExpenseCheckResult = {
            originalCart,
            alternativeCarts
        };

        res.json({ success: true, ...expenseCheckResult });
    } catch (error) {
        logger.error(`Expense check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
        // Ensure browser is closed after operation
        // Note: You might want to manage this differently if you're reusing the BrowserAgent across requests
        // await browserAgent.close();
    }
};