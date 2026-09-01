# Project Overview

Project: RecommenderSystem-UI

Purpose: Persian RTL Next.js frontend for a FastAPI-based recommendation system. It supports JWT login, role-aware navigation, admin dataset upload/training/job monitoring, model inventory, and user/admin recommendations.

Current status: Frontend-only repository. Backend, database, and object storage live outside this repo.

Primary users:
- `ADMIN`: uploads datasets, analyzes mappings, starts training, monitors jobs, manages models, reads system logs.
- `USER`: views available models and requests recommendations.

Important production concern: large dataset upload uses direct multipart PUT to S3/MinIO. The browser must be able to read the storage response `ETag` header.
