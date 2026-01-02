import type { PropertyCodeToNameContext } from "../helpers/propertyCodeToName";

export type LocalityRecord = {
    LOCALITY_NAME: string;
    LOCALITY_CLASS_CODE: string;
};

export type StructuredLocality = {
    name?: string;
    class?: { code: string; name?: string };
};

export type StreetLocalityRecord = {
    STREET_NAME: string;
    STREET_TYPE_CODE: string;
    STREET_CLASS_CODE: string;
    STREET_SUFFIX_CODE: string;
};

export type StructuredStreetLocality = {
    name?: string;
    type?: { code: string; name?: string };
    class?: { code: string; name?: string };
    suffix?: { code: string; name?: string };
};

export type GeoSiteRecord = {
    GEOCODE_TYPE_CODE: string;
    RELIABILITY_CODE: string;
    LATITUDE: string;
    LONGITUDE: string;
    GEOCODE_SITE_DESCRIPTION: string;
    BOUNDARY_EXTENT: string;
    PLANIMETRIC_ACCURACY: string;
    ELEVATION: string;
    GEOCODE_SITE_NAME: string;
    default?: boolean;
};

export type GeoDefaultRecord = {
    GEOCODE_TYPE_CODE: string;
    LATITUDE: string;
    LONGITUDE: string;
};

export type AddressGeocode = {
    default: boolean;
    type?: { code: string; name?: string };
    reliability?: { code: string; name?: string };
    latitude?: number;
    longitude?: number;
    description?: string;
};

export type NumberRange = {
    prefix?: string;
    number?: number;
    suffix?: string;
    last?: {
        prefix?: string;
        number?: number;
        suffix?: string;
    };
};

export type LevelDetails = {
    type?: { code: string; name?: string };
    prefix?: string;
    number?: number;
    suffix?: string;
};

export type FlatDetails = {
    type?: { code: string; name?: string };
    prefix?: string;
    number?: number;
    suffix?: string;
};

export type LotNumber = {
    prefix?: string;
    number?: string;
    suffix?: string;
};

export type StateSummary = {
    name: string;
    abbreviation: string;
};

export type StructuredAddress = {
    buildingName?: string;
    number?: NumberRange;
    level?: LevelDetails;
    flat?: FlatDetails;
    street: StructuredStreetLocality;
    confidence?: number;
    locality: StructuredLocality;
    postcode?: string;
    lotNumber?: LotNumber;
    state: StateSummary;
};

export type AddressDetails = {
    geocoding?: {
        level?: { code: string; name?: string };
        geocodes: AddressGeocode[];
    };
    structured: StructuredAddress;
    precedence?: "primary" | "secondary";
    pid: string;
    mla: string[];
    sla: string;
    smla?: string[];
    ssla?: string;
};

export type AddressDetailRow = {
    ADDRESS_DETAIL_PID: string;
    ADDRESS_SITE_PID: string;
    STREET_LOCALITY_PID: string;
    LOCALITY_PID: string;
    LEVEL_GEOCODED_CODE: string;
    BUILDING_NAME: string;
    NUMBER_FIRST_PREFIX: string;
    NUMBER_FIRST: string;
    NUMBER_FIRST_SUFFIX: string;
    NUMBER_LAST_PREFIX: string;
    NUMBER_LAST: string;
    NUMBER_LAST_SUFFIX: string;
    LEVEL_TYPE_CODE: string;
    LEVEL_NUMBER_PREFIX: string;
    LEVEL_NUMBER: string;
    LEVEL_NUMBER_SUFFIX: string;
    FLAT_TYPE_CODE: string;
    FLAT_NUMBER_PREFIX: string;
    FLAT_NUMBER: string;
    FLAT_NUMBER_SUFFIX: string;
    CONFIDENCE: string;
    POSTCODE: string;
    LOT_NUMBER_PREFIX: string;
    LOT_NUMBER: string;
    LOT_NUMBER_SUFFIX: string;
    PRIMARY_SECONDARY: string;
};

export type MapPropertyContext = PropertyCodeToNameContext & {
    streetLocalityIndexed: Record<string, StreetLocalityRecord>;
    localityIndexed: Record<string, LocalityRecord>;
    geoIndexed?: Record<string, GeoSiteRecord[]>;
    geoDefaultIndexed?: Record<string, GeoDefaultRecord[]>;
    stateName: string;
    state: string;
};
