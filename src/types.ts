import { JwtPayload } from 'jsonwebtoken';
import { Request } from 'express';
import { Page, ElementHandle } from 'puppeteer';
import { Logger } from 'winston';
import { Message } from '@anthropic-ai/sdk/resources';


export interface ExpenseCheck {
  body: string;
  chunks: string[];
}

export interface User {
  email: string;
  password: string;
  contactNumber: string;
}

export interface Claims extends JwtPayload {
  username: string;
  user_id: string;
}

export interface ExpenseLLMCheckCall {
  data: string;
  apiURL: string;
  cleanData: string;
}

export interface CartProduct {
  productName: string;
  price: number;
  quantity: number;
}

export interface GenerationResult {
  cartProducts: CartProduct[];
  rawResponse: string;
}

export interface Card {
  id: string;
  title: string,
  expirationDate: string;
  amount: number;
}

export interface CardsRequest {
  count?: number;
}

export type KycStep =
  | 'not_started'
  | 'business_kyc_start'
  | 'user_kyc_start'
  | 'business_kyc_pending'
  | 'user_kyc_pending'
  | 'business_kyc_resubmit'
  | 'user_kyc_resubmit'
  | 'verification_in_progress'
  | 'complete';

export interface OnboardingStatus {
  isComplete: boolean;
  currentStep: KycStep;
}

// Extend the Express Request type
export interface AuthenticatedRequest extends Request {
  user?: Claims;
}

export interface Product {
  productName: string;
  price: number;
  description?: string;
}

export interface CartProduct extends Product {
  quantity: number;
}

export interface AlternativeProduct extends Product {
  url: string;
  siteUrl: string;
}

export interface Cart {
  products: CartProduct[];
  getTotalPrice(): number;
}

export interface AlternativeCart {
  products: AlternativeProduct[];
  originalProducts: CartProduct[];
  getTotalPrice(): number;
  getPotentialSavings(): number;
}

export interface ExpenseCheckRequest {
  cartProducts: CartProduct[];
  hostname: string
  maxResults?: number;
}

export interface ProductSearchResult {
  siteUrl: string;
  products: AlternativeProduct[];
}

export interface ExpenseCheckResult {
  originalCart: Cart;
  alternativeCarts: AlternativeCart[] | MockCartAugmentedCart[];
}

export interface IProductSearcher {
  searchProducts(page: Page, searchTerm: string, maxResults?: number): Promise<any[]>;
}

export interface IBrowserAgent {
  initialize(): Promise<void>;
  searchProduct(productName: string, siteUrl: string, maxResults?: number): Promise<ProductSearchResult[]>;
  navigateToEcommerceSite(page: Page, url: string): Promise<void>;
  close(): Promise<void>;
}

export interface AnchorLink {
  href: string;
  innerText: string;
}

export interface ProductSearchItem {
  productName: string;
  price: number;
}

export interface ParsedContent {
  bodyContent: string;
  anchorLinks: AnchorLink[];
  potentialSearchInputs: string[];
}

export interface AIModelSchema {
  type: string;
  properties: {
    [key: string]: any;
  };
  required: string[];
}

export interface AIModelResult {
  products: ProductSearchItem[];
}

export interface MappedProductsResult {
  mappedProducts: Product[];
}

export interface AIModelHandler {
  generateStructuredContent(prompt: string, schema: AIModelSchema): Promise<any>;
}
interface AIModelHandlerConstructor {
  new(apiKey: string, logger: Logger): AIModelHandler;
}
type AnthropicTool = {
  name: string;
  description: string;
  input_schema: AIModelSchema;
};

type ExtractToolOutputFunction = (response: Message) => any | null;

export interface ProductSearcher {
  searchProducts(page: Page, searchTerm: string, maxResults?: number): Promise<Product[]>;
  findSearchInput(page: Page): Promise<ElementHandle<Element> | null>;
  performSearch(page: Page, searchInput: ElementHandle<Element>, searchTerm: string): Promise<void>;
  getStructuredDataFromAI(content: string, maxResults: number): Promise<ProductSearchItem[]>;
  identifyProductLinks(anchorLinks: AnchorLink[], productSearchItems: ProductSearchItem[], searchTerm: string): Promise<Product[]>;
}


export interface AdvancedHTMLParser {
  parseHTML(html: string, rootDomain: string): ParsedContent;
  getRawBody(): string;
  getCleanedBody(): string;
}

export interface AdvancedHTMLParserConstructor {
  new(logger: Logger): AdvancedHTMLParser;
}

export type GetBodyContentFunction = (document: Document) => string;
export type ExtractScriptsFunction = (document: Document) => string[];
export type FindPotentialSearchInputsFunction = (document: Document) => string[];
export type FindAnchorLinksFunction = (document: Document, rootDomain: string) => AnchorLink[];


// New interfaces and types for PopupDetector
export interface PopupDetectionResult {
  isPopup: boolean;
  rejectButtonSelector?: string;
  popupLength?: number;
}

export interface PopupDetector {
  detectPopup(page: Page): Promise<PopupDetectionResult>;
  handlePopupOrDialog(page: Page): Promise<void>;
}

export interface PopupDetectorConstructor {
  new(logger: Logger): PopupDetector;
}

export type IsElementVisibleFunction = (element: Element) => boolean;
export type FindRejectButtonFunction = (element: Element) => string | undefined;

export interface PopupEvaluationResult {
  isPopup: boolean;
  rejectButtonSelector?: string;
  popupLength?: number;
}

export type PopupEvaluationFunction = (
  POPUP_MAX_CHAR_LENGTH: number,
  bodyContent: string
) => PopupEvaluationResult;


// mocks

export interface MockCartAugmentedCart extends AlternativeCart {
  total: number;
}

