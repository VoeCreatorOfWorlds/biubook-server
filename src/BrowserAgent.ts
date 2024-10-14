import puppeteer, { Browser, Page } from 'puppeteer';
import { createLogger, transports, format, Logger } from 'winston';
import { ProductSearchResult, IBrowserAgent, AIModelHandler, AdvancedHTMLParser, PopupDetector } from './types';
import ProductSearcherImp from './services/productSearchService';
import AIModelHandlerImp from './services/llmService';
import { AdvancedHTMLParserImp } from './services/advancedHTMLService';
import PopupDetectorImp from './PopupDetector';
import { LLMService } from './services/llmService';

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
  private page: Page | null = null;
  private productSearcher: ProductSearcherImp;
  private aiModelHandler: LLMService;
  private htmlParser: AdvancedHTMLParser;
  private popupDetector: PopupDetector;

  constructor(anthropicApiKey: string, context: string) {
    this.aiModelHandler = new AIModelHandlerImp(anthropicApiKey, context);
    this.htmlParser = new AdvancedHTMLParserImp(logger);
    this.popupDetector = new PopupDetectorImp(logger);
    this.productSearcher = new ProductSearcherImp(logger, this.htmlParser, this.popupDetector, this.aiModelHandler);
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

  async searchProduct(
    productName: string,
    siteUrl: string,
    maxResults?: number
  ): Promise<ProductSearchResult[]> {
    logger.info(`Searching for product: ${productName} on ${siteUrl}`);

    const products = await this.performProductSearch(siteUrl, productName, maxResults);
    return [{ siteUrl, products: products.map(p => ({ ...p, url: "", siteUrl })) }];

  }

  async navigateToEcommerceSite(url: string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.goto(url, { waitUntil: 'networkidle0' });
    logger.info(`Navigated to ${url}`);
  }

  async performProductSearch(siteUrl: string, searchTerm: string, maxResults: number = 3) {
    await this.initialize();
    try {
      // structure of urls 'www.takealot.com', 'businessasmission.com'
      // let's ensure urls are correctly formatted and ncan be navigated to
      if (!siteUrl.startsWith('https://')) {
        siteUrl = `https://${siteUrl}`;
      }
      console.log(`Navigating to ${siteUrl}`);
      await this.navigateToEcommerceSite(siteUrl);
      if (!this.page) throw new Error("Page not initialized");
      const products = await this.productSearcher.searchProducts(this.page, searchTerm, maxResults);
      return products;
    } catch (error) {
      logger.error(`Product search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
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