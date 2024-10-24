import { Page } from 'puppeteer';
import { Logger } from 'winston';

interface ParsedLink {
    href: string;
    text: string;
    isVisible: boolean;
}

interface ParsedHTML {
    title: string;
    bodyContent: string;
    innerText: string;
    links: ParsedLink[];
}

export class HTMLParser {
    private html: string = '';
    private bodyContent: string = '';
    private logger: Logger;
    private baseUrl: string = '';
    private page: Page;

    constructor(logger: Logger, page: Page) {
        this.logger = logger;
        this.page = page;
    }

    async parseHTML(p: Page): Promise<ParsedHTML> {
        this.logger.debug('Starting HTML parsing');
        this.page = p;

        try {
            this.baseUrl = this.page.url();
            this.logger.debug(`Parsing HTML from URL: ${this.baseUrl}`);

            // Get the full HTML content
            this.html = await this.page.content();

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

                    // Check if element is visible
                    try {
                        const style = window.getComputedStyle(element);
                        if (style.display === 'none' || style.visibility === 'hidden' ||
                            style.opacity === '0' || style.width === '0' || style.height === '0') {
                            return '';
                        }
                    } catch (error) {
                        console.warn('Error checking element style:', error);
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

                    // Handle block elements by adding spaces
                    if (getComputedStyle(element).display === 'block') {
                        text = '\n' + text + '\n';
                    }

                    return text.replace(/\s+/g, ' ').trim();
                };

                const isElementVisible = (element: HTMLElement): boolean => {
                    try {
                        const rect = element.getBoundingClientRect();
                        const style = window.getComputedStyle(element);

                        return !!(
                            rect.width &&
                            rect.height &&
                            style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            style.opacity !== '0'
                        );
                    } catch {
                        return false;
                    }
                };

                // Get all visible links
                const links = Array.from(document.getElementsByTagName('a')).map(a => {
                    const hasVisibleImage = Array.from(a.getElementsByTagName('img'))
                        .some(img => img.complete && img.naturalHeight !== 0);

                    return {
                        href: a.href,
                        text: a.textContent?.trim() || '',
                        isVisible: isElementVisible(a) || hasVisibleImage
                    };
                });

                // Get visible body content
                const bodyContent = document.body ? getVisibleText(document.body) : '';
                const innerText = document.body ? document.body.innerText : '';

                return {
                    title: document.title || '',
                    bodyContent,
                    links,
                    innerText
                };
            });

            this.bodyContent = parsedContent.bodyContent;
            this.logger.debug('HTML parsing completed successfully');

            return parsedContent;
        } catch (error) {
            this.logger.error('Error parsing HTML:', error);
            throw error;
        }
    }

    getLinks(filterVisible: boolean = true): ParsedLink[] {
        try {
            const links = this.getLinksFromContent(this.html, filterVisible);
            this.logger.debug(`Found ${links.length} links (filtered: ${filterVisible})`);
            return links;
        } catch (error) {
            this.logger.error('Error getting links:', error);
            return [];
        }
    }

    private getLinksFromContent(content: string, filterVisible: boolean): ParsedLink[] {
        const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        const matches = Array.from(content.matchAll(linkRegex));

        return matches
            .map(match => {
                try {
                    const href = this.resolveUrl(match[1]);
                    const text = this.stripTags(match[2]);
                    const containsImage = /<img[^>]*>/i.test(match[2]);
                    const isVisible = !!href && (!!text.trim() || containsImage);

                    return {
                        href,
                        text,
                        isVisible
                    };
                } catch (error) {
                    this.logger.warn('Error processing link:', error);
                    return null;
                }
            })
            .filter((link): link is ParsedLink =>
                link !== null && (!filterVisible || link.isVisible));
    }

    private resolveUrl(url: string): string {
        try {
            return new URL(url, this.baseUrl).href;
        } catch {
            return url;
        }
    }

    private stripTags(html: string): string {
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    getBodyContent(): string {
        return this.bodyContent;
    }
}