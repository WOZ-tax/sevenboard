import { TriageService } from './triage.service';

function daysFromNow(delta: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return d;
}

function makeAction(overrides: Partial<{
  id: string;
  title: string;
  description: string | null;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: Date | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS';
  sourceScreen: string;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? 'a1',
    title: overrides.title ?? 'action',
    description: overrides.description ?? null,
    severity: overrides.severity ?? 'MEDIUM',
    dueDate: overrides.dueDate ?? null,
    status: overrides.status ?? 'NOT_STARTED',
    sourceScreen: overrides.sourceScreen ?? 'MANUAL',
    createdAt: overrides.createdAt ?? new Date(),
  };
}

function createDeps(overrides: {
  actions?: ReturnType<typeof makeAction>[];
  alerts?: unknown[];
  dataHealthSources?: unknown[];
  actionsRejected?: boolean;
  alertsRejected?: boolean;
  dataHealthRejected?: boolean;
} = {}) {
  const prisma = {
    action: {
      findMany: overrides.actionsRejected
        ? jest.fn().mockRejectedValue(new Error('db down'))
        : jest.fn().mockResolvedValue(overrides.actions ?? []),
    },
  };
  const alerts = {
    detectAlerts: overrides.alertsRejected
      ? jest.fn().mockRejectedValue(new Error('mf down'))
      : jest.fn().mockResolvedValue(overrides.alerts ?? []),
  };
  const dataHealth = {
    getStatus: overrides.dataHealthRejected
      ? jest.fn().mockRejectedValue(new Error('health down'))
      : jest.fn().mockResolvedValue({ sources: overrides.dataHealthSources ?? [] }),
  };
  return { prisma, alerts, dataHealth };
}

function createService(deps: ReturnType<typeof createDeps>) {
  return new TriageService(
    deps.prisma as unknown as never,
    deps.alerts as unknown as never,
    deps.dataHealth as unknown as never,
  );
}

describe('TriageService.classify', () => {
  it('bucketizes CRITICAL actions into URGENT', async () => {
    const deps = createDeps({
      actions: [makeAction({ severity: 'CRITICAL', title: 'crisis' })],
    });
    const svc = createService(deps);
    const { signals, summary } = await svc.classify('org-1');
    expect(summary.urgent).toBe(1);
    expect(signals[0].bucket).toBe('URGENT');
    expect(signals[0].reason).toContain('CRITICAL');
  });

  it('bucketizes overdue actions into URGENT even at MEDIUM severity', async () => {
    const deps = createDeps({
      actions: [makeAction({ severity: 'MEDIUM', dueDate: daysFromNow(-2) })],
    });
    const svc = createService(deps);
    const { signals } = await svc.classify('org-1');
    expect(signals[0].bucket).toBe('URGENT');
    expect(signals[0].reason).toMatch(/期限超過/);
  });

  it('bucketizes HIGH severity or within-7-days actions into THIS_WEEK', async () => {
    const deps = createDeps({
      actions: [
        makeAction({ id: 'a1', severity: 'HIGH' }),
        makeAction({ id: 'a2', severity: 'MEDIUM', dueDate: daysFromNow(3) }),
      ],
    });
    const svc = createService(deps);
    const { signals, summary } = await svc.classify('org-1');
    expect(summary.thisWeek).toBe(2);
    expect(signals.every((s) => s.bucket === 'THIS_WEEK')).toBe(true);
  });

  it('routes MEDIUM severity with loose deadlines to MONTHLY, LOW to NOISE', async () => {
    const deps = createDeps({
      actions: [
        makeAction({ id: 'mid', severity: 'MEDIUM' }),
        makeAction({ id: 'low', severity: 'LOW' }),
      ],
    });
    const svc = createService(deps);
    const { summary } = await svc.classify('org-1');
    expect(summary.monthly).toBe(1);
    expect(summary.noise).toBe(1);
  });

  it('picks agent owner from sourceScreen', async () => {
    const deps = createDeps({
      actions: [
        makeAction({ id: 'a1', sourceScreen: 'CASHFLOW' }),
        makeAction({ id: 'a2', sourceScreen: 'MONTHLY_REVIEW' }),
        makeAction({ id: 'a3', sourceScreen: 'AI_REPORT' }),
        makeAction({ id: 'a4', sourceScreen: 'MANUAL' }),
      ],
    });
    const svc = createService(deps);
    const { signals } = await svc.classify('org-1');
    const map = Object.fromEntries(signals.map((s) => [s.refId, s.agentOwner]));
    expect(map['a1']).toBe('sentinel');
    expect(map['a2']).toBe('auditor');
    expect(map['a3']).toBe('drafter');
    expect(map['a4']).toBe('brief');
  });

  it('routes cash-keyword alerts to sentinel agent', async () => {
    const deps = createDeps({
      alerts: [
        {
          id: 'al1',
          severity: 'warning',
          title: 'ランウェイが短縮',
          description: '',
          detectedAt: new Date().toISOString(),
        },
        {
          id: 'al2',
          severity: 'info',
          title: '売上未達',
          description: '',
          detectedAt: new Date().toISOString(),
        },
      ],
    });
    const svc = createService(deps);
    const { signals } = await svc.classify('org-1');
    const cashSignal = signals.find((s) => s.refId === 'al1');
    const nonCashSignal = signals.find((s) => s.refId === 'al2');
    expect(cashSignal?.agentOwner).toBe('sentinel');
    expect(nonCashSignal?.agentOwner).toBe('brief');
  });

  it('produces a FAILED-sync signal in URGENT with auditor owner', async () => {
    const deps = createDeps({
      dataHealthSources: [
        { source: 'MF_CLOUD', lastSyncAt: new Date().toISOString(), status: 'FAILED', errorMessage: 'auth' },
      ],
    });
    const svc = createService(deps);
    const { signals } = await svc.classify('org-1');
    expect(signals).toHaveLength(1);
    expect(signals[0].bucket).toBe('URGENT');
    expect(signals[0].agentOwner).toBe('auditor');
    expect(signals[0].description).toContain('auth');
  });

  it('skips SUCCESS and null-status data sources', async () => {
    const deps = createDeps({
      dataHealthSources: [
        { source: 'MF_CLOUD', lastSyncAt: null, status: 'SUCCESS', errorMessage: null },
        { source: 'KINTONE', lastSyncAt: null, status: null, errorMessage: null },
      ],
    });
    const svc = createService(deps);
    const { signals } = await svc.classify('org-1');
    expect(signals).toHaveLength(0);
  });

  it('sorts URGENT first, then by severity within each bucket', async () => {
    const deps = createDeps({
      actions: [
        makeAction({ id: 'low', severity: 'LOW' }),
        makeAction({ id: 'hi', severity: 'HIGH' }),
        makeAction({ id: 'crit', severity: 'CRITICAL' }),
      ],
    });
    const svc = createService(deps);
    const { signals } = await svc.classify('org-1');
    expect(signals.map((s) => s.refId)).toEqual(['crit', 'hi', 'low']);
  });

  it('swallows upstream failures but still returns a summary', async () => {
    const deps = createDeps({
      actionsRejected: true,
      alertsRejected: true,
      dataHealthRejected: true,
    });
    const svc = createService(deps);
    const { signals, summary } = await svc.classify('org-1');
    expect(signals).toHaveLength(0);
    expect(summary.total).toBe(0);
    expect(summary.lastRunAt).toBeDefined();
  });
});
