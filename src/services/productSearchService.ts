import { Page, ElementHandle } from 'puppeteer';
import { Logger } from 'winston';
//import { AdvancedHTMLParser, AnchorLink } from './services/advancedHTMLService';
import { AdvancedHTMLParser, AnchorLink } from './advancedHTMLService';
import PopupDetector from '../PopupDetector';
import AIModelHandler from './llmService';
interface ProductSearchItem {
  title: string;
  price: number;
}

interface Product extends ProductSearchItem {
  url: string;
}

class ProductSearcher {
  private logger: Logger;
  private htmlParser: AdvancedHTMLParser;
  private popupDetector: PopupDetector;
  private aiModelHandler: AIModelHandler;

  constructor(anthropicApiKey: string, logger: Logger) {
    this.logger = logger;
    this.logger.info('Initializing ProductSearcher');
    this.htmlParser = new AdvancedHTMLParser(logger);
    this.popupDetector = new PopupDetector(logger);
    this.aiModelHandler = new AIModelHandler(anthropicApiKey, logger);
    this.logger.info('ProductSearcher initialized successfully');
  }

  async searchProducts(page: Page, searchTerm: string, maxResults: number = 3): Promise<Product[]> {
    this.logger.info(`Starting product search for term: "${searchTerm}", max results: ${maxResults}`);
    try {
      await this.popupDetector.handlePopup(page);
      const searchInput = await this.findSearchInput(page);
      if (searchInput) {
        await this.performSearch(page, searchInput, searchTerm);
      } else {
        throw new Error('Search input is null');
      }

      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));

      const pageContent = await page.content();
      const rootDomain = new URL(page.url()).origin;
      const parsedContent = this.htmlParser.parseHTML(pageContent, rootDomain);

      const productSearchItems = await this.getStructuredDataFromAI(parsedContent.bodyContent, maxResults);
      const searchResults = await this.identifyProductLinks(parsedContent.anchorLinks, productSearchItems, searchTerm);

      this.logger.info(`Product search completed successfully, found ${searchResults.length} products`);
      return searchResults;
    } catch (error) {
      this.logger.error(`Error during product search: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to search for products');
    }
  }

  private async findSearchInput(page: Page): Promise<ElementHandle<Element> | null> {
    this.logger.debug('Finding search input');
    try {
      const pageContent = await page.content();
      const rootDomain = new URL(page.url()).origin;
      const parsedContent = this.htmlParser.parseHTML(pageContent, rootDomain);

      if (parsedContent.potentialSearchInputs.length === 0) {
        throw new Error('No potential search inputs found');
      }

      for (const selector of parsedContent.potentialSearchInputs) {
        const element = await page.$(selector);
        if (element) {
          this.logger.debug(`Search input found with selector: ${selector}`);
          return element;
        }
      }

      throw new Error('No matching search input found on page');
    } catch (error) {
      this.logger.error(`Error finding search input: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to find search input on page');
    }
  }

  private async performSearch(page: Page, searchInput: ElementHandle<Element>, searchTerm: string): Promise<void> {
    this.logger.debug(`Performing search for term: "${searchTerm}"`);
    try {
      await searchInput.type(searchTerm);
      await searchInput.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
      this.logger.debug('Search performed and page navigated');
    } catch (error) {
      this.logger.error(`Error performing search: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to perform search');
    }
  }

  private async getStructuredDataFromAI(content: string, maxResults: number): Promise<ProductSearchItem[]> {
    const schema = {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              price: { type: "number" },
            },
            required: ["title", "price"],
          },
        },
      },
      required: ["products"],
    };

    const prompt = `Given the following content of a search results page, extract the relevant information for the first ${maxResults} products including their titles and prices:

${content}

Remember to return a JSON object with a 'products' array containing objects with 'title' and 'price' properties.`;

    try {
      const result = await this.aiModelHandler.generateStructuredContent(prompt, schema);
      this.logger.debug('Structured data extracted successfully from AI');
      return result.products.slice(0, maxResults);
    } catch (error) {
      this.logger.error(`Error getting structured data from AI: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to extract structured data from AI');
    }
  }

  private async identifyProductLinks(anchorLinks: AnchorLink[], productSearchItems: ProductSearchItem[], searchTerm: string): Promise<Product[]> {
    this.logger.debug('Identifying product links from anchor tags and search results');
    console.log("Number of anchor links: ", anchorLinks.length);
    console.log("Number of product search items: ", productSearchItems.length);

    const linkPairs = anchorLinks.map(link => `${link.href}|||${link.innerText}`).join('\n');
    const productItems = productSearchItems.map(item => `${item.title}|||${item.price}`).join('\n');

    const schema = {
      type: "object",
      properties: {
        mappedProducts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              price: { type: "number" },
              url: { type: "string" },
            },
            required: ["title", "price", "url"],
          },
        },
      },
      required: ["mappedProducts"],
    };

    const prompt = `Given the following:

1. A list of URL and text pairs from anchor tags:
${linkPairs}

2. A list of product search results with titles and prices:
${productItems}

3. The search term: "${searchTerm}"

Task: Map each product search result to the most appropriate URL from the anchor tags. Consider the relevance of the URL text to the product title and the search term. If no suitable URL is found for a product, use an empty string.

Return a JSON object with a 'mappedProducts' array, each item containing the title, price, and mapped URL.`;

    try {
      const result = await this.aiModelHandler.generateStructuredContent(prompt, schema);
      this.logger.debug(`Mapped ${result.mappedProducts.length} products to URLs`);
      return result.mappedProducts;
    } catch (error) {
      this.logger.error(`Error mapping product links: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      return productSearchItems.map(item => ({ ...item, url: '' }));
    }
  }
}

export default ProductSearcher;