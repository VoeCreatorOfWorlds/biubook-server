import { Page } from 'puppeteer';
import { createLogger, transports, format, Logger } from 'winston';
import { HTMLParser } from './htmlParser';
import { LLMService } from './llmService';
import AIModelHandlerImp from './llmService';
import { ProductInfo } from '../types';
import { SiteNavigator } from './siteNavigator';

const logger: Logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'product-extractor.log' })
  ]
});

interface LLMResponse {
  productName: string;
  price: number;
  description: string;
}

export class ProductExtractor {
  private htmlParser: HTMLParser;
  private llmService: LLMService;
  private siteNavigator: SiteNavigator;

  constructor(
    page: Page,
    private siteUrl: string,
    anthropicApiKey: string
  ) {
    this.htmlParser = new HTMLParser(logger, page);
    this.llmService = new AIModelHandlerImp(anthropicApiKey, "productExtract");
    this.siteNavigator = new SiteNavigator(page, siteUrl);
  }

  async extractProduct(specifiedProduct: string): Promise<ProductInfo | null> {
    await this.siteNavigator.initialize();
    logger.info(`Extracting product info from ${this.siteUrl}`);

    try {
      console.log("trying to extract product info from ", this.siteUrl);
      // Get the current page HTML content
      const parsedContent = await this.htmlParser.parseHTML(this.siteNavigator.getCurrentPage());

      // Use LLM to extract product information
      const prompt = `Extract product information from this product page contentfor the product "${specifiedProduct}".
      Page content innerText: ${parsedContent.innerText}
      
      Return a single object with:
      - productName: The full product name/title
      - price: The current price as a number (no currency symbols)
      - description: A description of the product (if available)`;

      const result = await this.llmService.generateContent(prompt);
      const response = await result.response.text();

      try {
        const productInfo: LLMResponse = JSON.parse(response);
        if (!productInfo.productName || productInfo.price === undefined) {
          logger.warn('Invalid product information extracted');
          return null;
        }

        return {
          productName: productInfo.productName,
          price: productInfo.price,
          url: this.siteUrl,
          description: productInfo.description || '',
        };
      } catch (parseError) {
        logger.error('Failed to parse LLM response:', parseError);
        return null;
      }
    } catch (error) {
      logger.error(`Error extracting product info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
}

export default ProductExtractor;