// Reserved identities: never infer demo mode from an editable name, code or request.
export const DEMO_TENANT_ID = 'd37be079-1e03-4670-9a43-b7b64a235ca1';
export const DEMO_ORG_ID = '03ed3974-ad71-44e4-8e50-6f140cbe31a0';
export const DEMO_USER_ID = 'a05d0672-589d-4881-b065-a9e12b64fcb2';
export const DEMO_COMPANY_NAME = '青空ライフ用品卸株式会社（デモ）';
export const DEMO_CODE = 'DEMO-WHOLESALE';
export const DEMO_AS_OF = '2026-08-31';
export const DEMO_YEAR = 2026;
export const DEMO_MONTH = 8;
export const DEMO_DATA_VERSION = 'wholesale-20260917-v1';
export const isDemoOrg = (id: string | null | undefined) => id === DEMO_ORG_ID;

// Business inputs remain editable. Shared trainees cannot change identities,
// real service credentials, webhook destinations or the accounting source period.
export const DEMO_RESTRICTED_PERMISSIONS = new Set([
  'org:organizations:update',
  'org:organizations:delete',
  'org:users:manage',
  'org:integrations:manage',
  'tenant:organizations:create',
  'tenant:staff:manage',
  'org:briefing:manage',
]);
