# راهنمای استقرار (Deployment)

این راهنما نحوه استقرار سیستم توصیه‌گر را در محیط‌های مختلف توضیح می‌دهد.

## استقرار در Vercel (توصیه شده برای Next.js)

### مرحله ۱: آماده‌سازی

1. اکانت [Vercel](https://vercel.com) ایجاد کنید
2. مخزن GitHub خود را به Vercel متصل کنید

### مرحله ۲: تنظیمات پروژه

1. پروژه جدید در Vercel ایجاد کنید
2. مخزن GitHub را انتخاب کنید
3. تنظیمات زیر را انجام دهید:

**Framework Preset:** Next.js
**Root Directory:** `frontend`
**Build Command:** `npm run build`
**Output Directory:** `.next`

### مرحله ۳: متغیرهای محیطی

متغیر محیطی زیر را اضافه کنید:

```
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
```

### مرحله ۴: استقرار

روی "Deploy" کلیک کنید. Vercel به صورت خودکار پروژه را می‌سازد و مستقر می‌کند.

## استقرار در Netlify

### مرحله ۱: آماده‌سازی

1. اکانت [Netlify](https://www.netlify.com) ایجاد کنید
2. مخزن GitHub را متصل کنید

### مرحله ۲: تنظیمات Build

```
Build command: cd frontend && npm install && npm run build
Publish directory: frontend/.next
```

### مرحله ۳: متغیرهای محیطی

```
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
```

### مرحله ۴: استقرار

استقرار خودکار با هر push به branch اصلی انجام می‌شود.

## استقرار با Docker

### ایجاد Dockerfile

فایل `Dockerfile` در پوشه `frontend`:

```dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### تنظیم next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

### ساخت و اجرای Docker

```bash
# Build
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 -t recommender-ui .

# Run
docker run -p 3000:3000 recommender-ui
```

## استقرار در VPS (Ubuntu/Debian)

### مرحله ۱: نصب Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### مرحله ۲: نصب PM2

```bash
sudo npm install -g pm2
```

### مرحله ۳: Clone و Build

```bash
git clone https://github.com/your-username/RecommenderSystem-UI.git
cd RecommenderSystem-UI/frontend
npm ci
```

ایجاد `.env.local`:

```bash
cp .env.production.example .env.local
nano .env.local
```

Build:

```bash
npm run build
```

### مرحله ۴: اجرا با PM2

```bash
pm2 start npm --name "recommender-ui" -- start
pm2 save
pm2 startup
```

برای اجرای مستقیم خروجی standalone نیز می‌توانید بعد از build از این دستور استفاده کنید:

```bash
HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js
```

### مرحله ۵: تنظیم Nginx

نمونه کامل‌تر برای VPS در فایل `deploy/nginx/recommender-ui.vps.conf` قرار دارد. این نمونه سه upstream جدا دارد:

- `app.example.com` برای Next.js روی پورت `3000`
- `api.example.com` برای FastAPI روی پورت `8000`
- `storage.example.com` برای MinIO/S3 روی پورت `9000`

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

فعال‌سازی:

```bash
sudo ln -s /etc/nginx/sites-available/recommender-ui /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### مرحله ۶: SSL با Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## استقرار Backend FastAPI

### با Docker

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### با Gunicorn

```bash
pip install gunicorn uvicorn[standard]
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
```

## آپلود فایل‌های حجیم با MinIO/S3

آپلود فایل در UI از flow چندبخشی استفاده می‌کند:

1. فرانت از FastAPI درخواست `multipart/init` و `multipart/presign` می‌گیرد.
2. هر chunk مستقیم با `PUT` به URL برگشتی از MinIO/S3 ارسال می‌شود.
3. فرانت باید header پاسخ `ETag` را بخواند و در `multipart/complete` به backend بفرستد.

اگر در UI خطای `Missing ETag for part ...` دیدید، معمولاً یکی از این تنظیمات ناقص است:

- bucket یا endpoint ذخیره‌سازی `ETag` را در CORS expose نکرده است.
- دامنه فرانت در `AllowedOrigins` ذخیره‌سازی نیست.
- Nginx یا proxy جلوی storage header `ETag` را عبور نمی‌دهد.

نمونه CORS برای MinIO/S3 در `deploy/minio/cors.json` قرار دارد:

```json
[
  {
    "AllowedOrigins": ["https://app.example.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

روی MinIO می‌توانید بعد از جایگزینی دامنه‌ها، CORS bucket را با `mc` اعمال کنید:

```bash
mc alias set local https://storage.example.com MINIO_ACCESS_KEY MINIO_SECRET_KEY
mc cors set local/rs-datasets deploy/minio/cors.json
mc cors get local/rs-datasets
```

FastAPI باید با storage نوع S3/MinIO بالا بیاید. اگر backend خطای `Multipart upload requires STORAGE_KIND=s3` برگرداند، یعنی تنظیم storage هنوز برای multipart production آماده نیست.

## Docker Compose (Full Stack)

فایل `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/recommender
    depends_on:
      - db
    networks:
      - app-network

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1
    ports:
      - "3000:3000"
    depends_on:
      - backend
    networks:
      - app-network

  db:
    image: postgres:14
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: recommender
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  postgres_data:
```

اجرا:

```bash
docker-compose up -d
```

## نکات امنیتی برای استقرار

### ۱. متغیرهای محیطی

- هرگز متغیرهای محیطی را در کد commit نکنید
- از secret management استفاده کنید
- متغیرها را در platform deployment تنظیم کنید

### ۲. HTTPS

- همیشه از HTTPS استفاده کنید
- از Let's Encrypt برای گواهی رایگان استفاده کنید
- HTTP را به HTTPS redirect کنید

### ۳. CORS

Backend را برای دامنه production تنظیم کنید:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### ۴. Rate Limiting

از rate limiting برای جلوگیری از abuse استفاده کنید:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
```

## Monitoring و Logging

### Frontend (Vercel Analytics)

```typescript
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### Backend (Sentry)

```python
import sentry_sdk

sentry_sdk.init(
    dsn="your-sentry-dsn",
    traces_sample_rate=1.0,
)
```

## CI/CD با GitHub Actions

فایل `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      
      - name: Build
        run: |
          cd frontend
          npm run build
        env:
          NEXT_PUBLIC_API_URL: ${{ secrets.API_URL }}
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

## بروزرسانی

### Frontend

```bash
cd frontend
git pull origin main
npm install
npm run build
pm2 restart recommender-ui
```

### با Docker

```bash
git pull origin main
docker-compose down
docker-compose up -d --build
```

## پشتیبانی

برای کمک بیشتر در استقرار، لطفاً Issue در GitHub ایجاد کنید.
