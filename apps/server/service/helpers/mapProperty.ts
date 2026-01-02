import { logger } from "../index";
import {
    AddressDetailRow,
    AddressDetails,
    AddressGeocode,
    FlatDetails,
    GeoDefaultRecord,
    GeoSiteRecord,
    LevelDetails,
    LocalityRecord,
    LotNumber,
    MapPropertyContext,
    NumberRange,
    StreetLocalityRecord,
    StructuredAddress,
    StructuredLocality,
    StructuredStreetLocality,
} from "../types/gnaf-properties";
import {
    type PropertyCodeToNameContext,
    flatTypeCodeToName,
    geocodeReliabilityCodeToName,
    geocodeTypeCodeToName,
    levelGeocodedCodeToName,
    levelTypeCodeToName,
    localityClassCodeToName,
    streetClassCodeToName,
    streetSuffixCodeToName,
    streetTypeCodeToName,
} from "./propertyCodeToName";

/**
 * Maps a locality object to a structured locality object.
 *
 * @param l - The locality object to map.
 * @param context - The context containing the authority code tables.
 * @returns The structured locality object.
 */
export const mapLocality = (
    l: LocalityRecord,
    context: PropertyCodeToNameContext,
): StructuredLocality => {
    return {
        // If the locality name is not empty, add it to the structured locality object
        ...(l.LOCALITY_NAME !== "" && {
            name: l.LOCALITY_NAME,
        }),
        // If the locality class code is not empty, add it to the structured locality object
        ...(l.LOCALITY_CLASS_CODE !== "" && {
            class: {
                code: l.LOCALITY_CLASS_CODE,
                name: localityClassCodeToName(l.LOCALITY_CLASS_CODE, context),
            },
        }),
    };
};

/**
 * Maps a street locality row into its structured representation.
 *
 * @param l - The street locality record to structure.
 * @param context - The lookup context supplying authority code names.
 * @returns The structured street locality with decoded codes.
 */
export const mapStreetLocality = (
    l: StreetLocalityRecord,
    context: PropertyCodeToNameContext,
): StructuredStreetLocality => {
    return {
        ...(l.STREET_NAME !== "" && {
            name: l.STREET_NAME,
        }),
        ...(l.STREET_TYPE_CODE !== "" && {
            type: {
                code: l.STREET_TYPE_CODE,
                name: streetTypeCodeToName(l.STREET_TYPE_CODE, context, l),
            },
        }),
        ...(l.STREET_CLASS_CODE !== "" && {
            class: {
                code: l.STREET_CLASS_CODE,
                name: streetClassCodeToName(l.STREET_CLASS_CODE, context, l),
            },
        }),
        ...(l.STREET_SUFFIX_CODE !== "" && {
            suffix: {
                code: l.STREET_SUFFIX_CODE,
                name: streetSuffixCodeToName(l.STREET_SUFFIX_CODE, context),
            },
        }),
    };
};

/**
 * Maps geocode rows (site and default) into a structured list of geocodes.
 *
 * @param geoSite - Site geocode records for an address site.
 * @param context - The lookup context supplying authority code names.
 * @param geoDefault - Default geocode records for the address detail.
 * @returns Structured geocode entries with decoded codes.
 * @throws If unsupported geocode attributes are encountered.
 */
export const mapGeo = (
    geoSite: GeoSiteRecord[] | undefined,
    context: PropertyCodeToNameContext,
    geoDefault?: GeoDefaultRecord[],
): AddressGeocode[] => {
    let foundDefault = false;
    if (geoSite && geoDefault) {
        for (const geo of geoSite) {
            if (
                geo.GEOCODE_TYPE_CODE === geoDefault[0].GEOCODE_TYPE_CODE &&
                geo.LATITUDE === geoDefault[0].LATITUDE &&
                geo.LONGITUDE === geoDefault[0].LONGITUDE
            ) {
                foundDefault = true;
                geo.default = true;
            } else {
                geo.default = false;
            }
        }
    }
    const sites = geoSite
        ? geoSite.map((geo) => {
              if (geo.BOUNDARY_EXTENT !== "") {
                  console.log("be", geo);
                  throw new Error("encounterd geo.BOUNDARY_EXTENT");
              }
              if (geo.PLANIMETRIC_ACCURACY !== "") {
                  console.log("pa", geo);
                  throw new Error("encounterd geo.PLANIMETRIC_ACCURACY");
              }
              if (geo.ELEVATION !== "") {
                  console.log("e", geo);
                  throw new Error("encounterd geo.ELEVATION");
              }
              if (geo.GEOCODE_SITE_NAME !== "") {
                  console.log("gsn", geo);
                  throw new Error("encounterd geo.GEOCODE_SITE_NAME");
              }
              return {
                  default: geo.default || false,
                  ...(geo.GEOCODE_TYPE_CODE !== "" && {
                      type: {
                          code: geo.GEOCODE_TYPE_CODE,
                          name: geocodeTypeCodeToName(
                              geo.GEOCODE_TYPE_CODE,
                              context,
                          ),
                      },
                  }),
                  ...(geo.RELIABILITY_CODE !== "" && {
                      reliability: {
                          code: geo.RELIABILITY_CODE,
                          name: geocodeReliabilityCodeToName(
                              geo.RELIABILITY_CODE,
                              context,
                          ),
                      },
                  }),
                  ...(geo.LATITUDE !== "" && {
                      latitude: Number.parseFloat(geo.LATITUDE),
                  }),
                  ...(geo.LONGITUDE !== "" && {
                      longitude: Number.parseFloat(geo.LONGITUDE),
                  }),
                  ...(geo.GEOCODE_SITE_DESCRIPTION !== "" && {
                      description: geo.GEOCODE_SITE_DESCRIPTION,
                  }),
              };
          })
        : [];
    const def =
        geoDefault && !foundDefault
            ? geoDefault.map((geo) => {
                  return {
                      default: true,
                      ...(geo.GEOCODE_TYPE_CODE !== "" && {
                          type: {
                              code: geo.GEOCODE_TYPE_CODE,
                              name: geocodeTypeCodeToName(
                                  geo.GEOCODE_TYPE_CODE,
                                  context,
                              ),
                          },
                      }),
                      ...(geo.LATITUDE !== "" && {
                          latitude: Number.parseFloat(geo.LATITUDE),
                      }),
                      ...(geo.LONGITUDE !== "" && {
                          longitude: Number.parseFloat(geo.LONGITUDE),
                      }),
                  };
              })
            : [];
    return sites.concat(def);
};

/**
 * Joins a formatted local address into a single string.
 *
 * @param fla - The formatted locality address components.
 * @returns The single line address.
 */
export const mapToSla = (fla: string[]): string => {
    return fla.join(", ");
};

/**
 * Builds the multi-line address representation for an address.
 *
 * @param s - The structured address to format.
 * @returns The multi-line address array.
 * @throws When the formatted address exceeds four lines.
 */
// eslint-disable-next-line complexity
export const mapToMla = (s: StructuredAddress): string[] => {
    const fla: string[] = [];
    if (s.level) {
        fla.push(
            `${s.level.type?.name ?? ""} ${s.level.prefix || ""}${
                s.level.number || ""
            }${s.level.suffix || ""}`,
        );
    }

    if (s.flat) {
        fla.push(
            `${s.flat.type?.name ?? ""} ${s.flat.prefix || ""}${
                s.flat.number || ""
            }${s.flat.suffix || ""}`,
        );
    }

    if (s.buildingName) {
        fla.push(s.buildingName);
    }

    if (fla.length === 3) {
        fla[1] = `${fla[0]}, ${fla[1]}`;
        fla.shift();
    }

    let number = "";
    if (s.lotNumber && s.number === undefined) {
        number = `LOT ${s.lotNumber.prefix || ""}${s.lotNumber.number || ""}${
            s.lotNumber.suffix || ""
        }`;
    } else if (s.number) {
        number = `${s.number.prefix || ""}${s.number.number || ""}${
            s.number.suffix || ""
        }`;
        if (s.number.last) {
            number = `${number}-${s.number.last.prefix || ""}${
                s.number.last.number || ""
            }${s.number.last.suffix || ""}`;
        }
    }

    const streetType = s.street.type?.name ? ` ${s.street.type.name}` : "";
    const streetSuffix = s.street.suffix?.name
        ? ` ${s.street.suffix.name}`
        : "";
    const street = `${s.street.name ?? ""}${streetType}${streetSuffix}`;

    fla.push(`${number} ${street}`);

    fla.push(
        `${s.locality.name ?? ""} ${s.state.abbreviation} ${s.postcode ?? ""}`,
    );

    if (fla.length > 4) {
        logger("FLA TOO LONG", fla, s);
        throw new Error("FLA TOO LONG");
    }
    return fla;
};

/**
 * Builds the short-form multi-line address representation for an address.
 *
 * @param s - The structured address to format.
 * @returns The short-form multi-line address array.
 * @throws When the formatted address exceeds four lines.
 */
// eslint-disable-next-line complexity
export const mapToShortMla = (s: StructuredAddress): string[] => {
    const fla: string[] = [];
    if (s.level) {
        fla.push(
            `${s.level.type?.code ?? ""}${s.level.prefix || ""}${
                s.level.number || ""
            }${s.level.suffix || ""}`,
        );
    }

    let number = "";
    if (s.flat) {
        number = `${s.flat.prefix || ""}${s.flat.number || ""}${
            s.flat.suffix || ""
        }/`;
    }
    if (s.lotNumber && s.number === undefined) {
        number = `${number}${s.lotNumber.prefix || ""}${s.lotNumber.number || ""}${
            s.lotNumber.suffix || ""
        }`;
    } else if (s.number) {
        number = `${number}${s.number.prefix || ""}${s.number.number || ""}${
            s.number.suffix || ""
        }`;
        if (s.number.last) {
            number = `${number}-${s.number.last.prefix || ""}${
                s.number.last.number || ""
            }${s.number.last.suffix || ""}`;
        }
    }

    const streetType = s.street.type?.name ? ` ${s.street.type.name}` : "";
    const streetSuffix = s.street.suffix?.code
        ? ` ${s.street.suffix.code}`
        : "";
    const street = `${s.street.name ?? ""}${streetType}${streetSuffix}`;

    fla.push(`${number} ${street}`);

    fla.push(
        `${s.locality.name ?? ""} ${s.state.abbreviation} ${s.postcode ?? ""}`,
    );

    if (fla.length > 4) {
        logger("FLA TOO LONG", fla, s);
        throw new Error("FLA TOO LONG");
    }
    return fla;
};

/**
 * Maps a raw address detail row into a fully structured address with geocodes.
 *
 * @param d - The raw address detail row from G-NAF.
 * @param context - The lookup context containing authority codes and indexes.
 * @param i - The current row index for optional progress logging.
 * @param count - Total row count for optional progress logging.
 * @returns The structured address with formatted variants.
 */
// eslint-disable-next-line complexity
export const mapAddressDetails = (
    d: AddressDetailRow,
    context: MapPropertyContext,
    i?: number,
    count?: number,
): AddressDetails => {
    const streetLocality = context.streetLocalityIndexed[d.STREET_LOCALITY_PID];
    const locality = context.localityIndexed[d.LOCALITY_PID];

    const geoSite = context.geoIndexed
        ? context.geoIndexed[d.ADDRESS_SITE_PID]
        : undefined;
    const geoDefault = context.geoDefaultIndexed
        ? context.geoDefaultIndexed[d.ADDRESS_DETAIL_PID]
        : undefined;
    const hasGeo =
        d.LEVEL_GEOCODED_CODE !== "" &&
        ((geoSite !== undefined && geoSite.length > 0) ||
            (geoDefault !== undefined && geoDefault.length > 0));
    const geocoding =
        d.LEVEL_GEOCODED_CODE !== "" && hasGeo
            ? {
                  ...(d.LEVEL_GEOCODED_CODE !== "" && {
                      level: {
                          code: d.LEVEL_GEOCODED_CODE,
                          name: levelGeocodedCodeToName(
                              d.LEVEL_GEOCODED_CODE,
                              context,
                          ),
                      },
                  }),
                  ...(hasGeo && {
                      geocodes: mapGeo(geoSite, context, geoDefault),
                  }),
              }
            : undefined;
    const structured: StructuredAddress = {
        ...(d.BUILDING_NAME !== "" && {
            buildingName: d.BUILDING_NAME,
        }),
        ...((d.NUMBER_FIRST_PREFIX !== "" ||
            d.NUMBER_FIRST !== "" ||
            d.NUMBER_FIRST_SUFFIX !== "") && {
            number: {
                ...(d.NUMBER_FIRST_PREFIX !== "" && {
                    prefix: d.NUMBER_FIRST_PREFIX,
                }),
                ...(d.NUMBER_FIRST !== "" && {
                    number: Number.parseInt(d.NUMBER_FIRST),
                }),
                ...(d.NUMBER_FIRST_SUFFIX !== "" && {
                    suffix: d.NUMBER_FIRST_SUFFIX,
                }),
                ...((d.NUMBER_LAST_PREFIX !== "" ||
                    d.NUMBER_LAST !== "" ||
                    d.NUMBER_LAST_SUFFIX !== "") && {
                    last: {
                        ...(d.NUMBER_LAST_PREFIX !== "" && {
                            prefix: d.NUMBER_LAST_PREFIX,
                        }),
                        ...(d.NUMBER_LAST !== "" && {
                            number: Number.parseInt(d.NUMBER_LAST),
                        }),
                        ...(d.NUMBER_LAST_SUFFIX !== "" && {
                            suffix: d.NUMBER_LAST_SUFFIX,
                        }),
                    },
                }),
            } satisfies NumberRange,
        }),
        ...((d.LEVEL_TYPE_CODE !== "" ||
            d.LEVEL_NUMBER_PREFIX !== "" ||
            d.LEVEL_NUMBER !== "" ||
            d.LEVEL_NUMBER_SUFFIX !== "") && {
            level: {
                ...(d.LEVEL_TYPE_CODE !== "" && {
                    type: {
                        code: d.LEVEL_TYPE_CODE,
                        name: levelTypeCodeToName(
                            d.LEVEL_TYPE_CODE,
                            context,
                            d,
                        ),
                    },
                }),
                ...(d.LEVEL_NUMBER_PREFIX !== "" && {
                    prefix: d.LEVEL_NUMBER_PREFIX,
                }),
                ...(d.LEVEL_NUMBER !== "" && {
                    number: Number.parseInt(d.LEVEL_NUMBER),
                }),
                ...(d.LEVEL_NUMBER_SUFFIX !== "" && {
                    suffix: d.LEVEL_NUMBER_SUFFIX,
                }),
            } satisfies LevelDetails,
        }),
        ...((d.FLAT_TYPE_CODE !== "" ||
            d.FLAT_NUMBER_PREFIX !== "" ||
            d.FLAT_NUMBER !== "" ||
            d.FLAT_NUMBER_SUFFIX !== "") && {
            flat: {
                ...(d.FLAT_TYPE_CODE !== "" && {
                    type: {
                        code: d.FLAT_TYPE_CODE,
                        name: flatTypeCodeToName(d.FLAT_TYPE_CODE, context, d),
                    },
                }),
                ...(d.FLAT_NUMBER_PREFIX !== "" && {
                    prefix: d.FLAT_NUMBER_PREFIX,
                }),
                ...(d.FLAT_NUMBER !== "" && {
                    number: Number.parseInt(d.FLAT_NUMBER),
                }),
                ...(d.FLAT_NUMBER_SUFFIX !== "" && {
                    suffix: d.FLAT_NUMBER_SUFFIX,
                }),
            } satisfies FlatDetails,
        }),
        // May need to include street locality aliases here
        street: mapStreetLocality(streetLocality, context),
        ...(d.CONFIDENCE !== "" && {
            confidence: Number.parseInt(d.CONFIDENCE),
        }),
        locality: mapLocality(locality, context),
        ...(d.POSTCODE !== "" && {
            postcode: d.POSTCODE,
        }),
        ...((d.LOT_NUMBER_PREFIX !== "" ||
            d.LOT_NUMBER !== "" ||
            d.LOT_NUMBER_SUFFIX !== "") && {
            lotNumber: {
                ...(d.LOT_NUMBER_PREFIX !== "" && {
                    prefix: d.LOT_NUMBER_PREFIX,
                }),
                ...(d.LOT_NUMBER !== "" && {
                    number: d.LOT_NUMBER,
                }),
                ...(d.LOT_NUMBER_SUFFIX !== "" && {
                    suffix: d.LOT_NUMBER_SUFFIX,
                }),
            } satisfies LotNumber,
        }),
        state: {
            name: context.stateName,
            abbreviation: context.state,
        },
    };

    const precedence =
        d.PRIMARY_SECONDARY !== ""
            ? d.PRIMARY_SECONDARY === "P"
                ? "primary"
                : "secondary"
            : undefined;

    const mla = mapToMla(structured);
    const smla =
        structured.flat !== undefined ? mapToShortMla(structured) : undefined;

    const rval: AddressDetails = {
        ...(geocoding ? { geocoding } : {}),
        structured,
        ...(precedence ? { precedence } : {}),
        pid: d.ADDRESS_DETAIL_PID,
        mla,
        sla: mapToSla(mla),
        ...(smla ? { smla, ssla: mapToSla(smla) } : {}),
    };

    if (count) {
        if (
            i &&
            Math.ceil(count / 100) !== 0 &&
            i % Math.ceil(count / 100) === 0
        ) {
            logger("addr", JSON.stringify(rval, undefined, 2));
            logger(`${(i / count) * 100}%`);
        }
    } else if ((i || 0) % 10000 === 0) {
        logger("addr", JSON.stringify(rval, undefined, 2));
        logger(`${i} rows`);
    }
    return rval;
};

export const mapAuthCodeTableToSynonymList = (
    table: { CODE: string; NAME: string }[],
): string[] => {
    return table
        .filter((type) => type.CODE !== type.NAME)
        .map((type) => `${type.CODE} => ${type.NAME}`);
};
