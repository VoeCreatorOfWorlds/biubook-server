const express = require('express');
const cors = require("cors")

import { loginHandler, signupHandler } from './auth';
import { authMiddleware } from './middleware';
import { retrieveCartHandler } from './getCartContents';
import { checkExpenseHandler } from './eCommerceHandler';
import { morganMiddleware } from './services/loggerService';
import { trackProductClickHandler } from './logClicksHandler';
import { Request, Response } from 'express';
import { PORT } from './constants';

const app = express();

app.use(express.json());
app.use(cors());
app.use(morganMiddleware);

app.post('/login', loginHandler);
app.post('/signup', signupHandler);
app.post('/cart-contents', authMiddleware, retrieveCartHandler);

app.post('/search-products', authMiddleware, checkExpenseHandler);

app.post('/track/product-clicks', authMiddleware, trackProductClickHandler)

// add a health status check handler
app.get('/health', (_req: Request, res: Response) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});