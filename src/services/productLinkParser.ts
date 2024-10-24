interface ParsedLink {
    href: string;
    text: string;
    isVisible: boolean;
    isProduct: boolean;
    price?: string;
    imageUrl?: string;
}

interface ProductIndicators {
    inUrl: string[];
    inPath: string[];
    pricePatterns: RegExp[];
}

export class ProductLinkParser {
    private productIndicators: ProductIndicators = {
        inUrl: ['product', 'item', 'goods', 'detail', 'pd', 'p=', 'sku'],
        inPath: ['/p/', '/product/', '/item/', '/goods/', '/detail/'],
        pricePatterns: [
            /\$\s*\d+\.?\d*/,                    // $XX.XX
            /USD\s*\d+\.?\d*/,                   // USD XX.XX
            /\d+\.?\d*\s*USD/,                   // XX.XX USD
            /R\s*\d+\.?\d*/,                     // R XX.XX
            /\d+\.?\d*\s*ZAR/,                   // XX.XX ZAR
            /£\s*\d+\.?\d*/,                     // £XX.XX
            /€\s*\d+\.?\d*/,                     // €XX.XX
            /\d+\.?\d*\s*EUR/                    // XX.XX EUR
        ]
    };

    private getLinksFromContent(content: string, baseUrl: string): ParsedLink[] {
        const matches = Array.from(content.matchAll(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi));

        return matches
            .map(match => this.parseLink(match, baseUrl))
            .filter(link => link.isVisible && link.isProduct);
    }

    private parseLink(match: RegExpMatchArray, baseUrl: string): ParsedLink {
        const [fullMatch, href, innerContent] = match;
        const resolvedHref = this.resolveUrl(href, baseUrl);
        const { text, imageUrl } = this.parseInnerContent(innerContent);
        const price = this.extractPrice(innerContent);

        const isVisible = this.isVisibleLink(fullMatch, text, imageUrl);
        const isProduct = this.isProductLink(resolvedHref, innerContent);

        return {
            href: resolvedHref,
            text: text.trim(),
            isVisible,
            isProduct,
            price,
            imageUrl
        };
    }

    private parseInnerContent(content: string): { text: string; imageUrl?: string } {
        // Extract image if present
        const imgMatch = content.match(/<img[^>]*src=["']([^"']*)["'][^>]*>/i);
        const imageUrl = imgMatch ? imgMatch[1] : undefined;

        // Clean text content
        const text = this.stripTags(content);

        return { text, imageUrl };
    }

    private isVisibleLink(fullMatch: string, text: string, imageUrl?: string): boolean {
        // Consider a link visible if it has either text content or an image
        return (!!text.trim() || !!imageUrl) &&
            // Check for common hidden element patterns
            !fullMatch.includes('display: none') &&
            !fullMatch.includes('visibility: hidden') &&
            !fullMatch.includes('hidden=');
    }

    private isProductLink(href: string, content: string): boolean {
        const url = href.toLowerCase();
        const htmlContent = content.toLowerCase();

        // Check URL patterns
        const hasProductUrl = this.productIndicators.inUrl.some(indicator =>
            url.includes(indicator)
        );

        const hasProductPath = this.productIndicators.inPath.some(path =>
            url.includes(path)
        );

        // Check if there's an image and price
        const hasImage = /<img[^>]*>/i.test(content);
        const hasPrice = this.productIndicators.pricePatterns.some(pattern =>
            pattern.test(htmlContent)
        );

        // Scoring system
        let score = 0;
        if (hasProductUrl) score += 2;
        if (hasProductPath) score += 2;
        if (hasImage) score += 2;
        if (hasPrice) score += 3;

        // Consider it a product link if it scores high enough
        return score >= 4;
    }

    private extractPrice(content: string): string | undefined {
        for (const pattern of this.productIndicators.pricePatterns) {
            const match = content.match(pattern);
            if (match) {
                return match[0];
            }
        }
        return undefined;
    }

    private resolveUrl(url: string, baseUrl: string): string {
        try {
            return new URL(url, baseUrl).href;
        } catch {
            return url;
        }
    }

    private stripTags(html: string): string {
        return html.replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    public extractProductLinks(content: string, baseUrl: string): ParsedLink[] {
        return this.getLinksFromContent(content, baseUrl);
    }
}