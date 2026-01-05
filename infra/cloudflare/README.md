# AddressKit G-NAF Mirror Infrastructure

This directory contains the infrastructure for the AddressKit G-NAF mirror at `dl.addresskit.com.au`.

## Overview

The G-NAF mirror provides faster and more reliable downloads of the Geocoded National Address File (G-NAF) data. Instead of downloading directly from data.gov.au, AddressKit uses a CDN-powered mirror that:

- **Faster downloads**: Served via Cloudflare's global CDN
- **Automatic retries**: Built-in retry logic at the application level
- **Resume support**: Partial downloads can be resumed
- **Reliability**: Falls back to data.gov.au if mirror is unavailable

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AddressKit G-NAF Mirror                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│   │   data.gov.au    │    │  Sync Script     │    │ DigitalOcean     │      │
│   │   (G-NAF Source) │───▶│  (GitHub Action) │───▶│ Spaces           │      │
│   └──────────────────┘    └──────────────────┘    └────────┬─────────┘      │
│                                                             │                │
│                                                             ▼                │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│   │   AddressKit     │───▶│  Cloudflare      │───▶│  dl.addresskit   │      │
│   │   Loader CLI     │    │  Worker          │    │  .com.au         │      │
│   └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Sync Script (`gnaf-sync/`)

A Node.js script that syncs G-NAF data from data.gov.au to DigitalOcean Spaces.

**Features:**
- Streams large files directly to S3 (no memory issues with 1.7GB files)
- Idempotent - only uploads new/changed files
- Generates mirror configuration file
- Supports dry-run mode for testing
- Can run locally, on a server, or via GitHub Actions

**Usage:**
```bash
cd infra/cloudflare/gnaf-sync
pnpm install
pnpm sync           # Full sync
pnpm sync:dry-run   # Preview what would be synced
pnpm check          # Check for updates only
```

**Environment Variables:**
```bash
DO_SPACES_KEY=your-access-key
DO_SPACES_SECRET=your-secret-key
DO_SPACES_ENDPOINT=syd1.digitaloceanspaces.com
DO_SPACES_BUCKET=addresskit-gnaf
MIRROR_BASE_URL=https://dl.addresskit.com.au
```

### 2. Serve Worker (`gnaf-serve/`)

A Cloudflare Worker that serves the mirrored content.

**Features:**
- Serves package configuration with caching
- Redirects to DigitalOcean Spaces for large files
- Provides convenience URLs (`/gnaf-latest`)
- CORS support for browser clients
- Health check endpoint

**Endpoints:**
| Path | Description |
|------|-------------|
| `/` | Mirror status and info |
| `/package_show.conf.json` | Mirror configuration (for AddressKit) |
| `/gnaf-latest` | Redirect to latest G-NAF ZIP (GDA94) |
| `/gnaf-latest-gda2020` | Redirect to latest G-NAF ZIP (GDA2020) |
| `/gnaf/*` | Access mirrored files |
| `/health` | Health check endpoint |

**Deployment:**
```bash
cd infra/cloudflare/gnaf-serve
pnpm install
wrangler secret put DO_SPACES_KEY
wrangler secret put DO_SPACES_SECRET
pnpm deploy
```

### 3. GitHub Actions Workflow

A workflow that automatically syncs G-NAF data monthly.

**To enable:**
1. Copy `.github-workflow-gnaf-sync.yml` to `.github/workflows/gnaf-sync.yml`
2. Add repository secrets:
   - `DO_SPACES_KEY`
   - `DO_SPACES_SECRET`
   - `DO_SPACES_ENDPOINT`
   - `DO_SPACES_BUCKET`

The workflow runs on the 18th of each month (G-NAF is released quarterly, mid-month).

## DigitalOcean Spaces Setup

1. Create a Space in the Sydney region (syd1) for lowest latency to Australian users
2. Set the Space to allow public read access for the files
3. Create an access key and secret
4. Configure CORS if needed for direct browser access

**Recommended CORS Configuration:**
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 86400
    }
  ]
}
```

## CLI Integration

The AddressKit CLI automatically uses the mirror when loading G-NAF data:

```bash
# Uses mirror by default
addresskit load

# Disable mirror (use data.gov.au directly)
GNAF_USE_MIRROR=false addresskit load

# Use custom mirror URL
GNAF_MIRROR_URL=https://my-mirror.example.com/package_show.conf.json addresskit load
```

## Monitoring

The mirror exposes a health endpoint at `https://dl.addresskit.com.au/health` that returns:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-05T12:00:00.000Z",
  "mirror_synced_at": "2025-01-01T06:00:00.000Z",
  "source_modified": "2024-11-17T04:05:08.246237",
  "resource_count": 5
}
```

## Troubleshooting

### Mirror returns 503

The mirror may be temporarily unavailable or syncing. The AddressKit CLI will automatically fall back to data.gov.au.

### Sync fails with timeout

Large files (>1GB) may take a long time to download and upload. Ensure:
- Network connection is stable
- Increase timeout values if needed
- Check DigitalOcean Spaces quota

### Files out of date

G-NAF is released quarterly. Check:
- GitHub Actions workflow is running
- Sync completed successfully
- Check `/health` endpoint for last sync time

## Cost Considerations

- **DigitalOcean Spaces**: ~$5/month for 250GB + $0.01/GB transfer
- **Cloudflare Workers**: Free tier covers most usage (100k requests/day)
- **GitHub Actions**: Free for public repos, minutes included for private

For a typical AddressKit deployment with ~10 loaders/month, expect costs under $10/month.

