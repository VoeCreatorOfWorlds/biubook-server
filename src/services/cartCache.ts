import Redis from 'ioredis';
import { createHash } from 'crypto';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { LLM_API_KEY, REDIS_URL } from "../constants";
import { CartProduct, GenerationResult } from "../types";
const fetch = require('node-fetch');
const { Headers } = fetch;

globalThis.fetch = fetch;
globalThis.Headers = Headers;

class CartCache {
    private redisClient: Redis;
    private genAI: GoogleGenerativeAI;
    private model: any; // Using 'any' here as the exact type is not provided in the Google AI library

    constructor() {
        if (!REDIS_URL) {
            throw new Error("REDIS_URL is not set");
        }

        this.redisClient = new Redis(REDIS_URL);
        this.redisClient.on('error', err => console.error('Redis Client Error', err));

        if (!LLM_API_KEY) {
            throw new Error("LLM_API_KEY is not set");
        }

        this.genAI = new GoogleGenerativeAI(LLM_API_KEY);
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: this.getCartProductSchema(),
            },
        });
    }

    private getCartProductSchema() {
        return {
            description: "List of products in the cart",
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    productName: {
                        type: SchemaType.STRING,
                        description: "Name of the product",
                        nullable: false,
                    },
                    price: {
                        type: SchemaType.NUMBER,
                        description: "Price of the product",
                        nullable: false,
                    },
                    quantity: {
                        type: SchemaType.NUMBER,
                        description: "Quantity of the product",
                        nullable: false,
                    },
                },
                required: ["productName", "price", "quantity"],
            },
        };
    }

    private generateHash(text: string): string {
        return createHash('sha256').update(`${text}`).digest('hex');
    }

    async getCartProducts(userEmail: string, cartDescription: string): Promise<GenerationResult> {
        const unstructuredHash = this.generateHash(cartDescription);

        const cachedUnstructuredHash = await this.redisClient.get(`email:${userEmail}:unstructured`);

        if (cachedUnstructuredHash !== unstructuredHash) {
            const result = await this.generateCartProducts(cartDescription);
            const structuredHash = this.generateHash(JSON.stringify(result));

            await this.redisClient.set(`email:${userEmail}:unstructured`, unstructuredHash);
            await this.redisClient.set(`email:${userEmail}:structured`, JSON.stringify(result));
            return result;
        }

        const cachedStructuredResult = await this.redisClient.get(`email:${userEmail}:structured`);

        if (cachedStructuredResult) {
            console.log("cached result found")
            try {
                return JSON.parse(cachedStructuredResult) as GenerationResult;
            } catch (parseError) {
                console.error('Failed to parse cached structured result:', parseError);
                // If parsing fails, regenerate the result
            }
        }

        // If structured result is missing or invalid, regenerate and store
        const result = await this.generateCartProducts(cartDescription);
        console.log("caching result")
        await this.redisClient.set(`email:${userEmail}:structured`, JSON.stringify(result));
        return result;
    }

    private async generateCartProducts(cartDescription: string): Promise<GenerationResult> {
        const prompt = `You are a shopping assistant that can read what a user has in their cart based on HTML innerText.
Your task is to list the products in the cart based on the user's description.
Please provide your response in the following JSON format:

{
    "cartProducts": [
        {
            "productName": "string",
            "price": number,
            "quantity": number
        }
    ]
}

Ensure that all fields are present for each product and that the types are correct.
The productName must be in close proximity to related content such as "in stock", "add to cart", price, etc.
Only include products that are clearly part of the cart or shopping list.
If you're unsure about a product or its details, do not include it in the list. Here is the cart: ${cartDescription}`;

        try {
            const result = await this.model.generateContent(prompt);
            const rawResponse = result.response.text();
            const cartProducts: CartProduct[] = JSON.parse(rawResponse);

            return {
                cartProducts,
                rawResponse
            };
        } catch (error) {
            console.error('Error listing cart products:', error);
            throw new Error('Failed to list cart products');
        }
    }

    async generateCustomPrompt(prompt: string): Promise<string> {
        try {
            const result = await this.model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error('Error generating content:', error);
            throw new Error('Failed to generate content');
        }
    }

    async close(): Promise<void> {
        await this.redisClient.quit();
    }
}

export default CartCache;