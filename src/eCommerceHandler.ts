import { Request, Response } from 'express';
import BrowserAgent from './BrowserAgent';
import { LLM_API_KEY, REDIS_URL } from './constants';

if (REDIS_URL === undefined || LLM_API_KEY === undefined) {
    console.error('Missing required environment variables. Please check your .env file.');
    process.exit(1);
}

const browserAgent = new BrowserAgent(LLM_API_KEY, REDIS_URL);

// Initialize the browser when the module is loaded
browserAgent.initialize().catch(console.error);

interface AnalyzeCartRequest {
    siteUrl: string;
    userEmail: string;
}

interface SearchProductsRequest {
    siteUrl: string;
    searchTerm: string;
    maxResults?: number;
}

export const searchProductsHandler = async (req: Request<{}, {}, SearchProductsRequest>, res: Response) => {
    const { siteUrl, searchTerm, maxResults } = req.body;

    console.log(`Received search request: siteUrl=${siteUrl}, searchTerm=${searchTerm}, maxResults=${maxResults}`);

    if (!siteUrl || !searchTerm) {
        console.warn('Missing required parameters in search request');
        return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    try {
        console.log(`Initiating product search on site: ${siteUrl} with term: ${searchTerm}`);
        const products = await browserAgent.performProductSearch(siteUrl, searchTerm, maxResults);
        console.log("products: ", products)
        console.log(`Product search successful: found ${products.length} products`);
        res.json({ success: true, products });
    } catch (error) {
        console.error(`Product search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
};

// Graceful shutdown function
export const shutdownGracefully = async () => {
    console.log('Shutting down gracefully');
    await browserAgent.close();
};