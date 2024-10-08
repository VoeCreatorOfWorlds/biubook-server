import { Response } from 'express';
import { AuthenticatedRequest } from './auth';

interface CartRetrievalRequest {
    cartDescription: string;
}

interface CartProduct {
    productName: string;
    price: number;
    quantity: number;
}

interface CartRetrievalResponse {
    cartProducts: CartProduct[];
}

const mockProducts: CartProduct[] = [
    { productName: "Laptop", price: 999.99, quantity: 1 },
    { productName: "Desktop Computer", price: 1299.99, quantity: 1 },
    { productName: "Tablet", price: 499.99, quantity: 1 },
    { productName: "Smartphone", price: 799.99, quantity: 1 },
    { productName: "Wireless Mouse", price: 29.99, quantity: 1 },
    { productName: "Wireless Keyboard", price: 49.99, quantity: 1 }
]

export async function mockRetrieveCartHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { cartDescription } = req.body as CartRetrievalRequest;

    console.log('Received request for cart retrieval');

    if (!cartDescription) {
        console.warn('Cart description is missing in the request');
        res.status(400).json({ error: 'Cart description is required' });
        return;
    }

    if (!req.user) {
        console.warn('User is not authenticated');
        res.status(401).json({ error: 'User is not authenticated' });
        return;
    }

    const userId = req.user.email;
    console.log('User ID:', userId);

    try {
        console.log('Retrieving mock cart contents');
        const result = await mockRetrieveCartContents();
        res.json(result);
    } catch (error) {
        console.error("Error in mockRetrieveCartHandler:", error);
        res.status(500).json({ error: (error as Error).message });
    }
}

async function mockRetrieveCartContents(): Promise<CartRetrievalResponse> {
    return new Promise((resolve) => {
        setTimeout(() => {
            const numberOfProducts = Math.floor(Math.random() * 3) + 2; // Random number between 2 and 4
            const selectedProducts = selectRandomProducts(numberOfProducts);
            console.log('Mock cart contents retrieved');
            resolve({ cartProducts: selectedProducts });
        }, 500); // Simulate a 500ms delay
    });
}

function selectRandomProducts(count: number): CartProduct[] {
    const shuffled = [...mockProducts].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(product => ({
        ...product,
        quantity: Math.floor(Math.random() * 3) + 1 // Random quantity between 1 and 3
    }));
}