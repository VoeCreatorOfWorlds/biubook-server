import puppeteer, { Browser, Page } from 'puppeteer';
import { AppLogger as logger } from './services/loggerService';
import { IBrowserAgent, ProductInfo } from './types';
import { ProductExtractor } from './services/productSearchService';
import { BROWSER } from './constants';

class BrowserAgent implements IBrowserAgent {
  private browser: Browser | null = null;
  private anthropicApiKey: string;

  constructor(anthropicApiKey: string) {
    this.anthropicApiKey = anthropicApiKey;
  }

  initialize(): void {
    if (!this.browser) {
      this.browser = BROWSER;
    }
  }

  async getProductInfo(
    productName: string,
    siteUrl: string
  ): Promise<ProductInfo | null> {
    logger.info(`Searching for product: ${productName} on ${siteUrl}`);

    if (!this.browser) {
      this.initialize();
    }

    let page: Page | null = null;
    try {
      page = await this.createNewPage();

      const productSearcher = new ProductExtractor(page, siteUrl, this.anthropicApiKey);
      const product = await productSearcher.extractProduct(productName);

      return product;
    } catch (error) {
      logger.error(`Product search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      if (page) {
        console.log("closing page");
        await page.close();
      }
    }
  }

  private async createNewPage(): Promise<Page> {
    if (!this.browser) throw new Error("Browser not initialized");
    const page = await this.browser.newPage();
    page.setDefaultTimeout(5000);
    return page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export { BrowserAgent, ProductExtractor };
export default BrowserAgent;