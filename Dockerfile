--- STAGE 1: BUILD (Install Dependencies) ---
Use an LTS version of Node.js for stability
FROM node:20-slim AS builder

Set the working directory inside the container
WORKDIR /app

Copy package.json and package-lock.json (if present) to install dependencies
We copy only these files first to take advantage of Docker's caching layers.
COPY package*.json ./

Install project dependencies
RUN npm install --omit=dev

--- STAGE 2: PRODUCTION (Copy Code and Run) ---
Start from a clean, lightweight image for the final runtime
FROM node:20-slim

Set environment variables for better logging and timezone management
ENV NODE_ENV production
ENV TZ=America/New_York

Create a non-root user and switch to it for security
RUN adduser --disabled-password --gecos "" appuser
USER appuser

Set the working directory
WORKDIR /app

Copy the installed dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

Copy the rest of the application code
COPY discord_monitor_bot.js ./

Command to run the application when the container starts
CMD ["node", "discord_monitor_bot.js"]