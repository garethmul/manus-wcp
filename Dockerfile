# Stage 1: Build the Readium CLI from source
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Clone the readium/cli source
RUN git clone --depth=1 https://github.com/readium/cli.git .

# Build the readium binary
RUN go build -o readium ./cmd/readium

# Stage 2: Minimal runtime image
FROM alpine:3.19

RUN apk add --no-cache ca-certificates socat

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /build/readium /app/readium
RUN chmod +x /app/readium

# Copy EPUB files
COPY epubs/ /epubs/

# Copy the start script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8080

CMD ["/app/start.sh"]
