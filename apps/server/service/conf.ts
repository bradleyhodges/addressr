import { getCoveredStates } from "./helpers/getCoveredStates";

/**
 * The page size for the API.
 */
export const PAGE_SIZE = Number.parseInt(process.env.PAGE_SIZE ?? "8") || 8;

/**
 * The covered, supported Australian states.
 */
export const COVERED_STATES = getCoveredStates();

/**
 * The number of seconds in a day.
 */
export const ONE_DAY_S = 86400;

/**
 * The number of milliseconds in a day.
 */
export const ONE_DAY_MS = 1000 * ONE_DAY_S;

/**
 * The number of milliseconds in 30 days.
 */
export const THIRTY_DAYS_MS = ONE_DAY_MS * 30;

/**
 * The name of the Elasticsearch index.
 */
export const ES_INDEX_NAME = process.env.ES_INDEX_NAME || "addresskit";

/**
 * The URL of the Geoscape Geocoded National Address File (G-NAF) package.
 *
 * SEE https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf
 */
export const GNAF_PACKAGE_URL =
    process.env.GNAF_PACKAGE_URL ||
    "https://data.gov.au/api/3/action/package_show?id=19432f89-dc3a-4ef3-b943-5326ef1dbecc";

/**
 * The directory for the GNAF file.
 */
export const GNAF_DIR = process.env.GNAF_DIR || "target/gnaf";
