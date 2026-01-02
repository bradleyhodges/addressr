/**
 * A mapping of file paths to their expected row counts. This is used to verify
 * that all rows were loaded correctly from the G-NAF data files.
 */
export type FileCountsRecord = Record<string, number>;

/**
 * Raw geocode record from the ADDRESS_SITE_GEOCODE PSV file.
 * Contains the site-level geocode information including coordinates and reliability.
 */
export type SiteGeocodeRow = {
    /** Unique identifier for the address site */
    ADDRESS_SITE_PID: string;
    /** Type code indicating the geocode method (e.g., GPS, SURVEY) */
    GEOCODE_TYPE_CODE: string;
    /** Reliability code indicating the accuracy of the geocode */
    RELIABILITY_CODE: string;
    /** WGS84 latitude coordinate */
    LATITUDE: string;
    /** WGS84 longitude coordinate */
    LONGITUDE: string;
    /** Optional description of the geocode site */
    GEOCODE_SITE_DESCRIPTION: string;
    /** Boundary extent information (rarely populated) */
    BOUNDARY_EXTENT: string;
    /** Planimetric accuracy in meters (rarely populated) */
    PLANIMETRIC_ACCURACY: string;
    /** Elevation in meters (rarely populated) */
    ELEVATION: string;
    /** Name of the geocode site (rarely populated) */
    GEOCODE_SITE_NAME: string;
};

/**
 * Raw geocode record from the ADDRESS_DEFAULT_GEOCODE PSV file.
 * Contains the default geocode for an address detail (typically the centroid).
 */
export type DefaultGeocodeRow = {
    /** Unique identifier for the address detail */
    ADDRESS_DETAIL_PID: string;
    /** Type code indicating the geocode method */
    GEOCODE_TYPE_CODE: string;
    /** WGS84 latitude coordinate */
    LATITUDE: string;
    /** WGS84 longitude coordinate */
    LONGITUDE: string;
};

/**
 * Raw locality record from the LOCALITY PSV file.
 * Contains suburb/locality information.
 */
export type LocalityRow = {
    /** Unique identifier for the locality */
    LOCALITY_PID: string;
    /** Name of the locality (suburb/town name) */
    LOCALITY_NAME: string;
    /** Class code for the locality export type */
    LOCALITY_CLASS_CODE: string;
};

/**
 * Raw street locality record from the STREET_LOCALITY PSV file.
 * Contains street information within a locality.
 */
export type StreetLocalityRow = {
    /** Unique identifier for the street locality */
    STREET_LOCALITY_PID: string;
    /** Name of the street */
    STREET_NAME: string;
    /** Type code for the street (e.g., ROAD, STREET, AVENUE) */
    STREET_TYPE_CODE: string;
    /** Class code for the street (e.g., CONFIRMED, PROPOSED) */
    STREET_CLASS_CODE: string;
    /** Suffix code for the street direction (e.g., N, S, E, W) */
    STREET_SUFFIX_CODE: string;
};

/**
 * Context object that accumulates data during the GNAF loading process.
 * This is progressively populated as files are parsed and eventually used
 * to map address details to their full structured representation.
 */
export type LoadContext = {
    /** Current state abbreviation being processed (e.g., NSW, VIC) */
    state?: string;
    /** Full name of the current state being processed */
    stateName?: string;
    /** Street localities indexed by their PID for fast lookup */
    streetLocalityIndexed?: Record<string, StreetLocalityRow>;
    /** Localities indexed by their PID for fast lookup */
    localityIndexed?: Record<string, LocalityRow>;
    /** Site geocodes indexed by ADDRESS_SITE_PID for fast lookup */
    geoIndexed?: Record<string, SiteGeocodeRow[]>;
    /** Default geocodes indexed by ADDRESS_DETAIL_PID for fast lookup */
    geoDefaultIndexed?: Record<string, DefaultGeocodeRow[]>;
    /** Dynamic authority code tables loaded from Authority Code files */
    [key: string]: unknown;
};
