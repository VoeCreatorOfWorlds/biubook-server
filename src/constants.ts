import * as dotenv from 'dotenv';
dotenv.config();

const LLM_API_KEY = process.env.GOOGLE_API_KEY
const REDIS_URL = process.env.REDIS_URL
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
const LOGTAIL_SOURCE_TOKEN = process.env.LOGTAIL_SOURCE_TOKEN;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const MAX_RESULTS = 2;


export {
    LLM_API_KEY,
    REDIS_URL,
    GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_ENGINE_ID,
    MAX_RESULTS,
    LOGTAIL_SOURCE_TOKEN,
    NODE_ENV,
    LOG_LEVEL
}