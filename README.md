# AddressKit

[![GitHub license](https://img.shields.io/github/license/bradleyhodges/addresskit)](https://github.com/bradleyhodges/addresskit/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/@bradleyhodges/addresskit)](https://www.npmjs.com/package/@bradleyhodges/addresskit) [![npm downloads](https://img.shields.io/npm/dm/@bradleyhodges/addresskit)](https://www.npmjs.com/package/@bradleyhodges/addresskit) [![Docker Image Version (latest by date)](https://img.shields.io/docker/v/@bradleyhodges/addresskit?label=image%20version)](https://hub.docker.com/r/@bradleyhodges/addresskit) [![Docker Pulls](https://img.shields.io/docker/pulls/@bradleyhodges/addresskit)](https://hub.docker.com/r/@bradleyhodges/addresskit)

[![GitHub issues](https://img.shields.io/github/issues/bradleyhodges/addresskit)](https://github.com/bradleyhodges/addresskit/issues) [![GitHub pull requests](https://img.shields.io/github/issues-pr/bradleyhodges/addresskit)](https://github.com/bradleyhodges/addresskit/pulls) [![Libraries.io dependency status for latest release](https://img.shields.io/librariesio/release/npm/@bradleyhodges/addresskit)](https://libraries.io/npm/@bradleyhodges%2Faddresskit)


# About

<img src="https://exbluygwdjrpygxgzsdc.supabase.co/storage/v1/object/public/addresskit/AddressKit-Logo.png" height="64" alt="AddressKit" />

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
- ✅ **Run on your own infrastructure or use ours:** Self-host or use our hosted solution
- ✅ **Completely free and open-source:** Completely free or pay for support
- ✅ **Geocoding:** Geocoding of addresses to latitude and longitude coordinates

# Table of Contents

- [AddressKit](#addresskit)
- [About](#about)
- [Table of Contents](#table-of-contents)
- [Quick Start](#quick-start)
  - [AddressKit REST API](#addresskit-rest-api)
  - [Self Hosting](#self-hosted)
    - [System requirements](#system-requirements)
      - [OpenSearch](#opensearch)
      - [AddressKit Service](#addresskit-service)
    - [Docker Compose](#docker-compose)
    - [Node.js](#nodejs)
    - [Additional Settings](#additional-settings)
    

# Quick Start

## Self Hosted

1. Install addresskit

   ```
   npm install @bradleyhodges/addresskit -g
   ```

   NOTE: If you are running windows, you'll need to use [wsl](https://docs.microsoft.com/en-us/windows/wsl/install-win10)
2. Start open search. For example run

   ```
   docker pull opensearchproject/opensearch:1.3.20
   docker run -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" -e "plugins.security.disabled=true" opensearchproject/opensearch:1.3.20
   ```

3. Start API server. In a second window run:

   ```sh
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   addresskit-server-2
   ```

4. Setup the env vars for the data loader. In a third window run:

   ```
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   export ADDRESSKIT_INDEX_TIMEOUT=30s
   export ADDRESSKIT_INDEX_BACKOFF=1000
   export ADDRESSKIT_INDEX_BACKOFF_INCREMENT=1000
   export ADDRESSKIT_INDEX_BACKOFF_MAX=10000
   ```

   1. Optional - enable geocodes by setting the following env vars for the data loader. In the third window run:
      **NOTE:** with geocodes enabled, indexing takes much longer and needs much more memory. Only use turn them on if you need them. You can always add them later.

   ```
   export ADDRESSKIT_ENABLE_GEO=1
   export NODE_OPTIONS=--max_old_space_size=8196
   ```

   2. Optional - limit the addresses to a single state by setting the `COVERED_STATES` env var for the data loader.
      This dramatically speeds up indexing. For example, in the third window run:

   ```
   export COVERED_STATES=VIC,SA
   ```

   Valid values are:

   - ACT
   - NSW
   - NT
   - OT
   - QLD
   - SA
   - TAS
   - VIC
   - WA

5. Run data Loader. In the third window run:

   ```
   addresskit-loader
   ```

6. OK, so we stretched the truth a bit with the "Quick Start" heading. The truth is that it takes quite a while to download, store and index the 13+ million addresses from [data.gov.au](http://data.gov.au/). So make a coffee, or tea, or find something else to do and come back in about an hour when it's done.
7. Search for an address using the command line

   ```
   curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
   ```

8. An updated G-NAF is released every 3 months. Put `addresskit-loader` in a cron job or similar to keep addresskit regularly updated
9. Wire you address form up to the address-server api.

## Additional Settings

| Environment Variable | Value       | Description                                           | Default |
| -------------------- | ----------- | ----------------------------------------------------- | ------- |
| ELASTIC_PROTOCOL     | http        | Connect to open search over http                   | ✅      |
| ELASTIC_PROTOCOL     | https       | Connect to open search over https                  |         |
| ELASTIC_USERNAME     | _blank_     | Connect to open search without authentication      | ✅      |
| ELASTIC_USERNAME     | _non-blank_ | Connect to open search with the specified username |         |
| ELASTIC_PASSWORD     | _blank_     | Connect to open search without authentication      | ✅      |
| ELASTIC_PASSWORD     | _non-blank_ | Connect to open search with the specified password |         |
| PAGE_SIZE            | 8           | Number or records to return in a search               | ✅      |
| ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN | _blank_ | An `Access-Control-Allow-Origin` response header is **not** returned | ✅      |
| ADDRESSKIT_ACCESS_CONTROL_ALLOW_ORIGIN | _non-blank_ | An `Access-Control-Allow-Origin` response header is returned with the value in the environment variable |       |
| ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS | _blank_ | An `Access-Control-Expose-Headers` response header is **not** returned | ✅      |
| ADDRESSKIT_ACCESS_CONTROL_EXPOSE_HEADERS | _non-blank_ | An `Access-Control-Expose-Headers` response header is returned with the value in the environment variable |       |
| ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS | _blank_ | An `Access-Control-Allow-Headers` response header is **not** returned | ✅      |
| ADDRESSKIT_ACCESS_CONTROL_ALLOW_HEADERS | _non-blank_ | An `Access-Control-Allow-Headers` response header is returned with the value in the environment variable |       |

NOTE: When adjusting PAGE_SIZE, you should take into account how quickly you want the initial results returned to the user. In many use cases, you want this to be as fast as possible. If you need show more results to the user, you are often better off leaving it a 8 and using the paging links to get more results while you are displaying the first 8.

Why is the default 8 and not 10? [Mechanical Sympathy](https://dzone.com/articles/mechanical-sympathy)

## System requirements

### Open Search

opensearch >= 1.2.4 with 1.4GiB of memory

### AddressKit Loader

#### Default

Node.js >= 12.11.0 with 1GiB of memory

#### With Geocoding enabled

Node.js >= 12.11.0 with 8GiB of memory

### AddressKit Server

Node.js >= 12.11.0 with 64MiB of memory
