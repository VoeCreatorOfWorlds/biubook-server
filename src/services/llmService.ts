import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { LLM_API_KEY } from "../constants";

if (!LLM_API_KEY) {
  throw new Error("LLM API key is not set");
}

const genAI = new GoogleGenerativeAI(LLM_API_KEY);

// Define the schema for structured output
const cartProductSchema = {
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

// Define the model with structured output configuration
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: cartProductSchema,
  },
});

// Define types for our responses
interface CartProduct {
  productName: string;
  price: number;
  quantity: number;
}

interface GenerationResult {
  cartProducts: CartProduct[];
  rawResponse: string;
}

export const listCartProducts = async (cartDescription: string): Promise<GenerationResult> => {
  let prompt = `List the products in this cart with their names, prices, and quantities: ${cartDescription}`;

  try {
    const result = await model.generateContent(prompt);
    const rawResponse = result.response.text();

    // Parse the raw response to extract the cart products
    const cartProducts: CartProduct[] = JSON.parse(rawResponse);

    return {
      cartProducts,
      rawResponse
    };
  } catch (error) {
    console.error('Error listing cart products:', error);
    throw new Error('Failed to list cart products');
  }
};

export const generateCustomPrompt = async (prompt: string): Promise<string> => {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Error generating content:', error);
    throw new Error('Failed to generate content');
  }
};