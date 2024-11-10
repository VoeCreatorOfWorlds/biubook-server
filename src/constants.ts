import * as dotenv from 'dotenv';
dotenv.config();

const loadEnv = () => {
    try {
        if (process.env.NODE_ENV !== 'production') {
            const dotenv = require('dotenv');
            dotenv.config();
        }
    } catch (error) {
        // If .env file doesn't exist, just continue using process.env
        console.log('No .env file found, using environment variables');
    }
};

loadEnv();

const LLM_API_KEY = process.env.GOOGLE_API_KEY
const REDIS_URL = process.env.REDIS_URL
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
const LOGTAIL_SOURCE_TOKEN = process.env.LOGTAIL_SOURCE_TOKEN;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const MAX_RESULTS = 2;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 80;


if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
    console.log(`${GOOGLE_SEARCH_API_KEY}:::${GOOGLE_SEARCH_ENGINE_ID}`)
    throw new Error('error missing API credentials');
}

if (!REDIS_URL) {
    throw new Error('error missing REDIS_URL');
}

if (!LLM_API_KEY) {
    throw new Error('error missing LLM_API_KEY');
}

if (!LOGTAIL_SOURCE_TOKEN) {
    throw new Error('error missing LOGTAIL_SOURCE_TOKEN');
}

if (!SUPABASE_KEY || !SUPABASE_URL) {
    throw new Error('error missing SUPABASE_KEY or SUPABASE_URL');
}

if (!JWT_SECRET) {
    throw new Error('error missing JWT_SECRET');
}

if (!PORT) {
    throw new Error('error missing PORT');
}


export {
    LLM_API_KEY,
    REDIS_URL,
    GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_ENGINE_ID,
    MAX_RESULTS,
    LOGTAIL_SOURCE_TOKEN,
    NODE_ENV,
    LOG_LEVEL,
    SUPABASE_KEY,
    SUPABASE_URL,
    JWT_SECRET,
    PORT
}