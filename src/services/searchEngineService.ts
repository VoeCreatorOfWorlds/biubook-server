import axios from 'axios';
import { parse } from 'url';
import { CartProduct } from '../types';
import { Logger } from 'winston';
import { GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_ENGINE_ID } from '../constants';

interface SearchResult {
    link: string;
}

async function searchAndScoreHostnames(cartProducts: CartProduct[], maxResultsPerSearch: number = 10, logger: Logger): Promise<string[]> {
    const hostnameScores = new Map<string, number>();

    for (const product of cartProducts) {
        try {
            const searchResults = await searchGoogle(product.productName, maxResultsPerSearch, logger);

            for (const result of searchResults) {
                const hostname = parse(result.link).hostname;
                if (hostname) {
                    hostnameScores.set(hostname, (hostnameScores.get(hostname) || 0) + 1);
                }
            }
        } catch (error) {
            logger.error(`Error searching for product "${product.productName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    return Array.from(hostnameScores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([hostname]) => hostname);
}

async function searchGoogle(query: string, maxResults: number, logger: Logger): Promise<SearchResult[]> {
    if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
        throw new Error('Google Search API key or Search Engine ID is missing');
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${maxResults}&cr=countryZA`;

    try {
        logger.debug(`Sending request to Google Search API: ${url.replace(GOOGLE_SEARCH_API_KEY, 'REDACTED')}`);
        const response = await axios.get(url, {
            validateStatus: (status) => status < 500, // Consider any status less than 500 as a resolved promise
        });

        if (response.status !== 200) {
            logger.error(`Google Search API error: Status ${response.status}, Data: ${JSON.stringify(response.data)}`);
            return []; // Return an empty array instead of throwing an error
        }

        if (!response.data.items || !Array.isArray(response.data.items)) {
            logger.warn(`Unexpected response structure from Google Search API: ${JSON.stringify(response.data)}`);
            return [];
        }

        return response.data.items.map((item: any) => ({ link: item.link }));
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            logger.error(`Google Search API error: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        } else {
            logger.error(`Unexpected error in searchGoogle: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return []; // Return an empty array instead of throwing an error
    }
}

export { searchAndScoreHostnames };