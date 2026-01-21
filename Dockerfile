FROM node:18

# Set working directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy rest of the code
COPY . .

# Expose backend port
EXPOSE 3001

# Start server
CMD ["node", "server.js"]
