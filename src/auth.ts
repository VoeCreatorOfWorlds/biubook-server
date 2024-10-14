import * as dotenv from 'dotenv';
let o = dotenv.config();

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { Claims, User } from './types';
console.log("Oh oho: ", o)

const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

// Validate required environment variables
if (!jwtSecret || !supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Extend the Express Request type
export interface AuthenticatedRequest extends Request {
  user?: Claims;
}

export async function loginHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log("running here")
  const { email, password } = req.body as User;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("data: ", data)

    if (error) throw error;

    res.json({
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    });
  } catch (error) {
    console.log(error)
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

export async function signupHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  console.log("req", req)
  console.log("body: ", req.body)
  const {
    email,
    password,
    contactNumber,
    is_business,
    businessName,
    businessAddress,
    businessType,
    businessRegistrationNumber,
    businessRegistrationDate
  } = req.body as User & {
    is_business: boolean;
    businessName?: string;
    businessAddress?: string;
    businessType?: string;
    businessRegistrationNumber?: string;
    businessRegistrationDate?: string;
  };

  try {
    // Step 1: Create the user account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.log("auth error log")
      throw authError;
    }

    const userId = authData.user?.id;

    if (!userId) {
      throw new Error('User ID not returned from signup process');
    }

    // Step 2: Add user details to the profile table
    const { error: profileError } = await supabase
      .from('profile')
      .insert({
        user_id: userId,
        contact_number: contactNumber,
        is_business: is_business
      });

    if (profileError) throw profileError;

    // Step 3: If it's a business account, add business details
    if (is_business) {
      const { error: businessError } = await supabase
        .from('business_kyc')
        .insert({
          user_id: userId,
          kyc_status: 'pending',
          business_name: businessName,
          business_address: businessAddress,
          business_type: businessType,
          business_registration_number: businessRegistrationNumber,
          business_registration_date: businessRegistrationDate,
          business_registration_certificate: '', // This will be updated later
          bank_statement_path: '', // This will be updated later
          identity_document_paths: [], // This will be updated later
        });

      if (businessError) throw businessError;
    } else {
      // If it's not a business account, create a user_kyc entry
      const { error: userKycError } = await supabase
        .from('user_kyc')
        .insert({
          user_id: userId,
          kyc_status: 'pending',
          identity_document_path: '', // This will be updated later
          bank_statement_path: '', // This will be updated later
        });

      if (userKycError) throw userKycError;
    }

    // Step 4: Create a buybook entry for the user
    const { error: buybookError } = await supabase
      .from('buybook')
      .insert({
        user_id: userId,
        verified: false,
      });

    if (buybookError) throw buybookError;

    // Step 5: Create a session for the new user
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) throw sessionError;

    // Step 6: Return the tokens
    res.status(201).json({
      message: 'Signup successful',
      access_token: sessionData.session?.access_token,
      refresh_token: sessionData.session?.refresh_token,
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({ error: 'Signup failed', details: (error as Error).message });
  }
}