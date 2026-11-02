// TODO: Choose the real website anchor. This placeholder intentionally matches
// nothing on most pages; there is no automatic fallback to the page body.
// Set kind to "id", "css", or "xpath" and update value in this one location.
export const PLANNING_TARGET: { kind: 'id' | 'css' | 'xpath'; value: string } = {
  kind: 'css',
  value: '#planning-target',
};
export const PLANNING_ROOT_ID = 'fast-chrome-plugin-planning-view';

// Temporary connectivity check. Replace once the business schema is known.
export const PLANNING_QUERY = 'query { __typename }';
