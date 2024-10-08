import { Page, ElementHandle } from 'puppeteer';
import { Logger } from 'winston';
import { AnchorLink } from './advancedHTMLService';
import { ProductSearcher as IProductSearcher, Product } from '../types';
import { AdvancedHTMLParser } from '../types';
import { PopupDetector } from '../types';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { LLM_API_KEY } from "../constants";

interface ProductSearchItem {
  title: string;
  price: number;
}

class ProductSearcherImp implements IProductSearcher {
  private logger: Logger;
  private htmlParser: AdvancedHTMLParser;
  private popupDetector: PopupDetector;
  private genAI: GoogleGenerativeAI;
  private model: any; // Using 'any' here as the exact type is not provided in the Google AI library

  constructor(logger: Logger, htmlParser: AdvancedHTMLParser, popupDetector: PopupDetector) {
    this.logger = logger;
    this.logger.info('Initializing ProductSearcher');
    this.htmlParser = htmlParser;
    this.popupDetector = popupDetector;

    if (!LLM_API_KEY) {
      throw new Error("LLM_API_KEY is not set");
    }

    this.genAI = new GoogleGenerativeAI(LLM_API_KEY);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.getProductSearchSchema(),
      },
    });

    this.logger.info('ProductSearcher initialized successfully');
  }

  private getProductSearchSchema() {
    return {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Title of the product",
          },
          price: {
            type: SchemaType.NUMBER,
            description: "Price of the product",
          },
        },
        required: ["title", "price"],
      },
    };
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

      const productSearchItems = await this.getStructuredDataFromAI(parsedContent.bodyContent, maxResults);
      const searchResults = await this.identifyProductLinks(parsedContent.anchorLinks, productSearchItems, searchTerm);

      this.logger.info(`Product search completed successfully, found ${searchResults.length} products`);
      return searchResults;
    } catch (error) {
      this.logger.error(`Error during product search: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to search for products');
    }
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
    const prompt = `List the first ${maxResults} products from this search results page with their titles and prices: ${content}`;

    try {
      const result = await this.model.generateContent(prompt);
      const rawResponse = result.response.text();
      const productSearchItems: ProductSearchItem[] = JSON.parse(rawResponse);

      this.logger.debug('Structured data extracted successfully from AI');
      return productSearchItems.slice(0, maxResults);
    } catch (error) {
      this.logger.error(`Error getting structured data from AI: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw new Error('Failed to extract structured data from AI');
    }
  }

  public async identifyProductLinks(anchorLinks: AnchorLink[], productSearchItems: ProductSearchItem[], searchTerm: string): Promise<Product[]> {
    this.logger.debug('Identifying product links from anchor tags and search results');
    console.log("Number of anchor links: ", anchorLinks.length);
    console.log("Number of product search items: ", productSearchItems.length);

    const linkPairs = anchorLinks.map(link => `${link.href}|||${link.innerText}`).join('\n');
    const productItems = productSearchItems.map(item => `${item.title}|||${item.price}`).join('\n');

    const prompt = `Map these products to the most relevant URLs:
Products:
${productItems}

URLs:
${linkPairs}

Search term: "${searchTerm}"

Return a JSON array of objects with 'title', 'price', and 'url' properties. Use an empty string for 'url' if no match is found.`;

    try {
      const result = await this.model.generateContent(prompt);
      const rawResponse = result.response.text();
      const mappedProducts: Product[] = JSON.parse(rawResponse);

      this.logger.debug(`Mapped ${mappedProducts.length} products to URLs`);
      return mappedProducts.map(item => ({
        productName: item.productName,
        price: item.price,
        url: ""
      }));
    } catch (error) {
      this.logger.error(`Error mapping product links: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      return productSearchItems.map(item => ({ productName: item.title, price: item.price, url: '' }));
    }
  }
}

export default ProductSearcherImp;