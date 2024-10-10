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

export class CartComparisonService {
    constructor(private agent: IBrowserAgent) { }

    async compareCart(cartProducts: CartProduct[], hostname: string): Promise<AlternativeCart[]> {
        const alternativeCarts: AlternativeCart[] = [];
        const originalCart = new OriginalCart(cartProducts);
        const scoredHostnames = await searchAndScoreHostnames(cartProducts, 10, logger);
        console.log("Scored hostnames: ", scoredHostnames);

        // Ensure the hostname is not in the scoredHostnames
        const hostnameRegex = new RegExp(`^(?:https?:\/\/)?(?:www\.)?${hostname.replace('.', '\\.')}`, 'i');
        const filteredHostnames = scoredHostnames.filter(scoredHostname => !hostnameRegex.test(scoredHostname));
        console.log("Filtered hostnames: ", filteredHostnames);

        let count = 0;

        for (const siteUrl of filteredHostnames) {
            if (count >= MAX_RESULTS) {
                break;
            }

            const alternativeProducts: AlternativeProduct[] = [];

            try {
                for (const product of originalCart.products) {
                    const searchResults = await this.agent.searchProduct(product.productName, siteUrl);
                    const cheapestAlternative = this.findCheapestAlternative(searchResults);
                    if (cheapestAlternative) {
                        alternativeProducts.push(cheapestAlternative);
                    }
                }

                if (alternativeProducts.length === originalCart.products.length) {
                    alternativeCarts.push(new AlternativeCartImpl(alternativeProducts, originalCart.products));
                    count++;
                }

            } catch (error) {
                continue;
            }

            if (alternativeProducts.length === originalCart.products.length) {
                alternativeCarts.push(new AlternativeCartImpl(alternativeProducts, originalCart.products));
            }
        }

        return alternativeCarts;
    }

    private findCheapestAlternative(searchResults: ProductSearchResult[]): AlternativeProduct | null {
        let cheapestProduct: AlternativeProduct | null = null;
        let cheapestPrice: number = Infinity;

        for (const result of searchResults) {
            for (const product of result.products) {
                if (product.price < cheapestPrice) {
                    cheapestProduct = product;
                    cheapestPrice = product.price;
                }
            }
        }

        return cheapestProduct;
    }
}