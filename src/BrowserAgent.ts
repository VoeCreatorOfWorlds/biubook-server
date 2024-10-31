import puppeteer, { Browser, Page } from 'puppeteer';
import { AppLogger as logger } from './services/loggerService';
import { IBrowserAgent, ProductInfo } from './types';
import { ProductExtractor } from './services/productSearchService';



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

  async getProductInfo(
    productName: string,
    siteUrl: string
  ): Promise<ProductInfo | null> {
    logger.info(`Searching for product: ${productName} on ${siteUrl}`);

    if (!this.browser) {
      await this.initialize();
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
    page.setDefaultTimeout(2500);
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