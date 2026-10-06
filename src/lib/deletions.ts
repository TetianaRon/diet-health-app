// The Deleted tab (release 2.0): one row per record deleted on any device —
// its ID, the tab it was in, and when — so other devices delete it too when
// they sync. The row itself is removed from its own tab, keeping the sheet
// clean to read. See docs/technical-spec.md → "Local-first app".
export const DELETED_TAB = "Deleted";
export const DELETED_HEADERS = ["Id", "Tab", "DeletedAt"] as const;
