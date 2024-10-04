import Anthropic from "@anthropic-ai/sdk";
import { Message, ToolUseBlock } from "@anthropic-ai/sdk/resources";
import { Logger } from 'winston';

class AIModelHandler {
  private anthropic: Anthropic;
  private logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
    this.logger = logger;
  }

  async generateStructuredContent(prompt: string, schema: any): Promise<any> {
    const systemPrompt = `You are a helpful AI assistant that processes content and returns structured data according to the given schema. Always use the provided JSON tool to structure your response.`;

    const jsonTool = {
      name: "structure_json",
      description: "Structure the content according to the given schema",
      input_schema: schema,
    };

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 4096,
        temperature: 0.2,
        system: systemPrompt,
        messages: [
          { role: "user", content: prompt }
        ],
        tools: [jsonTool]
      });

      const toolOutput = this.extractToolOutput(response);

      if (!toolOutput) {
        throw new Error('No tool output found in Claude response');
      }

      this.logger.debug('Structured data extracted successfully from Claude');
      return toolOutput;
    } catch (error) {
      this.logger.error(`Error generating structured content: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to generate structured content');
    }
  }

  private extractToolOutput(response: Message): any | null {
    for (const contentBlock of response.content) {
      if (contentBlock.type === 'tool_use' && contentBlock.name === 'structure_json') {
        return contentBlock.input
      }
    }
    return null;
  }
}

export default AIModelHandler;