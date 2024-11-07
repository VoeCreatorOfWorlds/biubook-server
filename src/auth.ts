import * as dotenv from 'dotenv';
let o = dotenv.config();

import { Request, Response } from 'express';
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
  const { email, password, contactNumber } = req.body as User;

  try {
    // Step 1: Create the user account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    const userId = authData.user?.id;

    if (!userId) {
      throw new Error('User ID not returned from signup process');
    }

    // Step 2: Add user details to the profile table
    const { error: profileError } = await supabase
      .from('profile')
      .insert({
        user_id: userId,
        contact_number: contactNumber
      });

    if (profileError) throw profileError;

    // Step 3: Create a session for the new user
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) throw sessionError;

    res.json({
      access_token: sessionData.session?.access_token,
      refresh_token: sessionData.session?.refresh_token,
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({ error: 'Signup failed', details: (error as Error).message });
  }
}