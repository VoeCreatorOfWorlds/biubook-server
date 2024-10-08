import { Cart, AlternativeCart, ProductSearchResult, AlternativeProduct } from '../types';
import { AlternativeCartImpl } from '../helpers/alternativeCart';
import { IBrowserAgent } from '../types';

export class CartComparisonService {
    constructor(private agent: IBrowserAgent) { }

    async compareCart(originalCart: Cart, siteUrls: string[], maxResults?: number): Promise<AlternativeCart[]> {
        const alternativeCarts: AlternativeCart[] = [];

        for (const siteUrl of siteUrls) {
            const alternativeProducts: AlternativeProduct[] = [];

            for (const product of originalCart.products) {
                try {
                    const searchResults = await this.agent.searchProduct(product.productName, siteUrl, maxResults);
                    const cheapestAlternative = this.findCheapestAlternative(searchResults);
                    if (cheapestAlternative) {
                        alternativeProducts.push(cheapestAlternative);
                    }
                } catch (error) {
                    continue;
                }
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