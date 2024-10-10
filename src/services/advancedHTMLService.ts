import { JSDOM } from 'jsdom';
import { Logger } from 'winston';
import { AdvancedHTMLParser as iAdvancedHTMLParser } from '../types';

interface AnchorLink {
    innerText: string;
    href: string;
}

interface ParsedContent {
    bodyContent: string;
    scripts: string[];
    potentialSearchInputs: string[];
    anchorLinks: AnchorLink[];
}

type LoggedFunction<T extends (...args: any[]) => any> = T;

class AdvancedHTMLParserImp implements iAdvancedHTMLParser {
    private logger: Logger;
    private dom: JSDOM | null = null;
    private rawBody: string = '';
    private cleanedBody: string = '';
    private scripts: string[] = [];

    constructor(logger: Logger) {
        this.logger = logger;
    }

    private logExecutionTime<T extends (...args: any[]) => any>(func: T, funcName: string): LoggedFunction<T> {
        return ((...args: Parameters<T>) => {
            const start = Date.now();
            this.logger.info(`Starting ${funcName} at ${start}`);
            const result = func.apply(this, args);
            const end = Date.now();
            this.logger.info(`Finished ${funcName} at ${end}, duration: ${end - start}ms`);
            return result;
        }) as LoggedFunction<T>;
    }

    public parseHTML: LoggedFunction<(html: string, rootDomain: string) => ParsedContent> =
        this.logExecutionTime((html: string, rootDomain: string): ParsedContent => {
            this.logger.debug('Starting HTML parsing process');
            try {
                this.dom = new JSDOM(html);
                const { document } = this.dom.window;

                if (!document.body) {
                    throw new Error('Document body is empty or null');
                }

                const bodyContent = this.getBodyContent(document);
                const scripts = this.extractScripts(document);
                const potentialSearchInputs = this.findPotentialSearchInputs(document);
                const anchorLinks = this.findAnchorLinks(document, rootDomain);

                this.logger.debug('HTML parsing process completed');
                return { bodyContent, scripts, potentialSearchInputs, anchorLinks };
            } catch (error) {
                this.logger.error('Error during HTML parsing', { error });
                return { bodyContent: '', scripts: [], potentialSearchInputs: [], anchorLinks: [] };
            }
        }, 'parseHTML');

    private getBodyContent: LoggedFunction<(document: Document) => string> =
        this.logExecutionTime((document: Document): string => {
            this.logger.debug('Extracting body content');
            const body = document.body;
            if (!body) {
                this.logger.warn('No body element found in the document');
                return '';
            }

            const bodyClone = body.cloneNode(true) as HTMLBodyElement;
            bodyClone.querySelectorAll('script, style').forEach(el => el.remove());
            let content = bodyClone.innerHTML;
            content = content.replace(/\s+/g, ' ').trim();

            this.logger.debug(`Extracted body content (first 200 chars): ${content.slice(0, 200)}...`);
            return content;
        }, 'getBodyContent');

    public getRawBody: LoggedFunction<() => string> =
        this.logExecutionTime((): string => {
            return this.rawBody;
        }, 'getRawBody');

    public getCleanedBody: LoggedFunction<() => string> =
        this.logExecutionTime((): string => {
            return this.cleanedBody;
        }, 'getCleanedBody');

    public getScripts: LoggedFunction<() => string[]> =
        this.logExecutionTime((): string[] => {
            return this.scripts;
        }, 'getScripts');

    private extractScripts: LoggedFunction<(document: Document) => string[]> =
        this.logExecutionTime((document: Document): string[] => {
            this.logger.debug('Extracting scripts');
            const scripts: string[] = [];
            try {
                document.querySelectorAll('script').forEach(script => {
                    if (script.textContent) {
                        scripts.push(script.textContent);
                    }
                });
            } catch (error) {
                this.logger.error('Error extracting scripts', { error });
            }
            return scripts;
        }, 'extractScripts');

    private findPotentialSearchInputs: LoggedFunction<(document: Document) => string[]> =
        this.logExecutionTime((document: Document): string[] => {
            this.logger.debug('Finding potential search inputs');
            const potentialInputs: Set<string> = new Set();
            const searchRegex = /search|query|find|lookup|seek|q\b/i;

            try {
                const inputElements = document.querySelectorAll('input');

                inputElements.forEach(input => {
                    const attributes = input.attributes;
                    let isSearchInput = false;

                    // Check input type
                    const type = input.getAttribute('type');
                    if (type === 'search' || type === 'text' || !type) {
                        isSearchInput = true;
                    }

                    // Check other attributes
                    if (!isSearchInput) {
                        for (let i = 0; i < attributes.length; i++) {
                            const attr = attributes[i];
                            if (searchRegex.test(attr.name) || searchRegex.test(attr.value)) {
                                isSearchInput = true;
                                break;
                            }
                        }
                    }

                    // Check for common search-related aria attributes
                    const ariaLabel = input.getAttribute('aria-label');
                    const ariaPlaceholder = input.getAttribute('aria-placeholder');
                    if (ariaLabel && searchRegex.test(ariaLabel)) isSearchInput = true;
                    if (ariaPlaceholder && searchRegex.test(ariaPlaceholder)) isSearchInput = true;

                    // Check for nearby labels
                    const id = input.id;
                    if (id) {
                        const associatedLabel = document.querySelector(`label[for="${id}"]`);
                        if (associatedLabel && searchRegex.test(associatedLabel.textContent || '')) {
                            isSearchInput = true;
                        }
                    }

                    if (isSearchInput) {
                        // Add classes to the set of potential inputs
                        input.classList.forEach(className => potentialInputs.add(`.${className}`));

                        // If there's an id, add it as well
                        if (input.id) {
                            potentialInputs.add(`#${input.id}`);
                        }
                    }
                });
            } catch (error) {
                this.logger.error('Error finding potential search inputs', { error });
            }

            const uniqueInputs = Array.from(potentialInputs);

            this.logger.debug(`Found ${uniqueInputs.length} potential search input selectors`);
            return uniqueInputs;
        }, 'findPotentialSearchInputs');

    private findAnchorLinks: LoggedFunction<(document: Document, rootDomain: string) => AnchorLink[]> =
        this.logExecutionTime((document: Document, rootDomain: string): AnchorLink[] => {
            this.logger.debug('Finding anchor links');
            const anchorLinks: AnchorLink[] = [];

            try {
                const anchorTags = document.body.querySelectorAll('a');
                this.logger.debug(`Found ${anchorTags.length} anchor tags`);

                anchorTags.forEach((anchor, index) => {
                    const href = anchor.getAttribute('href');
                    if (href && anchor.querySelector('img')) {
                        try {
                            // Normalize the URL
                            let fullUrl: string;
                            if (href.startsWith('http://') || href.startsWith('https://')) {
                                fullUrl = href;
                            } else if (href.startsWith('/')) {
                                fullUrl = `${rootDomain}${href}`;
                            } else {
                                fullUrl = `${rootDomain}/${href}`;
                            }

                            // Get the inner text, trimming any excess whitespace
                            const innerText = anchor.textContent?.trim() || '';

                            anchorLinks.push({
                                innerText: innerText,
                                href: fullUrl
                            });

                            this.logger.debug(`Found anchor link ${index + 1}: ${fullUrl}`);
                        } catch (urlError) {
                            this.logger.warn(`Error processing URL for anchor ${index + 1}: ${href}`, { urlError });
                        }
                    }
                });
            } catch (error) {
                this.logger.error('Error finding anchor links', { error });
            }

            this.logger.debug(`Found ${anchorLinks.length} anchor links`);
            return anchorLinks;
        }, 'findAnchorLinks');
}

export { AdvancedHTMLParserImp, AnchorLink, ParsedContent };