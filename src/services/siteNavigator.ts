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
                waitUntil: 'domcontentloaded',
                timeout: 2500
            });

            await this.dismissCookieBanner();
        } catch (error) {
            logger.error('Error during initialization:', error);
            throw error;
        }
    }

    public getCurrentPage(): Page {
        return this.currentPage;
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