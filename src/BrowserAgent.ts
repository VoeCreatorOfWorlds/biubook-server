import puppeteer, { Browser, Page } from 'puppeteer';
import { createLogger, transports, format, Logger } from 'winston';
import { ProductSearchResult, IBrowserAgent, AIModelHandler, AdvancedHTMLParser, PopupDetector, Product } from './types';
import { ProductSearcher } from './services/productSearchService';

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

class BrowserAgent implements IBrowserAgent {
  private browser: Browser | null = null;
  private anthropicApiKey: string;

  constructor(anthropicApiKey: string) {
    this.anthropicApiKey = anthropicApiKey;
  }

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async searchProduct(
    productName: string,
    siteUrl: string,
    maxResults?: number
  ): Promise<ProductSearchResult[]> {
    logger.info(`Searching for product: ${productName} on ${siteUrl}`);

    if (!this.browser) {
      await this.initialize();
    }

    let page: Page | null = null;
    try {
      page = await this.createNewPage();
      const productSearcher = new ProductSearcher(page, siteUrl, this.anthropicApiKey);
      const products = await productSearcher.searchProducts(productName, maxResults);

      return [{
        siteUrl,
        products: products.map(p => ({ ...p, siteUrl, url: p.url }))
      }];
    } catch (error) {
      logger.error(`Product search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  private async createNewPage(): Promise<Page> {
    if (!this.browser) throw new Error("Browser not initialized");
    const page = await this.browser.newPage();
    page.setDefaultTimeout(30000);
    return page;
  }

  async navigateToEcommerceSite(page: Page, url: string): Promise<void> {
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      url = `https://${url}`;
    }
    await page.goto(url, { waitUntil: 'networkidle0' });
    logger.info(`Navigated to ${url}`);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export { BrowserAgent, ProductSearcher };
export default BrowserAgent;