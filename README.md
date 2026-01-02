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

***AddressKit*** is licensed under the [GNU GPLv2](https://www.tldrlegal.com/license/gnu-general-public-license-v2) license.

## Features
AddressKit is a comprehensive solution for managing and validating Australian addresses. Notable features include:

- ✅ **Autocomplete:** Blazingly fast search and autocomplete of Australian addresses based on partial input with result paging, sorting, and filtering
- ✅ **Canonical validation**: Validation is built into AddressKit's core data model since every address is resolved from the [G-NAF](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf) by default, so "valid" automatically means "authoritatively correct"
- ✅ **Always up-to-date:** AddressKit automatically refreshes its data from the [G-NAF](https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf) every 3 months
- ✅ **Real-time address validation:** Address validation and autocomplete for Australian addresses
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
- [API Endpoints](#api-endpoints)
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
# Search for addresses
curl -i "http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3"

# Get a specific address by ID
curl -i "http://localhost:8080/addresses/GAVIC411711441"
```

### 7. Keep Data Updated

An updated G-NAF is released every 3 months. Set up a cron job to keep AddressKit updated:

**Linux/macOS (crontab):**
```bash
# Run on the 1st of every month at 3am
0 3 1 * * addresskit load --clear
```

**Windows (Task Scheduler):**
Create a scheduled task to run `addresskit load --clear` monthly.

# API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/addresses?q=<query>` | GET | Search for addresses matching the query |
| `/addresses?q=<query>&p=<page>` | GET | Search with pagination |
| `/addresses/:id` | GET | Get detailed information for a specific address |
| `/docs` | GET | OpenAPI/Swagger documentation |

**Search Example:**

```bash
curl "http://localhost:8080/addresses?q=123+main+street+sydney"
```

**Response:**

```json
[
  {
    "sla": "123 MAIN STREET, SYDNEY NSW 2000",
    "score": 45.2,
    "links": {
      "self": {
        "href": "/addresses/GANSW12345678"
      }
    }
  }
]
```

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

## AddressKit Loader

### Default (without geocoding)
- Node.js >= 20.0.0
- Memory: 1 GiB

### With Geocoding Enabled
- Node.js >= 20.0.0
- Memory: 8 GiB

## AddressKit Server

- Node.js >= 20.0.0
- Memory: 64 MiB

## Supported Platforms

- **Windows** 10/11 (x64)
- **macOS** 12+ (Intel and Apple Silicon)
- **Linux** (x64, arm64)
  - Ubuntu 20.04+
  - Debian 11+
  - CentOS 8+
  - Amazon Linux 2+
