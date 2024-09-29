import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./types";
import { Claims } from "./types";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);


export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const tokenString = req.headers.authorization;

  if (!tokenString) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  const token = tokenString.replace('Bearer ', '');

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      throw error;
    }

    if (!user) {
      throw new Error('User not found');
    }

    req.user = {
      user_id: user.id,
      username: user.email || '',
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}