import { Page } from 'puppeteer';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { HTMLParser } from './htmlParser';
import { LLMService } from './llmService';
import AIModelHandlerImp from './llmService';
import { ProductInfo } from '../types';
import { SiteNavigator } from './siteNavigator';
import { REDIS_URL } from '../constants';
import { AppLogger as logger } from './loggerService';
import { CartProduct } from '../types';
import { Logger } from 'winston';



interface LLMResponse {
  productName: string;
  price: number;
  description: string;
}

interface CacheKey {
  product: string;
  site: string;
}

export class ProductExtractor {
  private htmlParser: HTMLParser;
  private llmService: LLMService;
  private siteNavigator: SiteNavigator;
  private redisClient: Redis;
  private readonly CACHE_EXPIRY = 60 * 60 * 24; // 1 hour in seconds
  private logger: Logger;

  constructor(
    page: Page,
    private siteUrl: string,
    anthropicApiKey: string
  ) {
    if (!REDIS_URL) {
      throw new Error("REDIS_URL is not set");
    }

    this.htmlParser = new HTMLParser(logger, page);
    this.llmService = new AIModelHandlerImp(anthropicApiKey, "productExtract");
    this.siteNavigator = new SiteNavigator(page, siteUrl);
    this.redisClient = new Redis(REDIS_URL);

    this.redisClient.on('error', err => {
      this.logger.error('Redis Client Error', err);
    });

    this.logger = logger.child({ service: 'ProductExtractor' });
  }

  private generateCacheKey(product: string, site: string): string {
    const key: CacheKey = { product, site };
    return createHash('sha256')
      .update(JSON.stringify(key))
      .digest('hex');
  }

  private async getCachedProduct(cacheKey: string): Promise<ProductInfo | null> {
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Cache hit for product info', { cacheKey });
        return JSON.parse(cached) as ProductInfo;
      }
      this.logger.debug('Cache miss for product info', { cacheKey });
      return null;
    } catch (error) {
      this.logger.error('Error retrieving from cache:', error);
      return null;
    }
  }

  private async cacheProduct(cacheKey: string, productInfo: ProductInfo): Promise<void> {
    try {
      await this.redisClient.setex(
        cacheKey,
        this.CACHE_EXPIRY,
        JSON.stringify(productInfo)
      );
      this.logger.debug('Successfully cached product info', { cacheKey });
    } catch (error) {
      this.logger.error('Error caching product info:', error);
    }
  }

  async extractProduct(specifiedProduct: string): Promise<ProductInfo | null> {
    const cacheKey = this.generateCacheKey(specifiedProduct, this.siteUrl);

    // Try to get from cache first
    const cachedProduct = await this.getCachedProduct(cacheKey);
    if (cachedProduct) {
      this.logger.info('Returning cached product info');
      return cachedProduct;
    }

    // If not in cache, proceed with extraction
    await this.siteNavigator.initialize();
    this.logger.info(`Extracting product info from ${this.siteUrl}`);

    try {
      //console.log("trying to extract product info from ", this.siteUrl);
      this.logger.info(`Extracting product info from ${this.siteUrl}`);
      const parsedContent = await this.htmlParser.parseHTML(this.siteNavigator.getCurrentPage());

      const prompt = `Extract product information from this product page content for the product "${specifiedProduct}".
      Page content innerText: ${parsedContent.innerText}
      
      Return a single object with:
      - productName: The full product name/title
      - price: The current price as a number (no currency symbols)
      - description: A description of the product (if available) - summarize in less than 10 words`;

      console.log("prompt: ", prompt);

      const result = await this.llmService.generateContent(prompt);
      const response = await result.response.text();

      try {
        const productInfo: LLMResponse = JSON.parse(response);
        if (!productInfo.productName || productInfo.price === undefined) {
          this.logger.warn('Invalid product information extracted');
          return null;
        }

        const extractedProduct: ProductInfo = {
          productName: productInfo.productName,
          price: productInfo.price,
          url: this.siteUrl,
          description: productInfo.description || '',
        };

        // Cache the successfully extracted product
        await this.cacheProduct(cacheKey, extractedProduct);

        return extractedProduct;
      } catch (parseError) {
        this.logger.error('Failed to parse LLM response:', parseError);
        return null;
      }
    } catch (error) {
      this.logger.error(`Error extracting product info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  async close(): Promise<void> {
    await this.redisClient.quit();
  }
}

export default ProductExtractor;