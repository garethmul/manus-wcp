# Readium Publication Server
# Uses a pre-built statically-linked Go binary with Alpine for SSL certificates
FROM alpine:3.19

# Install CA certificates for HTTPS requests (needed by readium for remote EPUBs)
RUN apk add --no-cache ca-certificates

# Create app directory
WORKDIR /app

# Copy the pre-built readium binary (statically linked, no Go runtime needed)
COPY server/readium /app/readium
RUN chmod +x /app/readium

# Copy EPUB files
COPY server/epubs/ /app/epubs/

# Expose the port Railway will provide via $PORT env var
EXPOSE 8080

# Start the publication server
# Railway sets $PORT automatically; we use a shell to expand the variable
CMD sh -c "/app/readium serve --address 0.0.0.0 --port ${PORT:-8080} --file-directory /app/epubs"
