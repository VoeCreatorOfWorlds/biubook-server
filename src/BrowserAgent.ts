import puppeteer, { Browser, KeyInput, KeyPressOptions, Page } from 'puppeteer';
import crypto from 'crypto';
import ProductSearcher from './services/productSearchService';
import { createLogger, transports, format } from 'winston';

const logger = createLogger({
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

class BrowserAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private productSearcher: ProductSearcher;

  constructor(googleAIApiKey: string, redisUrl: string) {
    this.productSearcher = new ProductSearcher(googleAIApiKey, logger);
  }

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    if (!this.page) {
      this.page = await this.browser.newPage();
      this.page.setDefaultTimeout(30000); // 30 seconds
    }
  }

  async navigateToEcommerceSite(url: string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.goto(url, { waitUntil: 'networkidle0' });
    console.log(`Navigated to ${url}`);
  }

  async performProductSearch(siteUrl: string, searchTerm: string, maxResults: number = 3) {
    await this.initialize();
    try {
      await this.navigateToEcommerceSite(siteUrl);
      if (!this.page) throw new Error("Page not initialized");
      const products = await this.productSearcher.searchProducts(this.page, searchTerm, maxResults);
      return products;
    } catch (error) {
      console.error(`Product search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export default BrowserAgent;