import { GoogleGenerativeAI, GenerativeModel, GenerationConfig, SchemaType } from "@google/generative-ai";
import { Logger } from 'winston';

class AIModelHandlerImp {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    this.logger = logger;
  }

  async generateStructuredContent(prompt: string, schema: any): Promise<any> {
    const generationConfig: GenerationConfig = {
      temperature: 0.2,
      topK: 1,
      topP: 1,
      maxOutputTokens: 4096,
    };

    const responseSchema = this.convertSchemaToGeminiFormat(schema);

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
        tools: [{
          functionDeclarations: [{
            name: "structure_json",
            description: "Structure the content according to the given schema",
            parameters: responseSchema
          }]
        }]
      });

      const response = result.response;
      const toolOutput = this.extractToolOutput(response);

      if (!toolOutput) {
        throw new Error('No tool output found in Gemini response');
      }

      this.logger.debug('Structured data extracted successfully from Gemini');
      return toolOutput;
    } catch (error) {
      this.logger.error(`Error generating structured content: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to generate structured content');
    }
  }

  private convertSchemaToGeminiFormat(schema: any): any {
    // Convert the input schema to Gemini's expected format
    const convertedSchema: any = {
      type: SchemaType.OBJECT,
      properties: {},
      required: []
    };

    for (const [key, value] of Object.entries(schema.properties)) {
      convertedSchema.properties[key] = {
        type: (value as any).type,
        description: (value as any).description
      };
      if (schema.required && schema.required.includes(key)) {
        convertedSchema.required.push(key);
      }
    }

    return convertedSchema;
  }

  private extractToolOutput(response: any): any | null {
    const functionCall = response.candidates[0]?.content?.parts[0]?.functionCall;
    if (functionCall && functionCall.name === 'structure_json') {
      return JSON.parse(functionCall.args.json);
    }
    return null;
  }
}

export default AIModelHandlerImp;