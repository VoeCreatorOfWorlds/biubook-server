# Use an official Node runtime as the parent image
FROM node:18-bullseye-slim

# Set the working directory in the container to /app
WORKDIR /app

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libgconf-2-4 \
    libnss3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libxkbcommon0 \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Set the Chrome executable path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Make port 3000 available to the world outside this container
EXPOSE 3000

RUN npm run build

# Define the command to run your app
CMD [ "node", "dist/index.js" ]