import { Page } from 'puppeteer';
import { createLogger, transports, format, Logger } from 'winston';
import {
  AlternativeProduct,
  Product,
} from '../types';
import { HTMLParser } from './htmlParser';
import { SiteNavigator } from './siteNavigator';
import { LLMService } from './llmService';
import AIModelHandlerImp from './llmService';

const logger: Logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'product-searcher.log' })
  ]
});

export class ProductSearcher {
  private htmlParser: HTMLParser;
  private llmService: LLMService;
  private siteNavigator: SiteNavigator;

  constructor(
    page: Page,
    siteUrl: string,
    anthropicApiKey: string
  ) {
    this.htmlParser = new HTMLParser(logger, page);
    this.llmService = new AIModelHandlerImp(anthropicApiKey, "productSearch");
    this.siteNavigator = new SiteNavigator(page, siteUrl);
  }

  async searchProducts(searchTerm: string, maxResults: number = 3): Promise<AlternativeProduct[]> {
    logger.info(`Starting product search for term: "${searchTerm}", max results: ${maxResults}`);

    try {
      // Initialize navigation
      await this.siteNavigator.initialize();

      // Perform the search
      await this.siteNavigator.searchProduct(searchTerm);

      // Parse the results page
      const parsedContent = await this.htmlParser.parseHTML(this.siteNavigator.getCurrentPage());
      console.log("parsedContent: ", parsedContent);

      // Use LLM to extract product information
      const prompt = `Extract product information from this search results page. Search term: ${searchTerm}
      Page innerText: ${parsedContent.innerText}
      
      Return an array of products with name and price, limited to ${maxResults} results.`;
      console.log("prompt: ", prompt);

      const result = await this.llmService.generateContent(prompt);
      const response = await result.response.text();

      try {
        let products: Product[] = JSON.parse(response);
        logger.info(`Found ${products.length} products`);
        console.log("products: ", products);

        console.log("chosen product: ", products[0]);
        products = [products[0]];


        // Enhance products with URLs from parsed links using LLM
        const linkAssignmentPrompt = `Given this product array and link array, assign the most relevant link to each product based on the product name and the link text.
        Products: ${JSON.stringify(products)}
        Links: ${JSON.stringify(parsedContent.links)}
        
        Return an array of products with their assigned URLs.`;

        console.log("linkAssignmentPrompt: ", linkAssignmentPrompt);

        const linkAssignmentResult = await this.llmService.generateContent(linkAssignmentPrompt);
        const linkAssignmentResponse = await linkAssignmentResult.response.text();
        console.log("result.response: ", linkAssignmentResponse);
        const enhancedProducts = JSON.parse(linkAssignmentResponse);

        logger.info(`Found ${enhancedProducts.length} products with assigned links`);
        return enhancedProducts.slice(0, maxResults);
      } catch (parseError) {
        logger.error('Failed to parse LLM response:', parseError);
        return [];
      }
    } catch (error) {
      logger.error(`Error during product search: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }
}