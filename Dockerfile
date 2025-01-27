# Use a specific Node.js version for better reproducibility
FROM node:23.3.0-slim AS builder

# Install pnpm globally and necessary build tools
RUN npm install -g pnpm@9.15.1 
RUN apt-get update && \
    apt-get install -y git python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Python 3 as the default python
RUN ln -s /usr/bin/python3 /usr/bin/python

# Set the working directory
WORKDIR /app

# Copy only the files necessary for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY tsconfig.json ./
COPY ./src ./src
COPY ./characters ./characters

# Build the project
RUN pnpm build 

# Create a new stage for the final image
FROM node:23.3.0-slim

# Install pnpm globally
RUN npm install -g pnpm@9.15.1

WORKDIR /app

# Copy built artifacts and production dependencies from the builder stage
COPY --from=builder /app/package.json /app/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/src /app/src
COPY --from=builder /app/characters /app/characters
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/tsconfig.json /app/
COPY --from=builder /app/pnpm-lock.yaml /app/

EXPOSE 3000

# Set the command to run the application
CMD ["pnpm", "start", "--non-interactive"]