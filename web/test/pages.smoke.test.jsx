// Renders every route against a RUNNING API (localhost:3001, seeded DB) and fails on any React crash.
import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

// jsdom lacks ResizeObserver (recharts needs it); real browsers have it
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };

const API = 'http://localhost:3001';
let cookie = '';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const full = String(url).startsWith('/') ? API + url : url;
  const headers = { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) };
  const res = await realFetch(full, { ...opts, headers });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return res;
};

async function login(email) {
  cookie = '';
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!' })
  });
  expect(r.status).toBe(200);
}

async function patientLogin() {
  cookie = '';
  const o = await (await fetch('/api/patient-auth/otp/request', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '+919876543210' })
  })).json();
  const r = await fetch('/api/patient-auth/otp/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+919876543210', code: o.debugCode })
  });
  expect(r.status).toBe(200);
}

async function mount(path) {
  cleanup();
  vi.resetModules();
  window.history.pushState({}, '', path);
  const [{ RouterProvider }, { QueryClient, QueryClientProvider }, { AuthProvider }, { router }] = await Promise.all([
    import('react-router-dom'), import('@tanstack/react-query'), import('./../src/auth/AuthContext.jsx'), import('./../src/app/router.jsx')
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const errors = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(String).join(' ')));
  const utils = render(
    <QueryClientProvider client={qc}><AuthProvider><RouterProvider router={router} /></AuthProvider></QueryClientProvider>
  );
  await new Promise((r) => setTimeout(r, 1800)); // let queries settle
  spy.mockRestore();
  return { utils, errors };
}

function assertHealthy(path, { utils, errors }) {
  const text = utils.container.textContent || '';
  const crash = errors.find((e) => /Objects are not valid|Cannot read|is not a function|undefined is not|Unexpected Application Error/.test(e));
  expect(text, `${path}: crashed with router error boundary`).not.toMatch(/Unexpected Application Error/);
  expect(crash, `${path}: ${crash}`).toBeUndefined();
  expect(text.length, `${path}: rendered nothing`).toBeGreaterThan(20);
}

let ids = {};
beforeAll(async () => {
  await login('admin@followcare.org');
  ids.patient = (await (await fetch('/api/patients')).json()).patients[0].id;
  ids.plan = (await (await fetch('/api/plans')).json()).plans[0].id;
});

const STAFF = ['/staff/overview', '/staff/patients', '/staff/plans', '/staff/plans/new', '/staff/tasks',
  '/staff/appointments', '/staff/priority', '/staff/privacy'];

for (const who of ['coord.rahul', 'doctor.sharma', 'nurse.anita', 'hw.priya', 'admin']) {
  describe(`staff pages as ${who}`, () => {
    beforeAll(() => login(`${who}@followcare.org`));
    for (const p of STAFF) {
      it(p, async () => assertHealthy(p, await mount(p)));
    }
    it('patient detail + plan detail', async () => {
      assertHealthy('patient', await mount(`/staff/patients/${ids.patient}`));
      assertHealthy('plan', await mount(`/staff/plans/${ids.plan}`));
    });
  });
}

describe('kanban card drawer', () => {
  beforeAll(() => login('coord.rahul@followcare.org'));
  it('opens every task without crashing', async () => {
    const { utils } = await mount('/staff/tasks');
    const cards = utils.container.querySelectorAll('button[aria-label^="Open task:"]');
    const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(String).join(' ')));
    let clicked = 0;
    for (const c of Array.from(cards)) {
      fireEvent.click(c);
      clicked++;
      await new Promise((r) => setTimeout(r, 150));
      const close = utils.container.querySelector('button[aria-label="Close drawer"]');
      expect(close, 'drawer did not open for ' + c.getAttribute('aria-label')).not.toBeNull();
      expect(utils.container.querySelector('[role="dialog"]').textContent).toMatch(/Priority reasons|Due|Status/);
      fireEvent.click(close);
    }
    spy.mockRestore();
    expect(clicked, 'no task cards found to click').toBeGreaterThan(0);
    expect(errors.find((e) => /Objects are not valid|Cannot read|is not a function/.test(e))).toBeUndefined();
    expect(utils.container.textContent).not.toMatch(/Unexpected Application Error/);
  });
});

describe('patient portal pages', () => {
  beforeAll(patientLogin);
  for (const p of ['/portal/home', '/portal/follow-ups', '/portal/appointments', '/portal/help']) {
    it(p, async () => assertHealthy(p, await mount(p)));
  }
});
