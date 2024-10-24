import axios from 'axios';
import { parse } from 'url';
import { CartProduct } from '../types';
import { Logger } from 'winston';
import { GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_ENGINE_ID } from '../constants';

interface SearchResult {
    link: string;
}

interface HostnameScore {
    hostname: string;
    normalizedHostname: string;
    score: number;
    appearances: number;
    totalProducts: number;
}

const BATCH_SIZE = 3; // Number of products to search concurrently
const SEARCH_DELAY = 200; // Delay between searches in ms to avoid rate limiting
const MIN_SCORE_THRESHOLD = 0.3; // Minimum score threshold for hostnames

async function searchAndScoreHostnames(
    cartProducts: CartProduct[],
    maxResultsPerSearch: number = 10,
    logger: Logger
): Promise<string[]> {
    logger.info(`Starting search for ${cartProducts.length} products`);

    const hostnameScores = new Map<string, HostnameScore>();
    const totalProducts = cartProducts.length;

    // Process products in batches to control concurrency
    for (let i = 0; i < cartProducts.length; i += BATCH_SIZE) {
        const batch = cartProducts.slice(i, i + BATCH_SIZE);

        // Search products in batch concurrently
        const searchPromises = batch.map(product =>
            searchWithDelay(product.productName, maxResultsPerSearch, logger, i * SEARCH_DELAY)
        );

        const batchResults = await Promise.allSettled(searchPromises);

        // Process results from the batch
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const searchResults = result.value;
                processSearchResults(
                    searchResults,
                    hostnameScores,
                    totalProducts,
                    maxResultsPerSearch,
                    logger
                );
            } else {
                logger.error(`Failed to search for product ${batch[index].productName}: ${result.reason}`);
            }
        });
    }

    // Calculate final scores and sort hostnames
    const scoredHostnames = calculateFinalScores(hostnameScores, totalProducts, logger);

    logger.info(`Found ${scoredHostnames.length} unique hostnames above threshold`);
    console.log("scoredHostnames: ", scoredHostnames);
    return scoredHostnames;
}

async function searchWithDelay(
    query: string,
    maxResults: number,
    logger: Logger,
    delay: number
): Promise<SearchResult[]> {
    await new Promise(resolve => setTimeout(resolve, delay));
    return searchGoogle(query, maxResults, logger);
}

async function searchGoogle(
    query: string,
    maxResults: number,
    logger: Logger
): Promise<SearchResult[]> {
    if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
        throw new Error('Google Search API key or Search Engine ID is missing');
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${maxResults}&cr=countryZA`;

    try {
        logger.debug(`Searching for: ${query}`);
        const response = await axios.get(url, {
            validateStatus: (status) => status < 500,
            timeout: 5000
        });

        if (response.status !== 200) {
            logger.error(`Google Search API error: Status ${response.status}`);
            return [];
        }

        if (!response.data.items || !Array.isArray(response.data.items)) {
            logger.warn('No search results found');
            return [];
        }

        return response.data.items.map((item: any) => ({ link: item.link }));
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            logger.error(`Google Search API error: Status ${error.response.status}`);
        } else {
            logger.error(`Search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return [];
    }
}

function normalizeHostname(hostname: string): string {
    // Remove www. and normalize to lowercase
    return hostname.replace(/^www\./, '').toLowerCase();
}

function processSearchResults(
    results: SearchResult[],
    hostnameScores: Map<string, HostnameScore>,
    totalProducts: number,
    maxResults: number,
    logger: Logger
): void {
    results.forEach((result, index) => {
        const parsedUrl = parse(result.link);
        const hostname = parsedUrl.hostname;

        if (!hostname) return;

        const normalizedHostname = normalizeHostname(hostname);
        const existingScore = hostnameScores.get(normalizedHostname);
        const positionScore = (maxResults - index) / maxResults; // Higher score for earlier positions

        if (existingScore) {
            existingScore.appearances += 1;
            existingScore.score += positionScore;
        } else {
            hostnameScores.set(normalizedHostname, {
                hostname,
                normalizedHostname,
                score: positionScore,
                appearances: 1,
                totalProducts
            });
        }
    });
}

function calculateFinalScores(
    hostnameScores: Map<string, HostnameScore>,
    totalProducts: number,
    logger: Logger
): string[] {
    return Array.from(hostnameScores.values())
        .map(score => ({
            hostname: score.hostname,
            finalScore: (score.score / totalProducts) * (score.appearances / totalProducts)
        }))
        .filter(({ finalScore }) => finalScore >= MIN_SCORE_THRESHOLD)
        .sort((a, b) => b.finalScore - a.finalScore)
        .map(({ hostname }) => hostname);
}

export { searchAndScoreHostnames };