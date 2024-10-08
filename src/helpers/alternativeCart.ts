import { AlternativeCart, AlternativeProduct, CartProduct } from '../types';
import { OriginalCart } from './originalCart';

export class AlternativeCartImpl implements AlternativeCart {
    constructor(public products: AlternativeProduct[], public originalProducts: CartProduct[]) { }

    getTotalPrice(): number {
        return this.products.reduce((total, product, index) =>
            total + product.price * this.originalProducts[index].quantity, 0);
    }

    getPotentialSavings(): number {
        const originalTotal = new OriginalCart(this.originalProducts).getTotalPrice();
        return Math.max(0, originalTotal - this.getTotalPrice());
    }
}