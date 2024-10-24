import puppeteer, { Page, ElementHandle, Browser } from 'puppeteer';
import { createLogger, format, Logger, transports } from 'winston';

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

export class SiteNavigator {
    private currentPage: Page;
    private browser: Browser | null = null;
    private siteURL: string;
    private searchInput: ElementHandle | null = null;

    constructor(page: Page, siteURL: string) {
        this.currentPage = page;
        this.siteURL = this.formatURL(siteURL);
    }

    private formatURL(url: string): string {
        try {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            new URL(url); // Validate URL
            return url;
        } catch (error) {
            throw new Error(`Invalid URL provided: ${url}`);
        }
    }

    async initialize(): Promise<void> {
        try {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.currentPage = await this.browser.newPage();

            this.browser.on('targetcreated', async (target) => {
                if (target.type() === 'page') {
                    const popupPage = await target.page();
                    if (!popupPage) return;

                    logger.debug('Popup detected!');
                    await popupPage.waitForSelector('body');
                    logger.debug('Popup content:', await popupPage.content());
                    await popupPage.close();
                }
            });

            logger.debug(`Navigating to ${this.siteURL}`);
            await this.currentPage.goto(this.siteURL, {
                waitUntil: 'networkidle0',
                timeout: 15000
            });

            await this.dismissCookieBanner();
        } catch (error) {
            logger.error('Error during initialization:', error);
            throw error;
        }
    }

    async searchProduct(productName: string): Promise<void> {
        try {
            const searchInput = await this.getSearchInput();
            if (!searchInput) {
                throw new Error('No search input found.');
            }

            await searchInput.type(productName);
            await searchInput.press('Enter');

            await this.currentPage.waitForNavigation({
                waitUntil: 'networkidle0',
                timeout: 15000
            });
        } catch (error) {
            logger.error('Error during product search:', error);
            throw error;
        }
    }

    public getCurrentPage(): Page {
        return this.currentPage;
    }

    async getSearchInput(): Promise<ElementHandle | null> {
        if (this.searchInput) {
            return this.searchInput;
        }

        try {
            const searchRegex = /search|query|find|lookup|seek|q\b/i;

            const bestSelector = await this.currentPage.evaluate((searchRegexString) => {
                const searchRegex = new RegExp(searchRegexString);
                const inputs = document.querySelectorAll('input');
                let bestMatch = null;
                let bestScore = 0;

                inputs.forEach((input, index) => {
                    let score = 0;

                    const type = input.getAttribute('type');
                    if (type === 'search') score += 3;
                    else if (type === 'text' || !type) score += 2;

                    Array.from(input.attributes).forEach(attr => {
                        if (searchRegex.test(attr.name) || searchRegex.test(attr.value)) {
                            score += 2;
                        }
                    });

                    const ariaLabel = input.getAttribute('aria-label');
                    if (ariaLabel && searchRegex.test(ariaLabel)) score += 2;

                    const ariaPlaceholder = input.getAttribute('aria-placeholder');
                    if (ariaPlaceholder && searchRegex.test(ariaPlaceholder)) score += 1;

                    const id = input.getAttribute('id');
                    if (id) {
                        const label = document.querySelector(`label[for="${id}"]`);
                        if (label?.textContent && searchRegex.test(label.textContent)) score += 2;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = id ? `#${id}` : `input:nth-of-type(${index + 1})`;
                    }
                });

                return bestMatch;
            }, searchRegex.source);

            if (bestSelector) {
                this.searchInput = await this.currentPage.$(bestSelector);
                return this.searchInput;
            }

            return null;
        } catch (error) {
            logger.error('Error finding search input:', error);
            return null;
        }
    }

    async dismissCookieBanner(timeout: number = 500): Promise<boolean> {
        const potentialKeywords = ['cookie', 'accept', 'consent', 'privacy', 'agree', 'got it', 'understand'];

        try {
            const dismissResult = await Promise.race([
                this.currentPage.evaluate((keywords) => {
                    const elements = document.querySelectorAll('button, a, div, span, p');
                    for (const element of Array.from(elements)) {
                        const textContent = element.textContent?.toLowerCase() || '';
                        if (keywords.some(keyword => textContent.includes(keyword))) {
                            if (element instanceof HTMLElement && element.offsetParent !== null) {
                                element.click();
                                return true;
                            }
                        }
                    }
                    return false;
                }, potentialKeywords),
                new Promise<boolean>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), timeout)
                )
            ]);

            if (dismissResult) {
                logger.debug('Cookie banner dismissed!');
                await new Promise(resolve => setTimeout(resolve, 500));
                return true;
            }

            logger.debug('No cookie banner found or could not dismiss.');
            return false;
        } catch (error) {
            if (error instanceof Error && error.message === 'Timeout') {
                logger.debug('Dismiss cookie banner operation timed out.');
            } else {
                logger.error('Error while dismissing cookie banner:', error);
            }
            return false;
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}