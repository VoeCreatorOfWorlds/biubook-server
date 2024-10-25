import axios from 'axios';
import { CartProduct } from '../types';
import { Logger } from 'winston';
import { GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_ENGINE_ID } from '../constants';

interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

interface HostnameUrls {
    [productName: string]: string;
}

const EXCLUDED_DOMAINS = [
    'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com',
    'linkedin.com', 'pinterest.com', 'reddit.com', 'wikipedia.org',
    'quora.com', 'medium.com', 'blogspot.com', 'wordpress.com', 'pricecheck.co.za'
];

export class ProductSearchService {
    constructor(private logger: Logger) { }

    private async searchGoogle(query: string, maxResults: number = 10): Promise<SearchResult[]> {
        if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
            throw new Error('Google Search API key or Search Engine ID is missing');
        }

        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${maxResults}&cr=countryZA&gl=za`;

        try {
            this.logger.debug(`Searching Google for: ${query}`);
            const response = await axios.get(url);

            if (!response.data.items || !Array.isArray(response.data.items)) {
                this.logger.warn('No search results found for query:', query);
                return [];
            }

            return response.data.items.map((item: any) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet || ''
            }));
        } catch (error) {
            this.logger.error(`Google search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }

    private extractDomain(url: string): string {
        try {
            // Handle URLs without protocol
            if (!url.includes('://')) {
                url = 'http://' + url;
            }
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch (error) {
            this.logger.error(`Error extracting domain from URL ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return '';
        }
    }

    private isValidDomain(domain: string, sourceDomain: string): boolean {
        if (!domain) return false;
        if (domain === sourceDomain) return false;
        if (EXCLUDED_DOMAINS.some(excluded => domain.includes(excluded))) return false;
        return true;
    }

    private async searchProductOnDomain(product: CartProduct, domain: string): Promise<string | null> {
        const query = `site:${domain} ${product.productName} buy price`;
        const results = await this.searchGoogle(query, 3);

        for (const result of results) {
            const resultDomain = this.extractDomain(result.link);
            if (resultDomain === domain && this.isProductPage(result)) {
                return result.link;
            }
        }

        return null;
    }

    private isProductPage(result: SearchResult): boolean {
        const lowerTitle = result.title.toLowerCase();
        const lowerSnippet = (result.snippet || '').toLowerCase();
        const lowerUrl = result.link.toLowerCase();

        const indicators = [
            'price', 'buy', 'cart', 'product', 'shop', 'store',
            'r ', 'zar', '$', '£', '€', // Currency indicators
            'add to', 'purchase', 'order'
        ];

        return indicators.some(indicator =>
            lowerTitle.includes(indicator) ||
            lowerSnippet.includes(indicator) ||
            lowerUrl.includes(indicator)
        );
    }

    async searchAndTrackProductPages(
        cartProducts: CartProduct[],
        sourceURL: string
    ): Promise<Map<string, HostnameUrls>> {
        this.logger.info(`Starting product search for ${cartProducts.length} products`);
        const sourceDomain = this.extractDomain(sourceURL);
        this.logger.info(`Source domain: ${sourceDomain}`);

        // Step 1: Initial search to find potential domains
        const domainFrequency = new Map<string, number>();
        const domainProducts = new Map<string, Set<string>>();

        for (const product of cartProducts) {
            // Search with a broader query
            const query = `${product.productName} buy online price`;
            const results = await this.searchGoogle(query, 10);
            this.logger.debug(`Found ${results.length} initial results for ${product.productName}`);

            for (const result of results) {
                const domain = this.extractDomain(result.link);
                if (!this.isValidDomain(domain, sourceDomain)) continue;
                if (!this.isProductPage(result)) continue;

                // Track domain frequency
                domainFrequency.set(domain, (domainFrequency.get(domain) || 0) + 1);

                // Track which products were found on each domain
                if (!domainProducts.has(domain)) {
                    domainProducts.set(domain, new Set());
                }
                domainProducts.get(domain)!.add(product.productName);
            }
        }

        // Step 2: Filter domains that have potential for all products
        const potentialDomains = Array.from(domainFrequency.entries())
            .filter(([domain, freq]) => freq >= cartProducts.length * 0.5) // At least 50% hit rate
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([domain]) => domain);

        this.logger.info(`Found ${potentialDomains.length} potential domains to search`);

        // Step 3: Detailed search for each product on potential domains
        const finalResults = new Map<string, HostnameUrls>();

        for (const domain of potentialDomains) {
            const urlMap: HostnameUrls = {};
            let domainValid = true;

            for (const product of cartProducts) {
                const productUrl = await this.searchProductOnDomain(product, domain);
                if (!productUrl) {
                    domainValid = false;
                    break;
                }
                urlMap[product.productName] = productUrl;
            }

            if (domainValid) {
                finalResults.set(domain, urlMap);
                this.logger.info(`Successfully mapped all products for domain: ${domain}`);
            }
        }

        this.logger.info(`Final result: found ${finalResults.size} valid sites with all products`);
        return finalResults;
    }
}

export const createProductSearchService = (logger: Logger) => new ProductSearchService(logger);