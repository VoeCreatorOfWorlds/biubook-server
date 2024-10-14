import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import { Logger } from 'winston';
import Redis from 'ioredis';
import ProductSearcherImp from './productSearchService';
import { AdvancedHTMLParser, PopupDetector } from '../types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { LLMService } from './llmService';
import fs from 'fs';
import path from 'path';
import { GenerativeModel } from '@google/generative-ai';

// Mock dependencies
jest.mock('winston');
jest.mock('ioredis');
jest.mock('@google/generative-ai');

class MockLLMService implements LLMService {
    getModel(): GenerativeModel {
        throw new Error('Method not implemented.');
    }
    generateContent(prompt: string): Promise<any> {
        // Mock the response from the AI model
        return Promise.resolve({
            response: {
                text: () => JSON.stringify([
                    {
                        productName: 'Test Product',
                        price: 100,
                        url: 'https://example.com/test-product'
                    },
                ])
            }
        });
    }
}

// Import the actual AdvancedHTMLParser
import { AdvancedHTMLParserImp as ActualAdvancedHTMLParser } from '../services/advancedHTMLService';

describe('ProductSearcherImp Integration Tests', () => {
    let browser: Browser;
    let page: Page;
    let productSearcher: ProductSearcherImp;
    let mockLogger: jest.Mocked<Logger>;
    let htmlParser: AdvancedHTMLParser;
    let mockPopupDetector: jest.Mocked<PopupDetector>;
    let mockLLM: MockLLMService;

    const testSites = [
        { url: 'https://www.pnphome.co.za', expectedSelector: '.search-input' },
        //{ url: 'https://www.hirschs.co.za', expectedSelector: '.input-text' }
    ];

    const screenshotDir = path.join(__dirname, 'screenshots');

    beforeAll(async () => {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: null,
        });
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir);
        }
    });

    afterAll(async () => {
        await browser.close();
    });

    beforeEach(async () => {
        page = await browser.newPage();

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
        } as any;

        htmlParser = new ActualAdvancedHTMLParser(mockLogger);
        mockPopupDetector = {
            handlePopup: jest.fn(),
        } as any;

        mockLLM = new MockLLMService();

        productSearcher = new ProductSearcherImp(mockLogger, htmlParser, mockPopupDetector, mockLLM);
    });

    afterEach(async () => {
        await page.close();
    });

    async function takeScreenshot(page: Page, name: string) {
        const screenshotPath = path.join(screenshotDir, `${name}-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved: ${screenshotPath}`);
    }

    async function handleCookiePopup(page: Page) {
        try {
            // Wait for the cookie consent popup to appear (adjust timeout as needed)
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });

            // Click the "Accept All" button
            await page.click('#onetrust-accept-btn-handler');

            console.log('Cookie consent popup handled');
        } catch (error) {
            console.log('No cookie consent popup found or unable to handle it');
        }
    }

    describe('searchProducts', () => {
        test.each(testSites)('should find search input on $url', async ({ url, expectedSelector }) => {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await takeScreenshot(page, 'initial-page-load');

            await handleCookiePopup(page);
            await takeScreenshot(page, 'after-cookie-popup');

            const searchInput = await productSearcher.findSearchInput(page);
            await takeScreenshot(page, 'after-find-search-input');

            expect(searchInput).toBeTruthy();
            const inputHandle = await page.$(expectedSelector);
            expect(inputHandle).toBeTruthy();

            // Verify that the found search input matches the expected selector
            if (searchInput instanceof ElementHandle) {
                const matchesSelector = await page.evaluate(
                    (el, selector) => el.matches(selector),
                    searchInput,
                    expectedSelector
                );
                expect(matchesSelector).toBe(true);
            } else {
                throw new Error('searchInput is not an ElementHandle');
            }
        }, 40000);

        test.each(testSites)('should perform search on $url', async ({ url, expectedSelector }) => {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await takeScreenshot(page, 'before-search');

            await handleCookiePopup(page);

            const searchTerm = 'test product';
            const searchInput = await page.waitForSelector(expectedSelector, { visible: true, timeout: 10000 });
            if (searchInput) {
                await productSearcher.performSearch(page, searchInput, searchTerm);
                await takeScreenshot(page, 'after-search-input');

                // Wait for navigation to complete
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
                await takeScreenshot(page, 'after-search-navigation');

                // Check if the URL has changed, indicating a search was performed
                expect(page.url()).not.toBe(url);
            } else {
                throw new Error(`Search input not found for selector: ${expectedSelector}`);
            }
        }, 50000);

        test.each(testSites)('should extract products from $url', async ({ url, expectedSelector }) => {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await takeScreenshot(page, 'before-product-extraction');

            await handleCookiePopup(page);

            const searchTerm = 'laptop';
            const searchInput = await page.waitForSelector(expectedSelector, { visible: true, timeout: 10000 });
            if (searchInput) {
                await productSearcher.performSearch(page, searchInput, searchTerm);
                await takeScreenshot(page, 'after-search-for-extraction');

                // Wait for navigation to complete
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
                await takeScreenshot(page, 'after-navigation-for-extraction');

                const products = await productSearcher.searchProducts(page, searchTerm);
                await takeScreenshot(page, 'after-product-extraction');

                expect(products.length).toBeGreaterThan(0);
                products.forEach(product => {
                    expect(product).toHaveProperty('productName');
                    expect(product).toHaveProperty('price');
                    expect(product).toHaveProperty('url');
                });

                // Verify that the mock LLMService was called
                expect(mockLLM.generateContent).toHaveBeenCalled();
            } else {
                throw new Error(`Search input not found for selector: ${expectedSelector}`);
            }
        }, 60000);
    });
});