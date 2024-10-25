import { GoogleGenerativeAI, GenerativeModel, GenerationConfig, SchemaType } from "@google/generative-ai";
import { url } from "inspector";


const model = "gemini-1.5-flash";

class AIModelHandlerImp {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(apiKey: string, context: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    let schema: GenerationConfig["responseSchema"]
    if (context === "productSearch") {
      schema = getProductSearchSchema();
    } else if (context === "productExtract") {
      schema = getProductInfoSchema();
    }

    this.model = this.genAI.getGenerativeModel({
      model,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
  }

  public getModel(): GenerativeModel {
    return this.model;
  }

  public async generateContent(prompt: string): Promise<any> {
    return this.model.generateContent(prompt);
  }
}

function getProductSearchSchema() {
  return {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        productName: {
          type: SchemaType.STRING,
          description: "Title of the product",
        },
        price: {
          type: SchemaType.NUMBER,
          description: "Price of the product",
        },
        url: {
          type: SchemaType.STRING,
          description: "URL of the product",
        }
      },
      required: ["productName", "price"],
    },
  };
}


// function to get the productInfo from a product page (productName, price, description)
function getProductInfoSchema() {
  return {
    type: SchemaType.OBJECT,
    properties: {
      productName: {
        type: SchemaType.STRING,
        description: "Title of the product",
      },
      price: {
        type: SchemaType.NUMBER,
        description: "Price of the product",
      },
      description: {
        type: SchemaType.STRING,
        description: "Description of the product",
      },
    },
    required: ["productName", "price", "description"],
  };
}

export interface LLMService {
  getModel(): GenerativeModel;
  generateContent(prompt: string): Promise<any>;
}

export default AIModelHandlerImp;