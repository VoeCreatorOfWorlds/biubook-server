import { Request, Response } from 'express';
import CartCache from './services/cartCache';
import { AuthenticatedRequest } from './auth';

// Define the structure of the request body
interface CartRetrievalRequest {
  cartDescription: string;
}

// Define the structure of the response
interface CartRetrievalResponse {
  cartProducts: Array<{
    productName: string;
    price: number;
    quantity: number;
  }>;
}

// Instantiate CartCache outside the handler
const cartCache = new CartCache();

// Graceful shutdown function
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Closing CartCache connection.');
  await cartCache.close();
  process.exit(0);
});

export async function retrieveCartHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { cartDescription } = req.body as CartRetrievalRequest;

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

  const userId = req.user.email; // Assuming the email is used as the user identifier

  console.log('Cart description:', cartDescription);
  console.log('User ID:', userId);

  try {
    console.log('Calling retrieveCartContents');
    const result = await retrieveCartContents(userId, cartDescription);
    res.json(result);
  } catch (error) {
    console.error("Error in retrieveCartHandler:", error);
    res.status(500).json({ error: (error as Error).message });
  }
}

async function retrieveCartContents(userId: string, cartDescription: string): Promise<CartRetrievalResponse> {
  try {
    console.log('Calling cartCache.getCartProducts');
    const { cartProducts } = await cartCache.getCartProducts(userId, cartDescription);
    
    console.log('Cart products retrieved for user:', userId);

    return { cartProducts };
  } catch (error) {
    console.error('Error in retrieveCartContents:', error);
    throw new Error('Failed to retrieve cart contents');
  }
}