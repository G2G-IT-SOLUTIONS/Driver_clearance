FROM node:22-alpine

# Chromium: Puppeteer uses it to turn the letter HTML into a PDF.
# The npm "puppeteer" package downloads its own Chrome, but that one is built for Debian/glibc and
# will not run on Alpine (musl). So we skip that download and install Alpine's own Chromium instead.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Font for Amharic (Ethiopic) text in the letters. Separate line so a missing package cannot break the build.
RUN apk add --no-cache font-noto-ethiopic || echo "WARNING: font-noto-ethiopic not available, Amharic text may not render"

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY src ./src

# schema.sql is read by "npm run db:init" (src/init.js looks for ../db/schema.sql)
COPY db ./db

# company signature + stamp (backend/assets/signature.png and stamp.png) added to every letter
COPY assets ./assets

EXPOSE "4001:3001"

CMD ["npm", "start"]