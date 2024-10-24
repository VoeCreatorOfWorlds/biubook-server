import { Page, Dialog, ElementHandle } from 'puppeteer';
import { Logger } from 'winston';
import { AdvancedHTMLParserImp, ParsedContent } from './services/advancedHTMLService';
import fs from 'fs';
import path from 'path';
import {
    PopupDetectionResult,
    PopupDetector as IPopupDetector,
    IsElementVisibleFunction,
    FindRejectButtonFunction,
    PopupEvaluationResult,
    PopupEvaluationFunction
} from './types';

class PopupDetectorImp implements IPopupDetector {
    private logger: Logger;
    private htmlParser: AdvancedHTMLParserImp;
    private readonly POPUP_MAX_CHAR_LENGTH = 5000;

    constructor(logger: Logger) {
        this.logger = logger;
        this.htmlParser = new AdvancedHTMLParserImp(logger);
    }

    async setupDialogHandling(page: Page): Promise<void> {
        page.on('dialog', async (dialog: Dialog) => {
            this.logger.info(`Dialog detected: ${dialog.message()}`);
            await this.handleDialog(dialog);
        });
    }

    private async handleDialog(dialog: Dialog): Promise<void> {
        try {
            await dialog.dismiss();
            this.logger.info('Dialog dismissed successfully');
        } catch (error) {
            this.logger.error(`Error handling dialog: ${error}`);
        }
    }

    async detectPopup(page: Page): Promise<PopupDetectionResult> {
        this.logger.debug('Starting popup detection');

        try {
            const pageContent = await page.content();
            const rootDomain = new URL(page.url()).hostname;
            const parsedContent: ParsedContent = this.htmlParser.parseHTML(pageContent, rootDomain);

            const popupInfo: PopupEvaluationResult = await page.evaluate(this.evaluatePopup, this.POPUP_MAX_CHAR_LENGTH, parsedContent.bodyContent);

            if (popupInfo.isPopup) {
                this.logger.info('Popup detected', {
                    rejectButtonSelector: popupInfo.rejectButtonSelector,
                    popupLength: popupInfo.popupLength
                });
                return {
                    isPopup: true,
                    rejectButtonSelector: popupInfo.rejectButtonSelector
                };
            } else {
                this.logger.info('No popup detected');
                return { isPopup: false };
            }
        } catch (error) {
            this.logger.error('Error during popup detection:', error);
            return { isPopup: false };
        }
    }

    async handlePopupOrDialog(page: Page): Promise<void> {
        this.logger.info('Starting unified popup/dialog handling');

        await this.setupDialogHandling(page);

        const { isPopup, rejectButtonSelector } = await this.detectPopup(page);

        if (isPopup && rejectButtonSelector) {
            this.logger.info(`Attempting to close popup with selector: ${rejectButtonSelector}`);
            try {
                await this.clickRejectButton(page, rejectButtonSelector);
                this.logger.info('Popup closed successfully');
            } catch (error) {
                this.logger.error('Failed to close popup:', error);
                await this.captureErrorScreenshot(page, 'popup_close_failed');
                await this.handleFailedClick(page, rejectButtonSelector);
                throw new PopupDetectorError('Failed to close popup', { selector: rejectButtonSelector });
            }
        } else if (isPopup) {
            this.logger.warn('Popup detected but no reject button found');
            await this.captureErrorScreenshot(page, 'popup_no_reject_button');
            const popupContent = await page.content();
            this.logger.debug("Popup content: ", popupContent);
            throw new PopupDetectorError('Popup detected but no reject button found', { popupContent });
        } else {
            this.logger.info('No popup detected');
        }
    }

    private async clickRejectButton(page: Page, selector: string): Promise<void> {
        try {
            await page.waitForSelector(selector, { visible: true, timeout: 5000 });
            const element = await page.$(selector);
            if (!element) {
                throw new PopupDetectorError('Element not found', { selector });
            }

            const isInViewport = await page.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            }, element);

            if (!isInViewport) {
                await element.scrollIntoView();
            }

            await element.click({ delay: 100 });
            await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
        } catch (error) {
            throw new PopupDetectorError('Failed to click reject button', {
                selector,
                originalError: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async handleFailedClick(page: Page, selector: string): Promise<void> {
        this.logger.info('Attempting alternative methods to close popup');

        try {
            await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (element) {
                    (element as HTMLElement).click();
                }
            }, selector);
            this.logger.info('Popup closed using JavaScript click');
        } catch (error) {
            this.logger.error('Failed to close popup using JavaScript click:', error);
            await this.captureErrorScreenshot(page, 'popup_js_click_failed');

            try {
                await page.keyboard.press('Escape');
                this.logger.info('Attempted to close popup by pressing Escape key');
            } catch (escapeError) {
                this.logger.error('Failed to close popup by pressing Escape key:', escapeError);
                await this.captureErrorScreenshot(page, 'popup_escape_failed');
                throw new PopupDetectorError('Failed to close popup using alternative methods', {
                    selector,
                    jsClickError: error instanceof Error ? error.message : String(error),
                    escapeError: escapeError instanceof Error ? escapeError.message : String(escapeError)
                });
            }
        }
    }

    private async captureErrorScreenshot(page: Page, errorType: string): Promise<void> {
        try {
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const fileName = `${errorType}_${timestamp}.png`;
            const dirPath = path.join(process.cwd(), 'prod-errors', 'popups');

            // Ensure the directory exists
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            const filePath = path.join(dirPath, fileName);
            await page.screenshot({ path: filePath, fullPage: true });
            this.logger.info(`Error screenshot saved: ${filePath}`);
        } catch (screenshotError) {
            this.logger.error('Failed to capture error screenshot:', screenshotError);
        }
    }

    private evaluatePopup: PopupEvaluationFunction = (POPUP_MAX_CHAR_LENGTH, bodyContent) => {
        const isElementVisible: IsElementVisibleFunction = (element) => {
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        const findRejectButton: FindRejectButtonFunction = (element) => {
            const buttons = element.querySelectorAll('button, a, input[type="button"]');
            for (const button of Array.from(buttons)) {
                const buttonText = button.textContent?.toLowerCase() || '';
                if (['reject', 'decline', 'no thanks', 'close', 'dismiss', 'accept', 'agree', 'got it', 'i understand'].some(text => buttonText.includes(text))) {
                    const id = button.id ? `#${button.id}` : '';
                    const classes = Array.from(button.classList).map(c => `.${c}`).join('');
                    const tag = button.tagName.toLowerCase();
                    return `${tag}${id}${classes}`;
                }
            }
            return undefined;
        };

        const possiblePopups = document.querySelectorAll('div[class*="popup"], div[class*="modal"], div[id*="cookie"], div[class*="cookie"], div[class*="consent"]');

        for (const popup of Array.from(possiblePopups)) {
            if (popup.innerHTML.length > POPUP_MAX_CHAR_LENGTH) {
                continue;
            }

            if (isElementVisible(popup)) {
                const rejectButtonSelector = findRejectButton(popup);
                if (rejectButtonSelector) {
                    return {
                        isPopup: true,
                        rejectButtonSelector,
                        popupLength: popup.innerHTML.length
                    };
                }
            }
        }

        return { isPopup: false };
    };
}

export class PopupDetectorError extends Error {
    constructor(message: string, public readonly popupInfo?: any) {
        super(message);
        this.name = 'PopupDetectorError';

        // This line is necessary for proper prototype chain setup in TypeScript
        Object.setPrototypeOf(this, PopupDetectorError.prototype);

        if (popupInfo) {
            this.popupInfo = popupInfo;
        }
    }
}

export default PopupDetectorImp;