import { Page, ElementHandle } from 'puppeteer';
import { Logger } from 'winston';
import { AnchorLink } from './advancedHTMLService';
import { ProductSearcher as IProductSearcher, Product } from '../types';
import { AdvancedHTMLParser } from '../types';
import { PopupDetector, ProductSearchItem } from '../types';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { LLM_API_KEY, REDIS_URL } from "../constants";
import Redis from 'ioredis';
import { createHash } from 'crypto';

interface SearchResult {
  products: Product[];
  rawResponse: string;
}

class ProductSearcherImp implements IProductSearcher {
  public logger: Logger;
  public htmlParser: AdvancedHTMLParser;
  public popupDetector: PopupDetector;
  public genAI: GoogleGenerativeAI;
  public model: any;
  public redisClient: Redis;

  constructor(logger: Logger, htmlParser: AdvancedHTMLParser, popupDetector: PopupDetector) {
    this.logger = logger;
    this.logger.info('Initializing ProductSearcher');
    this.htmlParser = htmlParser;
    this.popupDetector = popupDetector;

    if (!LLM_API_KEY) {
      throw new Error("LLM_API_KEY is not set");
    }

    if (!REDIS_URL) {
      throw new Error("REDIS_URL is not set");
    }

    this.genAI = new GoogleGenerativeAI(LLM_API_KEY);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.getProductSearchSchema(),
      },
    });

    this.redisClient = new Redis(REDIS_URL);
    this.redisClient.on('error', err => this.logger.error('Redis Client Error', err));

    this.logger.info('ProductSearcher initialized successfully');
  }

  public getProductSearchSchema() {
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
        },
        required: ["productName", "price"],
      },
    };
  }

  public generateHash(text: string): string {
    return createHash('sha256').update(`${text}`).digest('hex');
  }

  public async searchProducts(page: Page, searchTerm: string, maxResults: number = 3): Promise<Product[]> {
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

      const searchResult = await this.getCachedOrFreshSearchResult(parsedContent.bodyContent, searchTerm, maxResults);

      this.logger.info(`Product search completed successfully, found ${searchResult.products.length} products`);
      return searchResult.products;
    } catch (error) {
      this.logger.error(`Error during product search: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to search for products');
    }
  }

  public async getCachedOrFreshSearchResult(content: string, searchTerm: string, maxResults: number): Promise<SearchResult> {
    const contentHash = this.generateHash(content);
    const cacheKey = `search:${searchTerm}:${contentHash}`;

    const cachedResult = await this.redisClient.get(cacheKey);
    if (cachedResult) {
      this.logger.debug('Cached search result found');
      return JSON.parse(cachedResult);
    }

    const productSearchItems = await this.getStructuredDataFromAI(content, maxResults);
    const searchResults = await this.identifyProductLinks([], productSearchItems, searchTerm);

    const result: SearchResult = {
      products: searchResults,
      rawResponse: JSON.stringify(productSearchItems)
    };

    await this.redisClient.set(cacheKey, JSON.stringify(result));
    this.logger.debug('Search result cached');

    return result;
  }

  public async findSearchInput(page: Page): Promise<ElementHandle<Element> | null> {
    this.logger.debug('Finding search input');
    try {
      const pageContent = await page.content();
      const rootDomain = new URL(page.url()).origin;
      const parsedContent = this.htmlParser.parseHTML(pageContent, rootDomain);

      if (parsedContent.potentialSearchInputs.length === 0) {
        throw new Error('No potential search inputs found');
      }


      const timeout = 5000;
      for (const selector of parsedContent.potentialSearchInputs) {
        try {
          const element = await page.waitForSelector(selector, { timeout });
          if (element) {
            this.logger.debug(`Search input found with selector: ${selector}`);
            return element;
          }
        } catch (error) {
          if (error instanceof Error && error.name !== 'TimeoutError') {
            throw error;
          }
          // If it's a TimeoutError, continue to the next selector
        }
      }

      throw new Error('No matching search input found on page');
    } catch (error) {
      this.logger.error(`Error finding search input: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to find search input on page');
    }
  }

  public async performSearch(page: Page, searchInput: ElementHandle<Element>, searchTerm: string): Promise<void> {
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

  public async getStructuredDataFromAI(content: string, maxResults: number): Promise<ProductSearchItem[]> {
    const prompt = `List the first ${maxResults} products from this search results page with their productNames and prices: ${content}`;

    try {
      const result = await this.model.generateContent(prompt);
      const rawResponse = result.response.text();
      const productSearchItems: ProductSearchItem[] = JSON.parse(rawResponse);
      console.log("productSearchItems: ", productSearchItems);

      this.logger.debug('Structured data extracted successfully from AI');
      return productSearchItems.slice(0, maxResults);
    } catch (error) {
      this.logger.error(`Error getting structured data from AI: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to extract structured data from AI');
    }
  }

  public async identifyProductLinks(anchorLinks: AnchorLink[], productSearchItems: ProductSearchItem[], searchTerm: string): Promise<Product[]> {
    const productItems = productSearchItems.map(item => `${item.productName}|||${item.price}`).join('\n');

    const prompt = `For these products, provide URLs that would be most relevant for purchasing them:
Products:
${productItems}

Search term: "${searchTerm}"

Return a JSON array of objects with 'productName', 'price', and 'url' properties. Use an empty string for 'url' if no relevant URL can be determined.`;

    try {
      const result = await this.model.generateContent(prompt);
      const rawResponse = result.response.text();
      const mappedProducts: Product[] = JSON.parse(rawResponse);

      this.logger.debug(`Mapped ${mappedProducts.length} products to URLs`);
      return mappedProducts;
    } catch (error) {
      this.logger.error(`Error mapping product links: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      return productSearchItems.map(item => ({ productName: item.productName, price: item.price, url: '' }));
    }
  }

  public async close(): Promise<void> {
    await this.redisClient.quit();
  }
}

export default ProductSearcherImp;