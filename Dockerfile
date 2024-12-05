# Use an official Node.js runtime as the base image
FROM node:22-slim

# Install necessary dependencies (glibc, gcc, make, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    gcc \
    g++ \
    make \
    pkg-config \
    libtool \
    autoconf \
    automake \
    libc6 \
    libc6-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# Set the working directory in the container
WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install the app's dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Expose the port the app will run on (you can modify this if needed)
EXPOSE 3000

# Set up pm2 to run your application in production mode
CMD ["pnpm", "start", "--non-interactive"]
