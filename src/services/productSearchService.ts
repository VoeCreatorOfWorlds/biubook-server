import { Page, ElementHandle } from 'puppeteer';
import { Logger } from 'winston';
import { AnchorLink, AdvancedHTMLParser, PopupDetector, ProductSearchItem, Product, IProductSearcher } from '../types';
import { LLM_API_KEY, REDIS_URL } from "../constants";
import { LLMService } from './llmService';
import Redis from 'ioredis';
import { createHash } from 'crypto';

interface SearchResult {
  products: Product[];
  rawResponse: string;
}


type LoggedFunction<T extends (...args: any[]) => any> = T;

class ProductSearcherImp implements IProductSearcher {
  private logger: Logger;
  private htmlParser: AdvancedHTMLParser;
  private popupDetector: PopupDetector;
  private model: LLMService;
  private redisClient: Redis;

  constructor(logger: Logger, htmlParser: AdvancedHTMLParser, popupDetector: PopupDetector, model: LLMService) {
    this.logger = logger;
    this.logger.info('Initializing ProductSearcher');
    this.htmlParser = htmlParser;
    this.popupDetector = popupDetector;
    this.model = model;

    if (!LLM_API_KEY) {
      throw new Error("LLM_API_KEY is not set");
    }

    if (!REDIS_URL) {
      throw new Error("REDIS_URL is not set");
    }

    this.redisClient = new Redis(REDIS_URL);
    this.redisClient.on('error', err => this.logger.error('Redis Client Error', err));

    this.logger.info('ProductSearcher initialized successfully');
  }

  private generateHash(text: string): string {
    return createHash('sha256').update(`${text}`).digest('hex');
  }

  private logExecutionTime<T extends (...args: any[]) => any>(func: T, funcName: string): LoggedFunction<T> {
    return (async (...args: Parameters<T>) => {
      const start = Date.now();
      this.logger.info(`Starting ${funcName} at ${start}`);
      const result = await func.apply(this, args);
      const end = Date.now();
      this.logger.info(`Finished ${funcName} at ${end}, duration: ${end - start}ms`);
      return result;
    }) as LoggedFunction<T>;
  }

  public searchProducts: LoggedFunction<(page: Page, searchTerm: string, maxResults?: number) => Promise<Product[]>> =
    this.logExecutionTime(async (page: Page, searchTerm: string, maxResults: number = 2): Promise<Product[]> => {
      this.logger.info(`Starting product search for term: "${searchTerm}", max results: ${maxResults}`);
      try {
        await this.popupDetector.handlePopup(page);
        const searchInput = await this.findSearchInput(page);
        if (searchInput) {
          await this.performSearch(page, searchInput, searchTerm);
        } else {
          throw new Error('Search input is null');
        }

        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 10000)));

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
    }, 'searchProducts');

  private getCachedOrFreshSearchResult: LoggedFunction<(content: string, searchTerm: string, maxResults: number) => Promise<SearchResult>> =
    this.logExecutionTime(async (content: string, searchTerm: string, maxResults: number): Promise<SearchResult> => {
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

      await this.redisClient.set(cacheKey, JSON.stringify(result), 'EX', 3600); // Cache for 1 hour
      this.logger.debug('Search result cached');

      return result;
    }, 'getCachedOrFreshSearchResult');

  public findSearchInput: LoggedFunction<(page: Page) => Promise<ElementHandle<Element> | null>> =
    this.logExecutionTime(async (page: Page): Promise<ElementHandle<Element> | null> => {
      this.logger.debug('Finding search input');
      try {
        const pageContent = await page.content();
        const rootDomain = new URL(page.url()).origin;
        const parsedContent = this.htmlParser.parseHTML(pageContent, rootDomain);

        if (parsedContent.potentialSearchInputs.length === 0) {
          throw new Error('No potential search inputs found');
        }

        const timeout = 400;
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
    }, 'findSearchInput');

  public performSearch: LoggedFunction<(page: Page, searchInput: ElementHandle<Element>, searchTerm: string) => Promise<void>> =
    this.logExecutionTime(async (page: Page, searchInput: ElementHandle<Element>, searchTerm: string): Promise<void> => {
      this.logger.debug(`Performing search for term: "${searchTerm}"`);
      try {
        console.log("searchTerm: ", searchTerm);
        console.log("searchInput: ", searchInput);
        await searchInput.type(searchTerm);
        await searchInput.press('Enter');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
        // check for popup here
        await this.popupDetector.handlePopup(page);
        this.logger.debug('Search performed and page navigated');
      } catch (error) {
        this.logger.error(`Error performing search: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
        throw new Error('Failed to perform search');
      }
    }, 'performSearch');

  private getStructuredDataFromAI: LoggedFunction<(content: string, maxResults: number) => Promise<ProductSearchItem[]>> =
    this.logExecutionTime(async (content: string, maxResults: number): Promise<ProductSearchItem[]> => {
      const prompt = `List the first ${maxResults} products from this search results page with their productNames and prices: ${content}. if there are no products, return an empty array.`;

      try {
        const result = await this.model.generateContent(prompt);
        const rawResponse = result.response.text();
        const productSearchItems: ProductSearchItem[] = JSON.parse(rawResponse);

        if (!Array.isArray(productSearchItems) || productSearchItems.length === 0) {
          throw new Error('Invalid response from AI');
        }

        console.log("productSearchItems: ", productSearchItems);

        this.logger.debug('Structured data extracted successfully from AI');
        return productSearchItems.slice(0, maxResults);
      } catch (error) {
        this.logger.error(`Error getting structured data from AI: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
        throw new Error('Failed to extract structured data from AI');
      }
    }, 'getStructuredDataFromAI');

  private identifyProductLinks: LoggedFunction<(anchorLinks: AnchorLink[], productSearchItems: ProductSearchItem[], searchTerm: string) => Promise<Product[]>> =
    this.logExecutionTime(async (anchorLinks: AnchorLink[], productSearchItems: ProductSearchItem[], searchTerm: string): Promise<Product[]> => {
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
    }, 'identifyProductLinks');

  public close: LoggedFunction<() => Promise<void>> =
    this.logExecutionTime(async (): Promise<void> => {
      await this.redisClient.quit();
    }, 'close');
}

export default ProductSearcherImp;