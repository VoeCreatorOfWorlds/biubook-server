const express = require('express');
const cors = require("cors")

import * as dotenv from 'dotenv';
import { loginHandler, signupHandler } from './auth';
import { authMiddleware } from './middleware';
import { retrieveCartHandler } from './getCartContents';
import { checkExpenseHandler } from './eCommerceHandler';
import { mockRetrieveCartHandler } from './mockCartHandler';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.post('/login', loginHandler);
app.post('/signup', signupHandler);
app.post('/cart-contents', retrieveCartHandler);

app.post('/search-products', checkExpenseHandler);
app.post('/mock-cart-contents', authMiddleware, mockRetrieveCartHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});