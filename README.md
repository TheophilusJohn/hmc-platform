# HMC Platform — Harvest Mission College

Full-stack college management system for Harvest Mission College, Greater Noida, U.P., India.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, React Router v6 |
| Backend | Node.js 20 + Express 5 |
| Database | PostgreSQL 16 + Prisma ORM |
| File Storage | MinIO (S3-compatible) |
| Realtime | Socket.io |
| Payments | Razorpay (domestic) + Wise (international) |
| Email | SendGrid |
| SMS | MSG91 (India) + Twilio (international) |
| Plagiarism | Copyleaks API |
| Reverse Proxy | Nginx |

---

## Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local development)
- A domain with SSL (for production)

---

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url> hmc-platform && cd hmc-platform

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your actual values

# 3. Start all services
docker compose up -d

# 4. Run database migrations and seed demo data
docker compose exec server npx prisma migrate deploy
docker compose exec server node prisma/seed.js

# 5. Open the app
open http://localhost
```

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Full Admin | admin@hmc.edu | Admin@123 |
| Teacher-Admin | dr.john@hmc.edu | Welcome@123 |
| Faculty | sarah.thomas@hmc.edu | Welcome@123 |
| Admissions | admissions@hmc.edu | Welcome@123 |
| Student | james.mensah@student.hmc.edu | Welcome@123 |

---

## Local Development

```bash
# Terminal 1 — Backend
cd server && npm install && npm run dev

# Terminal 2 — Frontend
cd client && npm install && npm run dev

# Terminal 3 — Infrastructure (DB, MinIO, Redis)
docker compose up db minio redis -d
```

---

## Environment Variables

See `.env.example` for the complete list. Key variables:

```
DATABASE_URL=postgresql://hmc:password@db:5432/hmc_db
JWT_SECRET=<64-char random string>
MINIO_ROOT_USER=hmc-admin
MINIO_ROOT_PASSWORD=<password>
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
SENDGRID_API_KEY=SG.xxx
MSG91_API_KEY=xxx
```

---

## First-Run Checklist

After first login as admin, complete the setup at **Settings → System Settings**:

1. ☐ College Info — name, address, logo
2. ☐ Communication — SendGrid API key, MSG91/Twilio credentials
3. ☐ Payment Gateways — Razorpay keys (test → live), Wise API
4. ☐ Bank Accounts — for receipt generation
5. ☐ Fee Library — create tuition and hostel fee types
6. ☐ Programmes — create all 5 programmes
7. ☐ First Batch — create a batch under each active programme
8. ☐ First Semester — create and activate for each batch
9. ☐ Subjects — add subjects and assign faculty
10. ☐ First Student — enroll via Admissions → New Applicant

The setup completion bar at the top of System Settings tracks your progress.

---

## Production SSL (Nginx + Let's Encrypt)

```nginx
# Add to nginx.conf server block:
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
```

Use certbot to obtain and auto-renew:
```bash
certbot --nginx -d yourdomain.com
```

---

## Backup

### Automated (cron)
```bash
# Add to crontab — daily backup at 2 AM
0 2 * * * docker compose exec -T db pg_dump -U hmc hmc_db | gzip > /backups/hmc_$(date +%Y%m%d).sql.gz
```

### Manual Database Backup
```bash
docker compose exec db pg_dump -U hmc hmc_db > backup.sql
```

### Restore
```bash
docker compose exec -T db psql -U hmc hmc_db < backup.sql
```

### MinIO Files Backup
```bash
# Use mc (MinIO client) to sync to remote
mc mirror minio/hmc-documents s3/hmc-backup
```

---

## Key Business Rules

1. **No refunds** — fee ledger entries are never deleted or reduced on withdrawal
2. **Enrollment never blocked** — fees only flag, never block academic access
3. **Faculty deactivation guard** — faculty with active subjects cannot be deactivated
4. **Audit log is immutable** — no UPDATE/DELETE ever on audit_logs table
5. **Exam session timeout suspended** — session timeout paused during active exam
6. **International carry-forwards** — always kept in original USD, no FX recalculation
7. **Conditional UI** — unconfigured features are completely absent from all portals
8. **Fee lock = overdue installment** — not just outstanding balance
9. **Self-referral prevention** — email + phone cross-checked on referral submission
10. **Hostel waiver revocation** — applies from next billing month only

---

## Project Structure

```
hmc-platform/
├── client/                 React + Vite frontend
│   └── src/
│       ├── pages/          5 portal page groups + public
│       ├── components/     Shared UI components + charts
│       ├── hooks/          useAuth, useApi, useNotifications
│       └── utils/          api, dates, currency, razorpay
├── server/                 Express API
│   └── src/
│       ├── routes/         All REST routes
│       ├── services/       Email, SMS, PDF, MinIO, Payments
│       ├── middleware/      Auth, RBAC, Audit, Error
│       └── utils/          CGPA calculator, cron jobs
├── prisma/
│   ├── schema.prisma       Full data model
│   └── seed.js             Demo data
├── docker-compose.yml
├── nginx.conf
└── .env.example
```

---

## Support

- Technical issues: Check logs with `docker compose logs server`
- Database issues: `docker compose exec server npx prisma studio`
- Storage issues: Access MinIO console at `http://localhost:9001`
