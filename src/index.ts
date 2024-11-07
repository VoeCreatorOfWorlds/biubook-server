const express = require('express');
const cors = require("cors")

import * as dotenv from 'dotenv';
import { loginHandler, signupHandler } from './auth';
import { authMiddleware } from './middleware';
import { retrieveCartHandler } from './getCartContents';
import { checkExpenseHandler } from './eCommerceHandler';
import { morganMiddleware } from './services/loggerService';
import { trackProductClickHandler } from './logClicksHandler';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(morganMiddleware);

app.post('/login', loginHandler);
app.post('/signup', signupHandler);
app.post('/cart-contents', authMiddleware, retrieveCartHandler);

app.post('/search-products', authMiddleware, checkExpenseHandler);

app.post('/track/product-clicks', authMiddleware, trackProductClickHandler)

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});