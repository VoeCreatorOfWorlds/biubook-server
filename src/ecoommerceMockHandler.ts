import { Request, Response } from 'express';
import { ExpenseCheckRequest, ExpenseCheckResult, Cart, AlternativeCart, CartProduct, AlternativeProduct } from './types';
import { Logger } from 'winston';
import { MockCartAugmentedCart } from './types';
import { searchAndScoreHostnames } from './services/searchEngineService';

// Create a mock logger
const mockLogger: Logger = {
    info: (message: string) => console.log(message),
    warn: (message: string) => console.warn(message),
    error: (message: string) => console.error(message),
} as unknown as Logger;


class MockOriginalCart implements Cart {
    constructor(public products: CartProduct[]) { }

    getTotalPrice(): number {
        return this.products.reduce((total, product) => total + product.price * product.quantity, 0);
    }
}

class MockAlternativeCart implements AlternativeCart {
    constructor(public products: AlternativeProduct[], public originalProducts: CartProduct[]) { }

    getTotalPrice(): number {
        return this.products.reduce((total, product) => total + product.price, 0);
    }

    getPotentialSavings(): number {
        const originalTotal = this.originalProducts.reduce((total, product) => total + product.price * product.quantity, 0);
        return originalTotal - this.getTotalPrice();
    }
}

export const mockCheckExpenseHandler = async (req: Request<{}, {}, ExpenseCheckRequest>, res: Response): Promise<void> => {
    const { cartProducts, maxResults }: ExpenseCheckRequest = req.body;

    mockLogger.info(`Received mock expense check request: ${cartProducts?.length ?? 0} products`);

    if (!cartProducts || !Array.isArray(cartProducts) || cartProducts.length === 0) {
        mockLogger.warn('Missing required parameters in mock expense check request');
        res.status(400).json({ success: false, error: 'Missing required parameters' });
        return;
    }

    // Search and score hostnames
    /*const scoredHostnames = await searchAndScoreHostnames(cartProducts, 10, mockLogger);
    console.log("Scored hostnames: ", scoredHostnames);
    const siteUrls = scoredHostnames.slice(0, 3).map(result => result);*/

    // let's create a mock implementation of the scoredHostnames array
    const siteUrls = ['www.amazon.com', 'www.walmart.com', 'www.bestbuy.com'];


    try {
        const originalCart = new MockOriginalCart(cartProducts);

        // Create mock alternative carts
        const alternativeCarts: AlternativeCart[] = siteUrls.map(siteUrl => {
            console.log(`Creating alternative cart for site: ${siteUrl}`);
            const alternativeProducts: AlternativeProduct[] = cartProducts.map(product => {
                const randomFactor = 0.2 + Math.random() * 1.8; // Random factor between 0.2 and 2
                const discountedPrice = product.price * randomFactor;

                return {
                    productName: product.productName,
                    price: discountedPrice * product.quantity,
                    url: `https://${siteUrl}/product/${product.productName.replace(/ /g, '-')}`,
                    siteUrl: siteUrl,
                    description: `Mock description for ${product.productName} from ${siteUrl}`,
                    quantity: product.quantity
                };
            });

            return new MockAlternativeCart(alternativeProducts, cartProducts);
        });

        // create a function that iterates through the alternative carts and calculates the total price and returns a destructured alre with
        // the total price
        const alternativeCartsWithTotal: MockCartAugmentedCart[] = alternativeCarts.map((cart) => {
            return {
                ...cart,
                total: cart.getTotalPrice()
            }
        });

        console.log(alternativeCartsWithTotal);

        const expenseCheckResult: ExpenseCheckResult = {
            originalCart,
            alternativeCarts: alternativeCartsWithTotal
        };

        res.json({ success: true, ...expenseCheckResult });
    } catch (error) {
        mockLogger.error(`Mock expense check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
};