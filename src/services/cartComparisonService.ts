import { Cart, AlternativeCart, ProductSearchResult, AlternativeProduct, CartProduct } from '../types';
import { AlternativeCartImpl } from '../helpers/alternativeCart';
import { IBrowserAgent } from '../types';
import { searchAndScoreHostnames } from './searchEngineService';
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
const PRODUCT_BATCH_SIZE = 3; // Number of products to search concurrently per site
const MAX_ATTEMPTS = 2; // Maximum number of sites to try before returning results

export class CartComparisonService {
    private attemptCount = 0;

    constructor(private agent: IBrowserAgent) { }

    async compareCart(cartProducts: CartProduct[], hostname: string): Promise<AlternativeCart[]> {
        const alternativeCarts: AlternativeCart[] = [];
        const originalCart = new OriginalCart(cartProducts);

        logger.info(`Starting cart comparison for ${cartProducts.length} products`);

        // Get and filter hostnames
        const scoredHostnames = await searchAndScoreHostnames(cartProducts, 10, logger);
        const hostnameRegex = new RegExp(`^(?:https?:\/\/)?(?:www\.)?${hostname.replace('.', '\\.')}`, 'i');
        const filteredHostnames = scoredHostnames.filter(scoredHostname => !hostnameRegex.test(scoredHostname));

        logger.info(`Processing ${filteredHostnames.length} alternative sites`);

        // Process sites in batches
        for (let i = 0; i < filteredHostnames.length && this.attemptCount < MAX_ATTEMPTS; i += SITE_BATCH_SIZE) {
            const siteBatch = filteredHostnames.slice(i, i + SITE_BATCH_SIZE);
            logger.debug(`Processing site batch ${i / SITE_BATCH_SIZE + 1}`);

            const batchResults = await Promise.all(
                siteBatch.map(siteUrl => this.processSiteWithBatching(siteUrl, originalCart))
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
    }

    private async processSiteWithBatching(siteUrl: string, originalCart: OriginalCart): Promise<AlternativeCart | null> {
        try {
            logger.debug(`Processing site: ${siteUrl}`);
            const allAlternativeProducts: AlternativeProduct[] = [];

            // Process products in batches
            for (let i = 0; i < originalCart.products.length; i += PRODUCT_BATCH_SIZE) {
                const productBatch = originalCart.products.slice(i, i + PRODUCT_BATCH_SIZE);

                const searchPromises = productBatch.map(product =>
                    this.agent.searchProduct(product.productName, siteUrl)
                        .catch(error => {
                            logger.error(`Failed to search for ${product.productName} on ${siteUrl}:`, error);
                            return [];
                        })
                );

                const batchResults = await Promise.all(searchPromises);
                const batchAlternatives = batchResults
                    .map(this.findCheapestAlternative)
                    .filter((product): product is AlternativeProduct => product !== null);

                allAlternativeProducts.push(...batchAlternatives);

                // Early exit if we're missing any products
                if (allAlternativeProducts.length < i + productBatch.length) {
                    logger.debug(`Missing alternatives for some products in ${siteUrl}`);
                    return null;
                }
            }

            // Only create cart if we found alternatives for all products
            if (allAlternativeProducts.length === originalCart.products.length) {
                logger.debug(`Successfully created alternative cart for ${siteUrl}`);
                return new AlternativeCartImpl(allAlternativeProducts, originalCart.products);
            }
        } catch (error) {
            logger.error(`Error processing site ${siteUrl}:`, error);
        }

        return null;
    }

    private findCheapestAlternative(searchResults: ProductSearchResult[]): AlternativeProduct | null {
        return searchResults
            .flatMap(result => result.products)
            .reduce((cheapest, product) => {
                if (!cheapest || product.price < cheapest.price) {
                    return product;
                }
                return cheapest;
            }, null as AlternativeProduct | null);
    }
}