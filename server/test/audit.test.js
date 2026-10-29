import { afterEach, describe, expect, it, vi } from 'vitest';

const { poolMock } = vi.hoisted(() => ({
  poolMock: { query: vi.fn() }
}));

vi.mock('../src/config/db.js', () => ({ pool: poolMock }));

import { recordAuditLog } from '../src/middleware/audit.js';

afterEach(() => vi.clearAllMocks());

describe('audit write failure policy', () => {
  it('rejects a sensitive read when its audit record cannot be persisted', async () => {
    poolMock.query.mockRejectedValue(new Error('database unavailable'));

    await expect(recordAuditLog({
      req: { ip: '127.0.0.1', headers: {} },
      action: 'view',
      entityType: 'patients',
      entityId: 'synthetic-patient-id',
      patientId: 'synthetic-patient-id',
      required: true
    })).rejects.toThrow('database unavailable');
  });

  it('keeps non-required audit failures non-fatal', async () => {
    poolMock.query.mockRejectedValue(new Error('database unavailable'));

    await expect(recordAuditLog({
      req: { ip: '127.0.0.1', headers: {} },
      action: 'background_event',
      entityType: 'tasks',
      entityId: 'synthetic-task-id'
    })).resolves.toBeUndefined();
  });
});
