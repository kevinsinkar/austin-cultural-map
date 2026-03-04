import { NORMALIZED_PROP } from "./auditedData";

/**
 * Re-export normalized property data. Field names are already
 * canonical (median_home_value, median_rent_monthly, etc.)
 * after normalization in auditedData.js.
 */
export const PROPERTY_DATA = NORMALIZED_PROP;
