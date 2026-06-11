import {
  whereHasTenantScope,
  resolveAuditMode,
  isTenantScopeViolation,
  TENANT_SCOPED_MODELS,
} from './tenant-scope-audit';

describe('tenant-scope-audit', () => {
  describe('whereHasTenantScope', () => {
    it('detects a top-level tenantId', () => {
      expect(whereHasTenantScope({ tenantId: 't1', orgId: 'o1' })).toBe(true);
    });
    it('detects tenantId nested in an AND array', () => {
      expect(
        whereHasTenantScope({ AND: [{ orgId: 'o1' }, { tenantId: 't1' }] }),
      ).toBe(true);
    });
    it('returns false when tenantId is absent', () => {
      expect(whereHasTenantScope({ orgId: 'o1' })).toBe(false);
      expect(whereHasTenantScope({})).toBe(false);
      expect(whereHasTenantScope(undefined)).toBe(false);
      expect(whereHasTenantScope(null)).toBe(false);
    });
  });

  describe('resolveAuditMode', () => {
    it('defaults to warn for unset/invalid values', () => {
      expect(resolveAuditMode(undefined)).toBe('warn');
      expect(resolveAuditMode('')).toBe('warn');
      expect(resolveAuditMode('bogus')).toBe('warn');
    });
    it('honors off/warn/throw (case-insensitive)', () => {
      expect(resolveAuditMode('off')).toBe('off');
      expect(resolveAuditMode('WARN')).toBe('warn');
      expect(resolveAuditMode('Throw')).toBe('throw');
    });
  });

  describe('isTenantScopeViolation', () => {
    it('flags a bulk read on a tenant-scoped model missing tenantId', () => {
      expect(
        isTenantScopeViolation({
          model: 'ActualEntry',
          action: 'findMany',
          args: { where: { orgId: 'o1' } },
        }),
      ).toBe(true);
    });
    it('passes when tenantId is present', () => {
      expect(
        isTenantScopeViolation({
          model: 'ActualEntry',
          action: 'findMany',
          args: { where: { tenantId: 't1', orgId: 'o1' } },
        }),
      ).toBe(false);
    });
    it('ignores non-audited actions (findUnique by id)', () => {
      expect(
        isTenantScopeViolation({
          model: 'ActualEntry',
          action: 'findUnique',
          args: { where: { id: 'x' } },
        }),
      ).toBe(false);
    });
    it('ignores models not in the tenant-scoped set', () => {
      expect(
        isTenantScopeViolation({
          model: 'Organization',
          action: 'findMany',
          args: { where: {} },
        }),
      ).toBe(false);
    });
    it('membership/audit models are intentionally excluded from the set', () => {
      expect(TENANT_SCOPED_MODELS.has('OrganizationMembership')).toBe(false);
      expect(TENANT_SCOPED_MODELS.has('TenantMembership')).toBe(false);
      expect(TENANT_SCOPED_MODELS.has('AuditLog')).toBe(false);
      expect(TENANT_SCOPED_MODELS.has('Organization')).toBe(false);
    });
  });
});
