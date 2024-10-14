import * as cheerio from 'cheerio';
import { Logger } from 'winston';
import { AdvancedHTMLParser as iAdvancedHTMLParser } from '../types';

interface AnchorLink {
    innerText: string;
    href: string;
}

interface ParsedContent {
    bodyContent: string;
    potentialSearchInputs: string[];
    anchorLinks: AnchorLink[];
}

type LoggedFunction<T extends (...args: any[]) => any> = T;

class AdvancedHTMLParserImp implements iAdvancedHTMLParser {
    private logger: Logger;
    private $: cheerio.CheerioAPI = cheerio.load('');
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
                this.$ = cheerio.load(html);

                const bodyContent = this.getBodyContent();
                const potentialSearchInputs = this.findPotentialSearchInputs();
                console.log("potentialSearchInputs: ", potentialSearchInputs);
                const anchorLinks = this.findAnchorLinks(rootDomain);
                console.log("anchorLinks: ", anchorLinks);

                this.logger.debug('HTML parsing process completed');
                return { bodyContent, potentialSearchInputs, anchorLinks };
            } catch (error) {
                this.logger.error('Error during HTML parsing', { error });
                return { bodyContent: '', potentialSearchInputs: [], anchorLinks: [] };
            }
        }, 'parseHTML');

    private getBodyContent: LoggedFunction<() => string> =
        this.logExecutionTime((): string => {
            this.logger.debug('Extracting body content');
            if (!this.$) {
                this.logger.warn('Cheerio instance not initialized');
                return '';
            }

            const bodyClone = this.$('body').clone();
            bodyClone.find('script, style').remove();
            let content = bodyClone.html() || '';

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

    private findPotentialSearchInputs: LoggedFunction<() => string[]> =
        this.logExecutionTime((): string[] => {
            this.logger.debug('Finding potential search inputs');
            const potentialInputs: Set<string> = new Set();
            const searchRegex = /search|query|find|lookup|seek|q\b/i;

            if (!this.$) {
                this.logger.warn('Cheerio instance not initialized');
                return Array.from(potentialInputs);
            }

            try {
                this.$('input').each((_, element) => {
                    const $input = this.$(element);
                    let isSearchInput = false;

                    // Check input type
                    const type = $input.attr('type');
                    if (type === 'search' || type === 'text' || !type) {
                        isSearchInput = true;
                    }

                    // Check other attributes
                    if (!isSearchInput) {
                        const attrs = $input.attr();
                        if (attrs) {
                            Object.entries(attrs).forEach(([name, value]) => {
                                if (searchRegex.test(name) || (typeof value === 'string' && searchRegex.test(value))) {
                                    isSearchInput = true;
                                }
                            });
                        }
                    }

                    // Check for common search-related aria attributes
                    const ariaLabel = $input.attr('aria-label');
                    const ariaPlaceholder = $input.attr('aria-placeholder');
                    if (ariaLabel && searchRegex.test(ariaLabel)) isSearchInput = true;
                    if (ariaPlaceholder && searchRegex.test(ariaPlaceholder)) isSearchInput = true;

                    // Check for nearby labels
                    const id = $input.attr('id');
                    if (id) {
                        const associatedLabel = this.$(`label[for="${id}"]`);
                        if (associatedLabel.length && searchRegex.test(associatedLabel.text())) {
                            isSearchInput = true;
                        }
                    }

                    if (isSearchInput) {
                        // Add classes to the set of potential inputs
                        $input.attr('class')?.split(/\s+/).forEach((className) => potentialInputs.add(`.${className}`));

                        // If there's an id, add it as well
                        if (id) {
                            potentialInputs.add(`#${id}`);
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

    private findAnchorLinks: LoggedFunction<(rootDomain: string) => AnchorLink[]> =
        this.logExecutionTime((rootDomain: string): AnchorLink[] => {
            this.logger.debug('Finding anchor links');
            const anchorLinks: AnchorLink[] = [];

            if (!this.$) {
                this.logger.warn('Cheerio instance not initialized');
                return anchorLinks;
            }

            try {
                this.$('a').each((index, element) => {
                    const $anchor = this.$(element);
                    const href = $anchor.attr('href');
                    if (href && $anchor.find('img').length > 0) {
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
                            const innerText = $anchor.text().trim();

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