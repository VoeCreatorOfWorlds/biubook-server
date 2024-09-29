import { JwtPayload } from 'jsonwebtoken';
import { Request } from 'express';

export interface ExpenseCheckRequest {
  body: string;
}

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
