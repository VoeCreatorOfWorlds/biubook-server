const express = require('express');
const cors = require("cors")

import * as dotenv from 'dotenv';
import { loginHandler, signupHandler } from './auth';
import { authMiddleware } from './middleware';
import { retrieveCartHandler } from './getCartContents';
import { getCardByIdHandler, getCardsHandler } from './cardHandler';
import { kycStatusHandler } from './onboardingHandler';
import { checkExpenseHandler } from './eCommerceHandler';
import { mockCheckExpenseHandler } from './ecoommerceMockHandler';
import { mockRetrieveCartHandler } from './mockCartHandler';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.post('/login', loginHandler);
app.post('/signup', signupHandler);
app.post('/cart-contents', retrieveCartHandler);
app.get('/cards', authMiddleware, getCardsHandler);
app.get('/cards/:id', authMiddleware, getCardByIdHandler);

app.post('/search-products', checkExpenseHandler);
app.post('/mock-search-products', authMiddleware, mockCheckExpenseHandler);
app.post('/mock-cart-contents', authMiddleware, mockRetrieveCartHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});