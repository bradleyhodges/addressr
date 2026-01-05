<img src="https://exbluygwdjrpygxgzsdc.supabase.co/storage/v1/object/public/addresskit/AddressKit-Logo.png" height="64" alt="AddressKit" />

<br />

[![GitHub license](https://img.shields.io/github/license/bradleyhodges/addresskit)](https://github.com/bradleyhodges/addresskit/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/@bradleyhodges/addresskit)](https://www.npmjs.com/package/@bradleyhodges/addresskit) [![npm downloads](https://img.shields.io/npm/dm/@bradleyhodges/addresskit)](https://www.npmjs.com/package/@bradleyhodges/addresskit) [![Docker Image Version (latest by date)](https://img.shields.io/docker/v/bradleyhodges/addresskit?label=image%20version)](https://hub.docker.com/r/bradleyhodges/addresskit) [![Docker Pulls](https://img.shields.io/docker/pulls/bradleyhodges/addresskit)](https://hub.docker.com/r/bradleyhodges/addresskit)

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
- ✅ **Locality Search:** Dedicated suburb/postcode autocomplete for when you only need locality lookups without full address results
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

---
# Table of Contents

- [Installation](#installation)
  - [Docker Compose](#docker-compose)
  - [Using npm](#using-npm)
- [Enabling Geocoding](#enabling-geocoding)
- [Updating AddressKit](#updating-addresskit)
- [CLI Reference](#cli-reference)
  - [Commands](#commands)
  - [`load` Command](#load-command)
  - [`start` Command](#start-command)
  - [`version` Command](#version-command)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
  - [Search / Autocomplete](#search--autocomplete)
  - [Get Address Details](#get-address-details)
  - [Search Localities](#search-localities)
  - [Get Locality Details](#get-locality-details)
  - [Error Responses](#error-responses)
- [System Requirements](#system-requirements)
  - [Supported Platforms](#supported-platforms)

---
# Installation

If you prefer to self-host AddressKit, you have two options for installation: using **[Docker Compose](#docker-compose) (recommended)**, or globally using [npm](#using-npm). 

## Docker Compose

The fastest way to get AddressKit running. No installation required - just good ol' Docker.

#### 1. Create `docker-compose.yml` in your project root, and copy this into it:

```yaml
services:
  opensearch:
    image: opensearchproject/opensearch:1.3.20
    environment:
      - discovery.type=single-node
      - plugins.security.disabled=true
      - OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g
    ports:
      - "9200:9200"
    volumes:
      - opensearch-data:/usr/share/opensearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9200/_cluster/health >/dev/null || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 30
      start_period: 60s
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
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8080/addresses?q=test >/dev/null || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  loader:
    image: bradleyhodges/addresskit:latest
    profiles:
      - loader
    environment:
      - ELASTIC_HOST=opensearch
      - ELASTIC_PORT=9200
      - COVERED_STATES=${COVERED_STATES:-ACT}
      # - ADDRESSKIT_ENABLE_GEO=true  # Uncomment to enable geocoding
    volumes:
      - gnaf-data:/home/node/gnaf
    depends_on:
      opensearch:
        condition: service_healthy
    command: ["addresskit", "load"]
    restart: "no"

  # Optional: OpenSearch Dashboards for monitoring
  dashboards:
    image: opensearchproject/opensearch-dashboards:1.3.20
    profiles:
      - monitoring
    environment:
      - OPENSEARCH_HOSTS=["http://opensearch:9200"]
      - DISABLE_SECURITY_DASHBOARDS_PLUGIN=true
    ports:
      - "5601:5601"
    depends_on:
      opensearch:
        condition: service_healthy
    restart: unless-stopped

volumes:
  opensearch-data:
  gnaf-data:
```

#### 2. Start OpenSearch and the AddressKit REST API server:

```bash
docker compose up -d
```

#### 3. Load the G-NAF address data into the search index (first time only):

```bash
docker compose --profile loader run --rm loader
```

> [!TIP] 
> By default, only ACT is loaded for quick testing. To load specific states, set the `COVERED_STATES` environment variable:
> ```bash
> COVERED_STATES=NSW,VIC,QLD docker compose --profile loader run --rm loader
> ```
> Or to load all states (takes longer, requires more disk space):
> ```bash
> COVERED_STATES= docker compose --profile loader run --rm loader
> ```

#### 4. Test the API by searching for addresses:

```bash
# Search for addresses (autocomplete)
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3"

# Get detailed information for a specific address
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/addresses/GAVIC411711441"
```

The API returns JSON:API compliant responses. See [API Endpoints](#api-endpoints) for detailed examples.

#### 5. Optional: Enable monitoring dashboard

```bash
docker compose --profile monitoring up -d
```

Access the OpenSearch Dashboards at http://localhost:5601 to monitor your index and search performance.

### Docker Compose Services

| Service | Description | Default Port | Profile |
|---------|-------------|--------------|---------|
| `opensearch` | Search backend | 9200 | default |
| `api` | REST API server | 8080 | default |
| `loader` | G-NAF data loader | - | `loader` |
| `dashboards` | OpenSearch Dashboards | 5601 | `monitoring` |

### Configuration

For production deployments or advanced configuration, create a `.env` file alongside your `docker-compose.yml`:

```env
# States to load (comma-separated: ACT,NSW,VIC,QLD,SA,WA,TAS,NT)
COVERED_STATES=NSW,VIC

# Enable geocoding (latitude/longitude)
ADDRESSKIT_ENABLE_GEO=true

# OpenSearch memory (adjust based on available RAM)
OPENSEARCH_HEAP=2g

# API server port
API_PORT=8080

# CORS origin (set to your domain in production)
CORS_ORIGIN=https://example.com
```

See [Environment Variables](#environment-variables) for all available options.

## Using npm

#### 1. Ensure you have Node.js >= 24.0.0 installed. You can check your Node.js version by running:

```bash
node --version
```

#### 2. Install the latest version of the AddressKit package globally using npm:

```bash
npm install -g @bradleyhodges/addresskit
```

After installation, the `addresskit` command will be available globally in your terminal. Verify the installation by running:

```bash
addresskit --version
```

#### 3. AddressKit requires OpenSearch as its search and indexing backend. If you don't already have an OpenSearch instance running, start one with Docker:

```bash
docker run -d --name opensearch \
  -p 9200:9200 -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "plugins.security.disabled=true" \
  -e "OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g" \
  opensearchproject/opensearch:1.3.20
```

#### 4. Configure AddressKit by creating a `.env` file in the root of your project and adding the following variables ([see below](#environment-variables) for all supported environment variables):

```env
ELASTIC_HOST=opensearch
ELASTIC_PORT=9200
ELASTIC_PROTOCOL=http
ADDRESSKIT_ENABLE_GEO=0 # disable geocoding support (requires more memory) by default
```

#### 5. Start the AddressKit API server by running:

```bash
addresskit start
```

#### 6. Load the G-NAF address data into the search index by running:

```bash
addresskit load
```

> [!NOTE]
> If you are using AddressKit for the first time, you will need to load the G-NAF address data into the search index. This will take a while, depending on the size of the G-NAF dataset. Read more about the load command [here](#load-command).

---
# Enabling Geocoding

Geocoding is an optional feature that can be enabled by setting the `ADDRESSKIT_ENABLE_GEO` environment variable to `1`. This will enable geocoding of addresses to latitude and longitude coordinates. Note that geocoding requires more memory, and is disabled by default. To enable geocoding, add the following to your `.env` or `docker-compose.yml` file:

```env
ADDRESSKIT_ENABLE_GEO=1
NODE_OPTIONS=--max_old_space_size=8196 # This is the maximum memory allocation for the Node.js process. Adjust this value based on your system's available memory.
```

> [!IMPORTANT] Geocoding requires more memory
> With geocoding enabled, indexing takes longer and requires more memory (8GB recommended). If you are experiencing memory issues, you can adjust the `NODE_OPTIONS` value to allocate more memory to the Node.js process. You can read more about the `NODE_OPTIONS` environment variable [here](https://nodejs.org/api/cli.html#node_optionsoptions).

---
# Updating AddressKit

AddressKit is updated regularly to fix bugs and add new features. You can update AddressKit by pulling the latest Docker image:

```bash
docker pull bradleyhodges/addresskit:latest
```

Or, if you are using npm, by running:

```bash
npm install -g @bradleyhodges/addresskit
```

In addition to keeping AddressKit updated, you should regularly update the G-NAF address data to ensure you have the latest addresses. Updates to the G-NAF data are released every 3 months. To automate this chore, you could set up a cron job to keep AddressKit updated. For example, in Linux/macOS, you could add the following to your `crontab`:

```bash
# Run on the 1st of every month at 3am
0 3 1 * * addresskit load --clear # Note: passing the --clear flag will clear the index before loading the latest data, which may cause some downtime. Use with caution.
```

---
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

## `load` Command

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

## `start` Command

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

## `version` Command

Displays detailed version and environment information.

```bash
addresskit version
```

---
# Environment Variables

### Core Settings

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ELASTIC_HOST` | OpenSearch host | `localhost` |
| `ELASTIC_PORT` | OpenSearch port | `9200` |
| `ELASTIC_PROTOCOL` | Protocol (`http` or `https`) | `http` |
| `ELASTIC_USERNAME` | OpenSearch username (optional) | |
| `ELASTIC_PASSWORD` | OpenSearch password (optional) | |
| `PORT` | API server port | `8080` |
| `ES_INDEX_NAME` | OpenSearch index name for addresses | `addresskit` |
| `ES_LOCALITY_INDEX_NAME` | OpenSearch index name for localities | `addresskit-localities` |
| `NODE_ENV` | Environment (`production` or `development`) | `production` |

### Data Loading

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `COVERED_STATES` | Comma-separated list of states to load (ACT,NSW,VIC,QLD,SA,WA,TAS,NT) | All states |
| `ADDRESSKIT_ENABLE_GEO` | Enable geocoding (`true` or `1` to enable) | Disabled |
| `ES_CLEAR_INDEX` | Clear index before loading | `false` |
| `GNAF_DIR` | Directory for G-NAF data cache | `/home/node/gnaf` |

### Performance & Caching

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `PAGE_SIZE` | Default results per page | `8` |
| `ADDRESSKIT_CACHE_ENABLED` | Enable response caching | `true` |
| `ADDRESSKIT_CACHE_MAX_ENTRIES` | Maximum cached entries | `1000` |
| `ADDRESSKIT_CACHE_TTL_MS` | Cache TTL in milliseconds | `300000` (5 min) |
| `ADDRESSKIT_DYNAMIC_RESOURCES` | Enable dynamic resource management | `true` |
| `ADDRESSKIT_TARGET_MEMORY_UTILIZATION` | Target memory usage ratio | `0.7` |

### CORS Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN` | CORS allowed origin | `*` |
| `ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS` | CORS exposed headers | |
| `ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS` | CORS allowed headers | |

### Retry & Timeout Settings

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ADDRESSKIT_INDEX_TIMEOUT` | Index operation timeout | `300s` |
| `ADDRESSKIT_INDEX_BACKOFF` | Initial backoff delay (ms) | `30000` |
| `ADDRESSKIT_INDEX_BACKOFF_INCREMENT` | Backoff increment (ms) | `30000` |
| `ADDRESSKIT_INDEX_BACKOFF_MAX` | Maximum backoff delay (ms) | `600000` |
| `ADDRESSKIT_INDEX_MAX_RETRIES` | Maximum retry attempts | `10` |

### Container Startup (Docker only)

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ADDRESSKIT_STARTUP_MAX_RETRIES` | Max retries waiting for OpenSearch | `60` |
| `ADDRESSKIT_STARTUP_RETRY_INTERVAL` | Seconds between retries | `5` |
| `ADDRESSKIT_SKIP_OPENSEARCH_WAIT` | Skip waiting for OpenSearch | `false` |
| `ADDRESSKIT_QUIET` | Suppress startup banner | `false` |

> **Note:** When adjusting `PAGE_SIZE`, consider how quickly you want initial results returned. For most use cases, leave it at 8 and use pagination for additional results. Why 8? [Mechanical Sympathy](https://dzone.com/articles/mechanical-sympathy).

---
# API Endpoints

The AddressKit API conforms to the [JSON:API v1.1 specification](https://jsonapi.org/format/). All responses use the `application/vnd.api+json` media type.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/addresses?q=<query>` | GET | Search for addresses (autocomplete) |
| `/addresses?q=<query>&page[number]=<n>` | GET | Search with pagination |
| `/addresses/:id` | GET | Get detailed information for a specific address |
| `/localities?q=<query>` | GET | Search for localities/suburbs (autocomplete) |
| `/localities?q=<query>&page[number]=<n>` | GET | Search localities with pagination |
| `/localities/:id` | GET | Get detailed information for a specific locality |
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

## Search Localities

Search for localities (suburbs/postcodes) matching a query string. Returns lightweight autocomplete suggestions - useful when you only need suburb/postcode lookups without full address autocomplete.

**Request:**

```bash
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/localities?q=sydney"
```

**Response:**

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": [
    {
      "type": "locality-suggestion",
      "id": "NSW1234",
      "attributes": {
        "display": "SYDNEY NSW 2000",
        "rank": 1
      },
      "links": {
        "self": "/localities/NSW1234"
      }
    },
    {
      "type": "locality-suggestion",
      "id": "NSW5678",
      "attributes": {
        "display": "SYDNEY SOUTH NSW 2000",
        "rank": 0.85
      },
      "links": {
        "self": "/localities/NSW5678"
      }
    }
  ],
  "links": {
    "self": "/localities?q=sydney",
    "first": "/localities?q=sydney",
    "prev": null,
    "next": "/localities?q=sydney&page[number]=2",
    "last": "/localities?q=sydney&page[number]=5"
  },
  "meta": {
    "total": 42,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5
  }
}
```

## Get Locality Details

Retrieve comprehensive details for a specific locality by its G-NAF Locality Persistent Identifier (PID). Use this endpoint after a user selects a locality from the autocomplete results.

**Request:**

```bash
curl -H "Accept: application/vnd.api+json" \
  "http://localhost:8080/localities/NSW1234"
```

**Response:**

```json
{
  "jsonapi": {
    "version": "1.1"
  },
  "data": {
    "type": "locality",
    "id": "NSW1234",
    "attributes": {
      "localityPid": "NSW1234",
      "name": "SYDNEY",
      "display": "SYDNEY NSW 2000",
      "class": {
        "code": "G",
        "name": "GAZETTED LOCALITY"
      },
      "state": {
        "name": "New South Wales",
        "abbreviation": "NSW"
      },
      "postcode": "2000",
      "postcodes": ["2000", "2001"]
    },
    "links": {
      "self": "/localities/NSW1234"
    }
  },
  "links": {
    "self": "/localities/NSW1234"
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

---
# System Requirements

AddressKit is designed to be lightweight and efficient. It is built to run on modest hardware, and is designed to be self-hosted on your own infrastructure.

## Resource Requirements

| Deployment Size | States | Memory | Disk | Use Case |
|-----------------|--------|--------|------|----------|
| **Small** | 1-2 states (e.g., ACT) | 2GB | 10GB | Development, testing |
| **Medium** | 3-4 states | 4GB | 30GB | Regional applications |
| **Large** | All states | 8GB+ | 100GB+ | National production |

These requirements include both AddressKit and OpenSearch. Memory should be split roughly 50/50 between the API server and OpenSearch (adjust `OPENSEARCH_HEAP` accordingly).

> [!NOTE]
> If you enable geocoding (`ADDRESSKIT_ENABLE_GEO=true`), increase memory requirements by approximately 50%. For all states with geocoding, we recommend 12GB+ RAM.

## Production Deployment Tips

For production deployments, consider:

1. **Security:** Set `CORS_ORIGIN` to your specific domain(s), enable OpenSearch security, use HTTPS via a reverse proxy
2. **Performance:** Tune `OPENSEARCH_HEAP` to 50% of available container memory (max 32GB)
3. **Reliability:** Set up volume backups for `opensearch-data` and `gnaf-data`, configure log aggregation
4. **Monitoring:** Enable the `monitoring` profile to access OpenSearch Dashboards

## Supported Platforms

- **Windows** 10/11 (x64)
- **macOS** 12+ (Intel and Apple Silicon)
- **Linux** (x64, arm64)
  - Ubuntu 20.04+
  - Debian 11+
  - CentOS 8+
  - Amazon Linux 2+
