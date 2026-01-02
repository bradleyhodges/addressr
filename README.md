<img src="https://exbluygwdjrpygxgzsdc.supabase.co/storage/v1/object/public/addresskit/AddressKit-Logo.png" height="64" alt="AddressKit" />

<br />

[![GitHub license](https://img.shields.io/github/license/bradleyhodges/addresskit)](https://github.com/bradleyhodges/addresskit/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/@bradleyhodges/addresskit)](https://www.npmjs.com/package/@bradleyhodges/addresskit) [![npm downloads](https://img.shields.io/npm/dm/@bradleyhodges/addresskit)](https://www.npmjs.com/package/@bradleyhodges/addresskit) [![Docker Image Version (latest by date)](https://img.shields.io/docker/v/@bradleyhodges/addresskit?label=image%20version)](https://hub.docker.com/r/@bradleyhodges/addresskit) [![Docker Pulls](https://img.shields.io/docker/pulls/@bradleyhodges/addresskit)](https://hub.docker.com/r/@bradleyhodges/addresskit)

[![GitHub issues](https://img.shields.io/github/issues/bradleyhodges/addresskit)](https://github.com/bradleyhodges/addresskit/issues) [![GitHub pull requests](https://img.shields.io/github/issues-pr/bradleyhodges/addresskit)](https://github.com/bradleyhodges/addresskit/pulls) [![Libraries.io dependency status for latest release](https://img.shields.io/librariesio/release/npm/@bradleyhodges/addresskit)](https://libraries.io/npm/@bradleyhodges%2Faddresskit)


# About

AddressKit is an open-source, scalable address ingestion, validation, search, and autocomplete engine that handles complex address structures for address validation of Australian addresses against the [Geocoded National Address File](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf) (referred to as G-NAF) &mdash; Australia's authoritative address file.

This project is a fork of [Addressr](https://github.com/mountain-pass/addressr), with the objective of improving the quality, performance, and maintainability of the codebase. AddressKit is a rewrite of Addressr in TypeScript with numerous improvements, and is a major improvement over the original project, which is sparsely maintained and contains dangerously outdated dependencies. 

It is available as a self-hosted solution, or can be accessed for free through the AddressKit REST API. 

AddressKit is actively maintained and developed by [Bradley Hodges](https://github.com/bradleyhodges) and is not affiliated with Addressr or its author, Mountain Pass. 

## Licensing

*Addressr* (the library which AddressKit was forked from) is licensed under the [Apache 2.0](https://github.com/mountain-pass/addressr/blob/f0eb2faa6098e69e5a912e4b6af70c73e5b380a3/LICENSE.md), which expressly permits commercial use, modification, distribution, and sublicensing. You can read more about Apache 2.0 license terms [here](https://www.tldrlegal.com/license/apache-license-2-0-apache-2-0). 

**AddressKit is licensed under the [GNU GPLv2](https://github.com/bradleyhodges/addresskit/blob/master/LICENSE)** license. You can read more about the GNU GPLv2 license [here](https://www.tldrlegal.com/license/gnu-general-public-license-v2).

## Features
AddressKit is a comprehensive solution for managing and validating Australian addresses. Notable features include:

- ✅ **Autocomplete:** Blazingly fast search and autocomplete of Australian addresses based on partial input with result paging, sorting, and filtering
- ✅ **Canonical validation**: Validation is built into AddressKit's core data model since every address is resolved from the [G-NAF](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf) by default, so "valid" automatically means "authoritatively correct"
- ✅ **Always up-to-date:** AddressKit automatically refreshes its data from the [G-NAF](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf) every 3 months
- ✅ **Real-time address validation:** Address validation and autocomplete for Australian addresses
- ✅ **JSON:API compliant:** RESTful API conforming to the [JSON:API v1.1 specification](https://jsonapi.org/format/) for standardized, predictable responses
- ✅ **Easy to use API:** Straightforward REST API and CLI service for building your own address validation and autocomplete solutions
- ✅ **Beautiful CLI:** Modern command-line interface with colorful output, progress indicators, and intuitive commands
- ✅ **Run on your own infrastructure or use ours:** Self-host or use our hosted solution
- ✅ **Completely free and open-source:** Completely free or pay for support
- ✅ **Geocoding:** Geocoding of addresses to latitude and longitude coordinates
- ✅ **Cross-platform:** Works on Windows, macOS, and Linux

# Table of Contents

- [About](#about)
- [Table of Contents](#table-of-contents)
- [Installation](#installation)
- [CLI Reference](#cli-reference)
  - [Commands](#commands)
  - [Load Command](#load-command)
  - [Start Command](#start-command)
  - [Version Command](#version-command)
- [Quick Start](#quick-start)
  - [Self Hosted](#self-hosted)
  - [Docker Compose](#docker-compose)
- [API Endpoints](#api-endpoints)
  - [Search / Autocomplete](#search--autocomplete)
  - [Get Address Details](#get-address-details)
  - [Error Responses](#error-responses)
- [Configuration](#configuration)
- [System Requirements](#system-requirements)

# Installation

Install AddressKit globally using npm:

```bash
npm install -g @bradleyhodges/addresskit
```

Or using yarn:

```bash
yarn global add @bradleyhodges/addresskit
```

Or using pnpm:

```bash
pnpm add -g @bradleyhodges/addresskit
```

After installation, the `addresskit` command will be available globally in your terminal.

**Verify Installation:**

```bash
addresskit --version
```

# CLI Reference

AddressKit provides a beautiful, intuitive command-line interface for managing your address validation service.

```
    ___       __    __                    __ __ _ __
   /   | ____/ /___/ /_______  __________/ //_/(_) /_
  / /| |/ __  / __  / ___/ _ \/ ___/ ___/ ,<  / / __/
 / ___ / /_/ / /_/ / /  /  __(__  |__  ) /| |/ / /_
/_/  |_\__,_/\__,_/_/   \___/____/____/_/ |_/_/\__/

  ─────────────────────────────────────────────────────
  Australian Address Validation & Autocomplete Engine
  ─────────────────────────────────────────────────────

Usage: addresskit [options] [command]

Options:
  -v, --version    Display version information
  -h, --help       Display help information

Commands:
  load [options]   Load G-NAF address data into the search index
  start [options]  Start the REST API server
  version          Display detailed version and environment information
  help [command]   Display help for a specific command
```

## Commands

| Command | Description |
|---------|-------------|
| `addresskit load` | Download and index G-NAF address data into OpenSearch |
| `addresskit start` | Start the REST API server |
| `addresskit version` | Display version and environment information |
| `addresskit help` | Display help information |

## Load Command

Downloads the latest G-NAF dataset from data.gov.au, extracts it, and indexes all addresses into your OpenSearch instance.

```bash
addresskit load [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --daemon` | Run in background mode (suppresses terminal output) | `false` |
| `-s, --states <states>` | Comma-separated list of states to load (e.g., `NSW,VIC,QLD`) | All states |
| `--clear` | Clear existing index before loading | `false` |
| `--geo` | Enable geocoding support | `false` |
| `-h, --help` | Display help for the load command | |

**Examples:**

```bash
# Load all states
addresskit load

# Load only NSW and VIC
addresskit load --states NSW,VIC

# Load with geocoding enabled
addresskit load --geo

# Clear index and reload specific states with geocoding
addresskit load --clear --states QLD,SA --geo

# Run in daemon mode (background, no output)
addresskit load -d
```

**Valid State Codes:**

| Code | State |
|------|-------|
| `ACT` | Australian Capital Territory |
| `NSW` | New South Wales |
| `NT` | Northern Territory |
| `OT` | Other Territories |
| `QLD` | Queensland |
| `SA` | South Australia |
| `TAS` | Tasmania |
| `VIC` | Victoria |
| `WA` | Western Australia |

## Start Command

Starts the REST API server for address search and validation.

```bash
addresskit start [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --daemon` | Run in background mode (suppresses terminal output) | `false` |
| `-p, --port <port>` | Port to listen on | `8080` or `$PORT` |
| `-h, --help` | Display help for the start command | |

**Examples:**

```bash
# Start server on default port (8080)
addresskit start

# Start server on custom port
addresskit start --port 3000

# Start in daemon mode
addresskit start -d

# Start on custom port in daemon mode
addresskit start -d -p 9000
```

## Version Command

Displays detailed version and environment information.

```bash
addresskit version
```

# Quick Start

## Self Hosted

### 1. Install AddressKit

```bash
npm install -g @bradleyhodges/addresskit
```

### 2. Start OpenSearch

```bash
docker pull opensearchproject/opensearch:1.3.20
docker run -p 9200:9200 -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "plugins.security.disabled=true" \
  opensearchproject/opensearch:1.3.20
```

### 3. Configure Environment Variables

**Linux/macOS:**
```bash
export ELASTIC_PORT=9200
export ELASTIC_HOST=localhost
```

**Windows (PowerShell):**
```powershell
$env:ELASTIC_PORT = "9200"
$env:ELASTIC_HOST = "localhost"
```

**Windows (Command Prompt):**
```cmd
set ELASTIC_PORT=9200
set ELASTIC_HOST=localhost
```

### 4. Load Address Data

In a new terminal window:

```bash
# Load all states (takes approximately 1 hour for 13+ million addresses)
addresskit load

# Or load specific states for faster initial setup
addresskit load --states VIC,NSW
```

**Optional: Enable Geocoding**

```bash
# Linux/macOS
export ADDRESSKIT_ENABLE_GEO=1
export NODE_OPTIONS=--max_old_space_size=8196
addresskit load --geo

# Windows (PowerShell)
$env:ADDRESSKIT_ENABLE_GEO = "1"
$env:NODE_OPTIONS = "--max_old_space_size=8196"
addresskit load --geo
```

> **Note:** With geocoding enabled, indexing takes longer and requires more memory (8GB recommended).

### 5. Start the API Server

In another terminal window:

```bash
addresskit start
```

Or specify a custom port:

```bash
addresskit start --port 3000
```

### 6. Test the API

```bash
# Search for addresses (autocomplete)
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3"

# Get detailed information for a specific address
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/addresses/GAVIC411711441"
```

The API returns JSON:API compliant responses. See [API Endpoints](#api-endpoints) for detailed examples.

### 7. Keep Data Updated

An updated G-NAF is released every 3 months. Set up a cron job to keep AddressKit updated:

**Linux/macOS (crontab):**
```bash
# Run on the 1st of every month at 3am
0 3 1 * * addresskit load --clear
```

**Windows (Task Scheduler):**
Create a scheduled task to run `addresskit load --clear` monthly.

## Docker Compose

The fastest way to get AddressKit running. No installation required - just good ol' Docker.

### 1. Create `docker-compose.yml`

Copy this into a new file called `docker-compose.yml`:

```yaml
services:
  opensearch:
    image: opensearchproject/opensearch:1.3.2
    environment:
      - discovery.type=single-node
      - plugins.security.disabled=true
      - OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g
    ports:
      - "9200:9200"
    volumes:
      - opensearch-data:/usr/share/opensearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9200/ >/dev/null || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 40
    restart: unless-stopped

  api:
    image: bradleyhodges/addresskit:latest
    environment:
      - ELASTIC_HOST=opensearch
      - ELASTIC_PORT=9200
      - PORT=8080
    ports:
      - "8080:8080"
    depends_on:
      opensearch:
        condition: service_healthy
    command: ["addresskit", "start", "--daemon"]
    restart: unless-stopped

  loader:
    image: bradleyhodges/addresskit:latest
    environment:
      - ELASTIC_HOST=opensearch
      - ELASTIC_PORT=9200
      # Uncomment to load specific states only (faster)
      # - COVERED_STATES=NSW,VIC
      # Uncomment to enable geocoding (requires more memory)
      # - ADDRESSKIT_ENABLE_GEO=1
    volumes:
      - gnaf-data:/home/node/gnaf
    depends_on:
      opensearch:
        condition: service_healthy
    command: ["addresskit", "load"]
    restart: "no"

volumes:
  opensearch-data:
  gnaf-data:
```

### 2. Start OpenSearch and API

```bash
docker compose up -d opensearch api
```

### 3. Load Address Data

```bash
# Load all Australian addresses (takes ~20-40 minutes)
docker compose run --rm loader
```

> **Tip:** To load only specific states (faster), edit the `COVERED_STATES` environment variable in the compose file before running.

### 4. Test the API

```bash
curl "http://localhost:8080/addresses?q=300+barangaroo"
```

### 5. View Logs

```bash
docker compose logs -f api
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `COVERED_STATES` | Comma-separated states to load (e.g., `NSW,VIC`) | All states |
| `ADDRESSKIT_ENABLE_GEO` | Enable geocoding (`1` to enable) | Disabled |
| `ES_CLEAR_INDEX` | Clear index before loading (`true`) | `false` |

### Services

| Service | Description | Port |
|---------|-------------|------|
| `opensearch` | Search backend | 9200 |
| `api` | REST API server | 8080 |
| `loader` | G-NAF data loader (run once) | - |

# API Endpoints

The AddressKit API conforms to the [JSON:API v1.1 specification](https://jsonapi.org/format/). All responses use the `application/vnd.api+json` media type.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/addresses?q=<query>` | GET | Search for addresses (autocomplete) |
| `/addresses?q=<query>&page[number]=<n>` | GET | Search with pagination |
| `/addresses/:id` | GET | Get detailed information for a specific address |
| `/docs` | GET | OpenAPI/Swagger documentation |

## Search / Autocomplete

Search for addresses matching a query string. Returns lightweight autocomplete suggestions optimized for typeahead UX.

**Request:**

```bash
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/addresses?q=300+barangaroo"
```

**Response:**

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": [
    {
      "type": "address-suggestion",
      "id": "GANSW716635811",
      "attributes": {
        "sla": "LEVEL 25, TOWER 3, 300 BARANGAROO AV, BARANGAROO NSW 2000",
        "rank": 1
      },
      "links": {
        "self": "/addresses/GANSW716635811"
      }
    },
    {
      "type": "address-suggestion",
      "id": "GANSW716635812",
      "attributes": {
        "sla": "LEVEL 26, TOWER 3, 300 BARANGAROO AV, BARANGAROO NSW 2000",
        "rank": 0.92
      },
      "links": {
        "self": "/addresses/GANSW716635812"
      }
    }
  ],
  "links": {
    "self": "/addresses?q=300+barangaroo",
    "first": "/addresses?q=300+barangaroo",
    "prev": null,
    "next": "/addresses?q=300+barangaroo&page[number]=2",
    "last": "/addresses?q=300+barangaroo&page[number]=5"
  },
  "meta": {
    "total": 42,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5
  }
}
```

## Get Address Details

Retrieve comprehensive details for a specific address by its G-NAF Persistent Identifier (PID). Use this endpoint after a user selects an address from the autocomplete results.

**Request:**

```bash
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/addresses/GANSW716635811"
```

**Response:**

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": {
    "type": "address",
    "id": "GANSW716635811",
    "attributes": {
      "pid": "GANSW716635811",
      "sla": "LEVEL 25, TOWER 3, 300 BARANGAROO AV, BARANGAROO NSW 2000",
      "ssla": "25/300 BARANGAROO AV, BARANGAROO NSW 2000",
      "mla": [
        "LEVEL 25",
        "TOWER 3",
        "300 BARANGAROO AV",
        "BARANGAROO NSW 2000"
      ],
      "structured": {
        "buildingName": "Tower 3",
        "level": {
          "type": { "name": "Level", "code": "L" },
          "number": 25
        },
        "number": {
          "number": 300
        },
        "street": {
          "name": "Barangaroo",
          "type": { "name": "Avenue", "code": "AV" }
        },
        "locality": {
          "name": "Barangaroo",
          "class": { "code": "G", "name": "GAZETTED LOCALITY" }
        },
        "state": {
          "name": "New South Wales",
          "abbreviation": "NSW"
        },
        "postcode": "2000",
        "confidence": 2
      },
      "geo": {
        "level": {
          "code": 7,
          "name": "LOCALITY, STREET, ADDRESS"
        },
        "geocodes": [
          {
            "latitude": -33.8535,
            "longitude": 151.2012,
            "isDefault": true,
            "reliability": {
              "code": 2,
              "name": "WITHIN ADDRESS SITE BOUNDARY OR ACCESS POINT"
            },
            "type": {
              "code": 2,
              "name": "PROPERTY CENTROID"
            }
          }
        ]
      }
    },
    "links": {
      "self": "/addresses/GANSW716635811"
    }
  },
  "links": {
    "self": "/addresses/GANSW716635811"
  }
}
```

## Error Responses

All error responses follow the JSON:API error format:

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "errors": [
    {
      "status": "404",
      "code": "RESOURCE_NOT_FOUND",
      "title": "Not Found",
      "detail": "The address with ID 'INVALID_123' does not exist."
    }
  ]
}
```

| Status | Description |
|--------|-------------|
| `400` | Bad Request - Invalid query parameters |
| `404` | Not Found - Address ID does not exist |
| `500` | Internal Server Error - Unexpected error |
| `503` | Service Unavailable - OpenSearch unavailable |
| `504` | Gateway Timeout - Query timeout |

# Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ELASTIC_HOST` | OpenSearch host | `localhost` |
| `ELASTIC_PORT` | OpenSearch port | `9200` |
| `ELASTIC_PROTOCOL` | Protocol (`http` or `https`) | `http` |
| `ELASTIC_USERNAME` | OpenSearch username (optional) | |
| `ELASTIC_PASSWORD` | OpenSearch password (optional) | |
| `PORT` | API server port | `8080` |
| `ES_INDEX_NAME` | OpenSearch index name | `addresskit` |
| `COVERED_STATES` | Comma-separated list of states to load | All states |
| `ADDRESSKIT_ENABLE_GEO` | Enable geocoding (`1` to enable) | Disabled |
| `PAGE_SIZE` | Default results per page | `8` |
| `ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN` | CORS allowed origin | |
| `ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS` | CORS exposed headers | |
| `ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS` | CORS allowed headers | |
| `ADDRESSKIT_INDEX_TIMEOUT` | Index operation timeout | `30s` |
| `ADDRESSKIT_INDEX_BACKOFF` | Initial backoff delay (ms) | `1000` |
| `ADDRESSKIT_INDEX_BACKOFF_INCREMENT` | Backoff increment (ms) | `1000` |
| `ADDRESSKIT_INDEX_BACKOFF_MAX` | Maximum backoff delay (ms) | `10000` |

> **Note:** When adjusting `PAGE_SIZE`, consider how quickly you want initial results returned. For most use cases, leave it at 8 and use pagination for additional results. Why 8? [Mechanical Sympathy](https://dzone.com/articles/mechanical-sympathy).

# System Requirements

## OpenSearch

- OpenSearch >= 1.2.4
- Memory: 1.4 GiB minimum
- CPU: 1 core

## AddressKit Loader

### Default (without geocoding)
- Node.js >= 20.0.0
- Memory: 1 GiB
- CPU: 1 core

### With Geocoding Enabled
- Node.js >= 20.0.0
- Memory: 8 GiB
- CPU: 4 cores

## AddressKit Server

- Node.js >= 20.0.0
- Memory: 64 MiB (128 MiB+ recommended)
- CPU: 1 core

## Supported Platforms

- **Windows** 10/11 (x64)
- **macOS** 12+ (Intel and Apple Silicon)
- **Linux** (x64, arm64)
  - Ubuntu 20.04+
  - Debian 11+
  - CentOS 8+
  - Amazon Linux 2+
