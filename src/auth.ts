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

// Function to handle document uploads
export async function uploadDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.sub; // Assuming the user ID is stored in the 'sub' field of the JWT
  const { is_business } = req.body;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    if (is_business) {
      const { 
        business_registration_certificate,
        bank_statement,
        identity_documents
      } = req.files as { 
        business_registration_certificate: Express.Multer.File[],
        bank_statement: Express.Multer.File[],
        identity_documents: Express.Multer.File[]
      };

      // Upload files to Supabase storage and get their paths
      const certPath = await uploadFile(business_registration_certificate[0], 'business_documents');
      const statementPath = await uploadFile(bank_statement[0], 'business_documents');
      const idPaths = await Promise.all(identity_documents.map(file => uploadFile(file, 'business_documents')));

      // Update the business_kyc table
      const { error } = await supabase
        .from('business_kyc')
        .update({
          business_registration_certificate: certPath,
          bank_statement_path: statementPath,
          identity_document_paths: idPaths
        })
        .eq('user_id', userId);

      if (error) throw error;
    } else {
      const { 
        identity_document,
        bank_statement
      } = req.files as { 
        identity_document: Express.Multer.File[],
        bank_statement: Express.Multer.File[]
      };

      // Upload files to Supabase storage and get their paths
      const idPath = await uploadFile(identity_document[0], 'user_documents');
      const statementPath = await uploadFile(bank_statement[0], 'user_documents');

      // Update the user_kyc table
      const { error } = await supabase
        .from('user_kyc')
        .update({
          identity_document_path: idPath,
          bank_statement_path: statementPath
        })
        .eq('user_id', userId);

      if (error) throw error;
    }

    res.status(200).json({ message: 'Documents uploaded successfully' });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(400).json({ error: 'Document upload failed', details: (error as Error).message });
  }
}

async function uploadFile(file: Express.Multer.File, bucket: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(`${Date.now()}_${file.originalname}`, file.buffer, {
      contentType: file.mimetype,
    });

  if (error) throw error;

  return data.path;
}