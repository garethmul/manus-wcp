FROM debian:bookworm-slim

# Install ca-certificates and socat for health check proxy
RUN apt-get update && apt-get install -y ca-certificates socat && rm -rf /var/lib/apt/lists/*

# Copy the pre-built readium binary
COPY readium /usr/local/bin/readium
RUN chmod +x /usr/local/bin/readium

# Copy EPUB files
COPY epubs/ /epubs/

# Copy the startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Expose port
EXPOSE 8080

# Start via wrapper script
CMD ["/start.sh"]
