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

const EXCLUDED_DOMAINS = ['youtube.com', 'facebook.com', 'twitter.com', 'instagram.com'];

// Base phrases for out of stock - we'll do fuzzy matching against these
const OUT_OF_STOCK_BASE_PHRASES = [
    'out of stock',
    'sold out',
    'unavailable',
    'no stock',
    'not available',
    'back order',
    'pre order',
    'discontinued'
];

export class ProductSearchService {
    constructor(private logger: Logger) { }

    private async searchGoogle(query: string): Promise<SearchResult[]> {
        if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
            throw new Error('Missing API credentials');
        }

        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&cr=countryZA&gl=za`;

        try {
            const response = await axios.get(url);
            return response.data.items || [];
        } catch (error) {
            this.logger.error('Search error:', error);
            return [];
        }
    }

    private extractDomain(url: string): string {
        try {
            const domain = new URL(url).hostname;
            return domain.replace(/^www\./, '');
        } catch {
            try {
                const domain = new URL(`http://${url}`).hostname;
                return domain.replace(/^www\./, '');
            } catch {
                return '';
            }
        }
    }

    private isValidDomain(domain: string, sourceDomain: string): boolean {
        return domain !== '' &&
            domain !== sourceDomain &&
            !EXCLUDED_DOMAINS.includes(domain) &&
            (domain.endsWith('.co.za') || domain.endsWith('.com'));
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const track = Array(str2.length + 1).fill(null).map(() =>
            Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) track[0][i] = i;
        for (let j = 0; j <= str2.length; j++) track[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                track[j][i] = Math.min(
                    track[j][i - 1] + 1,
                    track[j - 1][i] + 1,
                    track[j - 1][i - 1] + indicator
                );
            }
        }

        return track[str2.length][str1.length];
    }

    private findClosestMatch(text: string, phrases: string[]): { phrase: string; distance: number } | null {
        let closestMatch = null;
        let minDistance = Infinity;

        // Convert text to lowercase and remove extra spaces
        const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();

        // Split the text into overlapping chunks of words
        const words = normalizedText.split(' ');
        const chunks: string[] = [];
        for (let i = 0; i < words.length; i++) {
            for (let j = i + 1; j <= Math.min(i + 5, words.length); j++) {
                chunks.push(words.slice(i, j).join(' '));
            }
        }

        for (const chunk of chunks) {
            for (const phrase of phrases) {
                const normalizedPhrase = phrase.toLowerCase();
                const distance = this.levenshteinDistance(chunk, normalizedPhrase);

                // Calculate relative distance based on phrase length
                const relativeDistance = distance / Math.max(chunk.length, normalizedPhrase.length);

                if (relativeDistance < minDistance) {
                    minDistance = relativeDistance;
                    closestMatch = { phrase, distance: relativeDistance };
                }
            }
        }

        return closestMatch;
    }

    private hasOutOfStockIndicators(result: SearchResult): boolean {
        const content = `${result.title} ${result.snippet}`;

        // Find closest match to any out of stock phrase
        const match = this.findClosestMatch(content, OUT_OF_STOCK_BASE_PHRASES);

        // Consider it a match if the relative distance is less than 0.3 (70% similar)
        if (match && match.distance < 0.3) {
            this.logger.debug(`Found out of stock indicator: "${match.phrase}" with distance ${match.distance}`);
            return true;
        }

        return false;
    }

    async searchAndTrackProductPages(
        cartProducts: CartProduct[],
        sourceURL: string
    ): Promise<Map<string, HostnameUrls>> {
        const sourceDomain = this.extractDomain(sourceURL);
        const results = new Map<string, HostnameUrls>();

        for (const product of cartProducts) {
            const query = `${product.productName} buy price site:.co.za OR site:.com -site:${sourceDomain}`;
            const searchResults = await this.searchGoogle(query);

            for (const result of searchResults) {
                const domain = this.extractDomain(result.link);

                if (!this.isValidDomain(domain, sourceDomain)) {
                    continue;
                }

                // Use fuzzy matching to detect out of stock indicators
                if (this.hasOutOfStockIndicators(result)) {
                    this.logger.debug(`Skipping out of stock result for ${product.productName} on ${domain}`);
                    continue;
                }

                if (!results.has(domain)) {
                    results.set(domain, {});
                }

                const urlMap = results.get(domain)!;
                urlMap[product.productName] = result.link;

                this.logger.info(`Found URL for ${product.productName} on ${domain}: ${result.link}`);
            }
        }

        // Only keep domains that have all products
        const finalResults = new Map<string, HostnameUrls>();
        results.forEach((urlMap, domain) => {
            if (Object.keys(urlMap).length === cartProducts.length) {
                finalResults.set(domain, urlMap);
                this.logger.info(`Added complete domain ${domain} with ${Object.keys(urlMap).length} products`);
                Object.entries(urlMap).forEach(([product, url]) => {
                    this.logger.info(`  ${product}: ${url}`);
                });
            }
        });

        return finalResults;
    }
}

export const createProductSearchService = (logger: Logger) => new ProductSearchService(logger);