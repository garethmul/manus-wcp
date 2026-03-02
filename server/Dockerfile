FROM debian:bookworm-slim

# Install ca-certificates for HTTPS
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the pre-built readium binary
COPY readium /usr/local/bin/readium
RUN chmod +x /usr/local/bin/readium

# Copy EPUB files
COPY epubs/ /epubs/

# Expose port
EXPOSE 8080

# Start the publication server
CMD ["readium", "serve", "--address", "0.0.0.0", "--port", "8080", "--file-directory", "/epubs"]
