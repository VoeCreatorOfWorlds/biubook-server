import * as dotenv from 'dotenv';
dotenv.config();

const LLM_API_KEY = process.env.GOOGLE_API_KEY
const REDIS_URL = process.env.REDIS_URL


export {LLM_API_KEY, REDIS_URL}