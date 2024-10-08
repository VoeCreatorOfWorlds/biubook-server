import { Page } from 'puppeteer';
import { Logger } from 'winston';
import { AdvancedHTMLParserImp, ParsedContent } from './services/advancedHTMLService';
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
    private readonly POPUP_MAX_CHAR_LENGTH = 5000; // Maximum character length for a cookie popup

    constructor(logger: Logger) {
        this.logger = logger;
        this.htmlParser = new AdvancedHTMLParserImp(logger);
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

    async handlePopup(page: Page): Promise<void> {
        const { isPopup, rejectButtonSelector } = await this.detectPopup(page);

        if (isPopup && rejectButtonSelector) {
            this.logger.info(`Attempting to close popup with selector: ${rejectButtonSelector}`);
            try {
                await page.click(rejectButtonSelector);
                // Use page.evaluate to create a delay
                await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
                this.logger.info('Popup closed successfully');
            } catch (error) {
                this.logger.error('Failed to close popup:', error);
            }
        }
    }

    private evaluatePopup: PopupEvaluationFunction = (POPUP_MAX_CHAR_LENGTH, bodyContent) => {
        const isElementVisible: IsElementVisibleFunction = (element) => {
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        const findRejectButton: FindRejectButtonFunction = (element) => {
            const buttons = element.querySelectorAll('button, a, input[type="button"]');
            for (const button of buttons) {
                const buttonText = button.textContent?.toLowerCase() || '';
                if (['reject', 'decline', 'no thanks', 'close', 'dismiss', 'accept', 'agree', 'got it', 'i understand'].some(text => buttonText.includes(text))) {
                    const id = button.id ? `#${button.id}` : '';
                    const classes = Array.from(button.classList).map(c => `.${c}`).join('');
                    const tag = button.tagName.toLowerCase();
                    return `${tag}${id}${classes}`;
                }
            }
            return null;
        };

        const possiblePopups = document.querySelectorAll('div[class*="popup"], div[class*="modal"], div[id*="cookie"], div[class*="cookie"], div[class*="consent"]');

        for (const popup of possiblePopups) {
            // Initial filter: check content length
            if (popup.innerHTML.length > POPUP_MAX_CHAR_LENGTH) {
                continue; // Skip this element if it's too large
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

export default PopupDetectorImp;