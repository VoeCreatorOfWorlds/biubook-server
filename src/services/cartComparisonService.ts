import { Cart, AlternativeCart, AlternativeProduct, CartProduct } from '../types';
import { AlternativeCartImpl } from '../helpers/alternativeCart';
import { IBrowserAgent } from '../types';
import { ProductSearchService } from './searchEngineService';
import { OriginalCart } from '../helpers/originalCart';
import { MAX_RESULTS } from '../constants';
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'cart-comparison.log' })
    ]
});

const SITE_BATCH_SIZE = 2; // Number of sites to process concurrently
const MAX_ATTEMPTS = 3; // Maximum number of sites to try before returning results

export class CartComparisonService {
    private attemptCount = 0;
    private productSearchService: ProductSearchService;

    constructor(private agent: IBrowserAgent) {
        this.productSearchService = new ProductSearchService(logger);
    }

    async compareCart(cartProducts: CartProduct[], currentHostname: string): Promise<AlternativeCart[]> {
        const alternativeCarts: AlternativeCart[] = [];
        const originalCart = new OriginalCart(cartProducts);

        logger.info(`Starting cart comparison for ${cartProducts.length} products`);

        try {
            // Get sites with their product URLs
            const siteProductUrls = await this.productSearchService.searchAndTrackProductPages(cartProducts, currentHostname);

            // Filter out the current site
            for (const [hostname] of siteProductUrls) {
                if (hostname.includes(currentHostname)) {
                    siteProductUrls.delete(hostname);
                }
            }

            logger.info(`Found ${siteProductUrls.size} alternative sites to check`);

            // Convert Map entries to array for batch processing
            const sitesToProcess = Array.from(siteProductUrls.entries());

            // Process sites in batches
            for (let i = 0; i < sitesToProcess.length && this.attemptCount < MAX_ATTEMPTS; i += SITE_BATCH_SIZE) {
                const siteBatch = sitesToProcess.slice(i, i + SITE_BATCH_SIZE);
                logger.debug(`Processing site batch ${i / SITE_BATCH_SIZE + 1}`);

                const batchResults = await Promise.all(
                    siteBatch.map(([hostname, urlMap]) =>
                        this.processSite(hostname, urlMap, originalCart.products)
                    )
                );

                // Count successful attempts
                this.attemptCount += siteBatch.length;

                // Add successful results
                const validResults = batchResults.filter((cart): cart is AlternativeCart => cart !== null);
                alternativeCarts.push(...validResults);

                if (alternativeCarts.length >= MAX_RESULTS || this.attemptCount >= MAX_ATTEMPTS) {
                    logger.info(`Ending search: ${alternativeCarts.length} carts found after ${this.attemptCount} attempts`);
                    break;
                }
            }

            return alternativeCarts.slice(0, MAX_RESULTS);

        } catch (error) {
            logger.error('Error in cart comparison:', error);
            return [];
        }
    }

    private async processSite(
        hostname: string,
        urlMap: { [productName: string]: string },
        originalProducts: CartProduct[]
    ): Promise<AlternativeCart | null> {
        try {
            logger.debug(`Processing site: ${hostname}`);
            const alternativeProducts: AlternativeProduct[] = [];

            // Process each product URL
            for (const originalProduct of originalProducts) {
                const productUrl = urlMap[originalProduct.productName];
                if (!productUrl) {
                    logger.warn(`Missing URL for product ${originalProduct.productName} on ${hostname}`);
                    //return null;
                }

                try {
                    // Use the new getProductInfo method from BrowserAgent
                    const productInfo = await this.agent.getProductInfo(
                        originalProduct.productName,
                        productUrl
                    );

                    if (productInfo) {
                        // Create alternative product from product info
                        const alternativeProduct: AlternativeProduct = {
                            productName: productInfo.productName,
                            price: productInfo.price,
                            url: productUrl,
                            siteUrl: hostname
                        };
                        alternativeProducts.push(alternativeProduct);
                    } else {
                        logger.warn(`No product info found for ${originalProduct.productName} on ${hostname}`);
                        return null;
                    }

                } catch (error) {
                    logger.error(`Error processing product ${originalProduct.productName} on ${hostname}:`, error);
                    return null;
                }
            }

            // Only create cart if we found all products
            if (alternativeProducts.length === originalProducts.length) {
                logger.debug(`Successfully created alternative cart for ${hostname}`);
                return new AlternativeCartImpl(alternativeProducts, originalProducts);
            }

        } catch (error) {
            logger.error(`Error processing site ${hostname}:`, error);
        }

        return null;
    }
}