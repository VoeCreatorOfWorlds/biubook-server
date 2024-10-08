import { Cart, CartProduct } from "../types";

export class OriginalCart implements Cart {
    constructor(public products: CartProduct[]) { }

    getTotalPrice(): number {
        return this.products.reduce((total, product) => total + product.price * product.quantity, 0);
    }
}