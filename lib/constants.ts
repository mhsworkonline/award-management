/** Single-organization deployment. Every table carries org_id so multi-tenancy
 *  is a matter of resolving this from the session rather than a schema change. */
export const ORG_ID = "00000000-0000-0000-0000-000000000001";

export const PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
