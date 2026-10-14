// Manual end-to-end smoke flow against a running API (npm run dev -w server).
// Usage: node test/e2e-flow.mjs   (API on :3001, DB migrated + seeded)
const B = process.env.API_URL || 'http://localhost:3001/api';
const jar = {};

async function call(who, method, path, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(jar[who] ? { cookie: jar[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.get('set-cookie');
  if (sc) jar[who] = sc.split(';')[0];
  let d = null;
  try { d = await r.json(); } catch { /* empty body */ }
  return { s: r.status, d };
}
const log = (label, r) => console.log(label.padEnd(36), r.s, JSON.stringify(r.d).slice(0, 180));

log('doctor login', await call('doc', 'POST', '/auth/login', { email: 'doctor.sharma@followcare.org', password: 'Password123!' }));
const pts = await call('doc', 'GET', '/patients');
const depts = await call('doc', 'GET', '/departments');
const pt = pts.d.patients[0];
const dept = depts.d.departments.find((d) => d.code === 'CARD');
const f = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const plan = await call('doc', 'POST', '/plans', {
  patient_id: pt.id, department_id: dept.id, window_start: f(5), window_end: f(12),
  urgency: 'priority', reason_category: 'post_procedure_review', channel: 'in_person',
  instructions_text: 'Bring previous reports and fast for 8 hours.', required_tests: ['ECG'], required_documents: []
});
log('create plan', plan);
const pid = plan.d?.plan?.id;
if (pid) {
  log('plan detail', await call('doc', 'GET', '/plans/' + pid));
  log('edit plan (new version)', await call('doc', 'PATCH', '/plans/' + pid, { urgency: 'urgent', change_reason: 'clinical update' }));
}

log('coordinator login', await call('co', 'POST', '/auth/login', { email: 'coord.rahul@followcare.org', password: 'Password123!' }));
const board = await call('co', 'GET', '/tasks/board');
const t = board.d.board.todo[0];
log('task -> in_progress', await call('co', 'PATCH', `/tasks/${t.id}/status`, { status: 'in_progress' }));
log('contact: cannot_travel', await call('co', 'POST', `/tasks/${t.id}/contact-attempts`, { channel: 'phone_call', outcome: 'cannot_travel', notes: 'no transport' }));
log('task -> completed', await call('co', 'PATCH', `/tasks/${t.id}/status`, { status: 'completed' }));
log('coordinator audit-logs (expect 403)', await call('co', 'GET', '/audit-logs'));
log('coordinator create plan (expect 403)', await call('co', 'POST', '/plans', {}));

const otp = await (await fetch(B + '/patient-auth/otp/request', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '+919876543210' })
})).json();
log('patient otp verify', await call('pt', 'POST', '/patient-auth/otp/verify', { phone: '+919876543210', code: otp.debugCode }));
const fu = await call('pt', 'GET', '/me/follow-ups');
log('me/follow-ups', fu);
const mine = Object.values(fu.d).find(Array.isArray) || [];
if (mine[0]) {
  log('acknowledge', await call('pt', 'POST', `/me/follow-ups/${mine[0].id}/acknowledge`));
  log('barrier report', await call('pt', 'POST', '/me/barriers', { plan_id: mine[0].id, barrier_type: 'travel', note: 'far away', requested_callback: true }));
}
log('patient -> staff api (expect 401/403)', await call('pt', 'GET', '/dashboard/metrics'));
log('me/appointments', await call('pt', 'GET', '/me/appointments'));
