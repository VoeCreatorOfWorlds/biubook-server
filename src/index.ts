const express = require('express');
const cors = require("cors")

import * as dotenv from 'dotenv';
import { loginHandler, signupHandler } from './auth';
import { authMiddleware } from './middleware';
import { checkExpenseHandler } from './expenseHandler';
import { retrieveCartHandler } from './getCartContents';
import { getCardByIdHandler, getCardsHandler } from './cardHandler';
import { kycStatusHandler } from './onboardingHandler';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json())
app.use(cors())

app.post('/login', loginHandler);
app.post('/signup', signupHandler)
app.post('/check-expense', authMiddleware, checkExpenseHandler);
app.post('/cart-contents', authMiddleware, retrieveCartHandler);
app.get('/cards', authMiddleware, getCardsHandler);
app.get('/cards/:id', authMiddleware, getCardByIdHandler);
app.get('/kyc-check', authMiddleware, kycStatusHandler)

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});