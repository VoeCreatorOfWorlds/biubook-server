import { Page } from 'puppeteer';
import { Logger } from 'winston';
import { AppLogger as logger } from './loggerService';

interface ParsedHTML {
    innerText: string;
}

export class HTMLParser {
    private logger: Logger;
    private page: Page;

    constructor(logger: Logger, page: Page) {
        this.logger = logger.child({ service: 'HTMLParser' });
        this.page = page;
    }

    async parseHTML(p: Page): Promise<ParsedHTML> {
        this.logger.debug('Starting HTML parsing');
        this.page = p;

        try {
            // Extract content using page evaluation
            const parsedContent = await this.page.evaluate(() => {
                const getVisibleText = (node: Node): string => {
                    // Handle text nodes
                    if (node.nodeType === Node.TEXT_NODE) {
                        return node.textContent?.trim() || '';
                    }

                    // Skip non-element nodes
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        return '';
                    }

                    const element = node as HTMLElement;

                    // Skip hidden elements
                    const style = window.getComputedStyle(element);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return '';
                    }

                    // Skip script and style elements
                    if (element.tagName.toLowerCase() === 'script' ||
                        element.tagName.toLowerCase() === 'style') {
                        return '';
                    }

                    // Recursively process child nodes
                    let text = '';
                    for (const child of Array.from(element.childNodes)) {
                        text += getVisibleText(child);
                    }

                    // Add spacing for block elements
                    if (style.display === 'block') {
                        text = '\n' + text + '\n';
                    }

                    return text;
                };

                return {
                    innerText: getVisibleText(document.body).replace(/\s+/g, ' ').trim()
                };
            });

            this.logger.info('HTML parsing completed successfully');
            return parsedContent;

        } catch (error) {
            this.logger.error('Error parsing HTML:', error);
            throw error;
        }
    }
}