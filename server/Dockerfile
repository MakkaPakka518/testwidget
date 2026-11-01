FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/home/social-browser

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npx playwright install --with-deps --only-shell chromium \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

COPY server.mjs x-parser.mjs ./
RUN groupadd --system social-browser \
    && useradd --system --gid social-browser --home-dir /home/social-browser --create-home social-browser \
    && chown -R social-browser:social-browser /app /home/social-browser /ms-playwright

USER social-browser
EXPOSE 3217

CMD ["node", "server.mjs"]
