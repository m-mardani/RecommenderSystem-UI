# سیستم توصیه‌گر - رابط کاربری

رابط کاربری پیشرفته برای سیستم توصیه‌گر مبتنی بر هوش مصنوعی

## ویژگی‌ها

✨ **فناوری‌های مدرن**
- Next.js 16 با TypeScript
- TailwindCSS برای طراحی واکنش‌گرا
- Axios برای مدیریت درخواست‌های HTTP
- JWT Authentication با قابلیت تازه‌سازی خودکار توکن

🔐 **امنیت**
- احراز هویت با JWT (Access + Refresh Token)
- تازه‌سازی خودکار توکن منقضی شده
- محافظت از مسیرها
- کنترل دسترسی مبتنی بر نقش (ADMIN/USER)

🌐 **پشتیبانی کامل از فارسی**
- راست به چپ (RTL)
- فونت Vazirmatn
- ترجمه کامل فارسی
- تاریخ و زمان شمسی

📱 **صفحات کاربردی**
- ورود
- صفحه اطلاع‌رسانی ثبت‌نام غیرفعال
- داشبورد
- مدیریت مجموعه داده‌ها برای `ADMIN`
- آموزش مدل برای `ADMIN`
- پایش کارهای آموزشی برای `ADMIN`
- مشاهده مدل‌ها
- دریافت توصیه‌ها

## Handoff

- قرارداد endpointها و flow فعلی فرانت/بک‌اند در [docs/FRONTEND_HANDOFF.md](./docs/FRONTEND_HANDOFF.md) مستند شده است.
- برای توسعه‌ی featureهای upload multipart، model inference، و role split بین `USER` و `ADMIN` این سند را مبنا قرار دهید.
- inventory کامل API در [docs/API_INVENTORY.md](./docs/API_INVENTORY.md) قرار دارد.
- معماری فعلی فرانت در [docs/FRONTEND_ARCHITECTURE.md](./docs/FRONTEND_ARCHITECTURE.md) خلاصه شده است.
- ماتریس UI → API و roadmap modernization در [docs/UI_API_MATRIX.md](./docs/UI_API_MATRIX.md) نگهداری می‌شود.

## پیش‌نیازها

- Node.js 18 یا بالاتر
- npm یا yarn
- سرور FastAPI در حال اجرا

## نصب و راه‌اندازی

### 1. نصب وابستگی‌ها

```bash
cd frontend
npm install
```

### 2. تنظیم متغیرهای محیطی

فایل `.env.local` را ایجاد کنید:

```bash
cp .env.example .env.local
```

و آدرس API بک‌اند خود را تنظیم کنید:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
```

### 3. اجرای برنامه در حالت توسعه

```bash
npm run dev
```

برنامه در آدرس [http://localhost:3000](http://localhost:3000) در دسترس خواهد بود.

### 4. ساخت برای محیط تولید

```bash
npm run build
npm start
```

## ساختار پروژه

```
frontend/
├── app/                      # صفحات Next.js App Router
│   ├── login/               # صفحه ورود
│   ├── register/            # صفحه اطلاع‌رسانی ثبت‌نام غیرفعال
│   ├── dashboard/           # داشبورد
│   ├── datasets/            # مدیریت داده‌ها
│   ├── training/            # آموزش مدل
│   ├── jobs/                # پایش کارها
│   ├── models/              # مدل‌ها
│   ├── recommendations/     # توصیه‌ها
│   ├── layout.tsx           # Layout اصلی
│   └── page.tsx             # صفحه اصلی
├── components/              # کامپوننت‌های React
│   ├── auth/               # کامپوننت‌های احراز هویت
│   ├── common/             # کامپوننت‌های مشترک
│   └── ...                 # سایر کامپوننت‌ها
├── contexts/               # Context های React
│   └── AuthContext.tsx     # مدیریت احراز هویت
├── lib/                    # کتابخانه‌ها و توابع کمکی
│   ├── api/               # سرویس‌های API
│   │   ├── client.ts      # Axios client با interceptors
│   │   └── index.ts       # API endpoints
│   └── utils/             # توابع کمکی
│       └── translations.ts # ترجمه‌های فارسی
├── types/                  # تعریف TypeScript Types
│   └── index.ts           # تایپ‌های اصلی
├── public/                # فایل‌های استاتیک
├── .env.example           # نمونه متغیرهای محیطی
├── next.config.ts         # تنظیمات Next.js
├── tailwind.config.ts     # تنظیمات Tailwind
└── package.json           # وابستگی‌ها و اسکریپت‌ها
```

## ویژگی‌های کلیدی

### مدیریت احراز هویت

سیستم احراز هویت به صورت خودکار:
- توکن‌های منقضی شده را تازه می‌کند
- کاربر را در صورت نیاز به صفحه ورود هدایت می‌کند
- دسترسی به صفحات را بر اساس نقش کاربر کنترل می‌کند

### کامپوننت‌های مشترک

- **LoadingSpinner**: نمایش وضعیت بارگذاری
- **ErrorMessage**: نمایش پیام‌های خطا
- **ProtectedRoute**: محافظت از مسیرها
- **Navbar**: منوی ناوبری

### API Client

- Interceptor برای افزودن خودکار توکن به درخواست‌ها
- مدیریت خودکار تازه‌سازی توکن
- مدیریت خطاهای 401 Unauthorized

## API Endpoints مورد انتظار

بک‌اند باید endpoint های زیر را فراهم کند:

### احراز هویت
- `POST /api/v1/auth/login` - ورود کاربر
- `POST /api/v1/auth/logout` - خروج و revoke توکن
- `POST /api/v1/auth/refresh` - تازه‌سازی توکن
- `GET /api/v1/auth/me` - اطلاعات کاربر جاری
- `POST /api/v1/auth/register` - از دید UI غیرفعال و باید `403` برگرداند

### مدل‌های user-facing
- `GET /api/v1/models/available` - مدل‌های قابل استفاده برای `USER` و `ADMIN`
- fallback: `GET /api/v1/engine/models/me`

### مجموعه داده‌ها و آموزش
- `GET /api/v1/engine/datasets/db`
- `GET /api/v1/engine/datasets/{dataset_id}/preview`
- `GET /api/v1/engine/datasets/download?dataset_id=...`
- `POST /api/v1/engine/datasets/upload`
- `POST /api/v1/engine/datasets/upload/multipart/init`
- `GET /api/v1/engine/datasets/upload/multipart/presign`
- `POST /api/v1/engine/datasets/upload/multipart/complete`
- `POST /api/v1/engine/train`
- `POST /api/v1/engine/train/auto`

### مدیریت مدل
- `GET /api/v1/admin/models`
- fallback: `GET /api/v1/engine/models`
- `DELETE /api/v1/engine/models/{job_id}`

### توصیه‌ها
- `GET /api/v1/engine/jobs/{job_id}/recommend`

## توسعه

### اضافه کردن صفحه جدید

1. یک پوشه جدید در `app/` ایجاد کنید
2. فایل `page.tsx` را در آن پوشه بسازید
3. از `ProtectedRoute` برای محافظت از صفحه استفاده کنید
4. کامپوننت `Navbar` را اضافه کنید

### اضافه کردن ترجمه جدید

ترجمه‌های جدید را در `lib/utils/translations.ts` اضافه کنید.

### اضافه کردن API جدید

API های جدید را در `lib/api/index.ts` تعریف کنید.

## اسکریپت‌های موجود

- `npm run dev` - اجرای سرور توسعه
- `npm run build` - ساخت برای محیط تولید
- `npm start` - اجرای سرور تولید
- `npm run lint` - بررسی کد با ESLint

## مشکلات رایج

### خطای CORS

اگر با خطای CORS مواجه شدید، مطمئن شوید که بک‌اند FastAPI به درستی تنظیم شده است:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### توکن منقضی شده

سیستم به صورت خودکار توکن‌های منقضی شده را تازه می‌کند. اگر مشکلی وجود دارد، localStorage مرورگر را پاک کنید.

## لایسنس

این پروژه تحت لایسنس MIT منتشر شده است.
