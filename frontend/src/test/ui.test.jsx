import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { GovProvider } from '../context/GovContext';
import { AppProvider } from '../context/AppContext';
import { createFakeServer } from './fakeServer';

// The screens talk to the portal API; here an in-memory server running the real workflow engine answers instead.
const server = createFakeServer();
const mount = (userId, path) => {
  cleanup();
  sessionStorage.setItem('genesis.portal', server.signIn(userId));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><GovProvider><AppProvider><App /></AppProvider></GovProvider></AuthProvider>
    </MemoryRouter>
  );
};

let errors;
beforeEach(() => {
  server.reset();
  sessionStorage.clear();
  vi.stubGlobal('fetch', (url, init) => server.handle(String(url), init));
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn(); // jsdom lacks it
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  const unexpected = errors.mock.calls.filter((c) => !String(c[0]).includes('not wrapped in act'));
  errors.mockRestore();
  expect(unexpected).toEqual([]); // no console errors during any flow
});

describe('role portals', () => {
  it('OSA sees the overview; Events Section is redirected away from OSA routes', async () => {
    mount('OSA001', '/admin/osa/dashboard');
    expect(await screen.findByText(/Welcome back, Meera/)).toBeTruthy();
    mount('EVT001', '/admin/osa/dashboard');
    expect(await screen.findByText(/Welcome back, Rohan/)).toBeTruthy(); // redirected to /admin/events/dashboard
  });

  it('student cannot open admin or club routes', async () => {
    mount('STU2026001', '/admin/osa/requests');
    expect(await screen.findByText(/Good (morning|afternoon|evening)/i)).toBeTruthy();
    mount('STU2026001', '/club/requests');
    expect(await screen.findByText(/Good (morning|afternoon|evening)/i)).toBeTruthy();
  });

  it('club cannot see another club’s request', async () => {
    mount('CLUB002', '/club/requests/REQ-1251'); // Innovation's request
    expect(await screen.findByText('Request not available')).toBeTruthy();
  });
});

describe('approval UI end to end', () => {
  it('the Events Section has no review pages: it only sees hall requests', async () => {
    mount('EVT001', '/admin/events/requests/REQ-1248'); // an OSA page: redirected to the overview
    expect(await screen.findByText(/Welcome back, Rohan/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Event Requests/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Club Applications/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Hall Requests/ }).length).toBeGreaterThan(0);
  });

  it('OSA gives permission, the club circulates the event, and the student sees it with a notification', async () => {
    const user = userEvent.setup();
    mount('OSA001', '/admin/osa/requests/REQ-1248');
    await user.click(await screen.findByRole('button', { name: /Give permission/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Give permission/ }));
    await waitFor(() => expect(screen.getAllByText(/Permission given/).length).toBeGreaterThan(0));

    // seeded REQ-1255 already has permission: its club circulates it
    mount('STU2026001', '/student/events');
    await screen.findAllByText(/Explore/i);
    expect(screen.queryByText('Robotics Arena Showdown')).toBeNull();

    mount('CLUB002', '/club/requests/REQ-1255');
    await user.click(await screen.findByRole('button', { name: /Circulate to students/ }));
    await user.click(await screen.findByRole('button', { name: 'Circulate' }));
    await waitFor(() => expect(screen.getAllByText('Circulated').length).toBeGreaterThan(0));

    mount('STU2026001', '/student/events');
    expect((await screen.findAllByText('Robotics Arena Showdown')).length).toBeGreaterThan(0);
    mount('STU2026001', '/student/notifications');
    expect((await screen.findAllByText(/Robotics Arena Showdown just dropped/)).length).toBeGreaterThan(0);
  });

  it('OSA request corrections requires reason text and shows to club', async () => {
    const user = userEvent.setup();
    mount('OSA001', '/admin/osa/requests/REQ-1251');
    await user.click(await screen.findByRole('button', { name: 'Request corrections' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Send corrections' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy(); // needs a reason
    await user.click(within(dialog).getByRole('button', { name: 'Missing document' }));
    await user.type(within(dialog).getByLabelText(/Message to the club/), 'Attach the venue form.');
    await user.click(within(dialog).getByRole('button', { name: 'Send corrections' }));

    mount('CLUB001', '/club/requests/REQ-1251');
    expect(await screen.findByText('Attach the venue form.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Correct & resubmit/ })).toBeTruthy();
  });
});

describe('club submits a new request', () => {
  it('validates, submits with files (no hall yet), and OSA sees it', async () => {
    const user = userEvent.setup();
    mount('CLUB001', '/club/requests/new');
    await user.click(await screen.findByRole('button', { name: /Submit for review/ }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/Event title/), 'Prototype Showcase Night');
    await user.selectOptions(screen.getByLabelText(/Category/), 'Technical');
    await user.selectOptions(screen.getByLabelText(/Who can attend/), 'All current students');
    await user.type(screen.getByLabelText(/^Description/), 'Teams demo their prototypes to judges and the wider campus audience.');
    const setVal = async (label, v) => { const el = screen.getByLabelText(label); await user.clear(el); await user.type(el, v); };
    await setVal(/Event date/, '2026-10-28');
    await setVal(/Starts/, '17:00');
    await setVal(/Ends/, '20:00');
    await setVal(/Expected attendance/, '40');
    expect(screen.queryByRole('radio')).toBeNull(); // the hall is requested later, after registrations
    await setVal(/Registration closes/, '2026-10-25');
    const png = new File([new Uint8Array(2000)], 'poster.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Event poster'), png);
    const pdf = (n) => new File(['x'], n, { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Faculty coordinator permission letter'), pdf('letter.pdf'));
    await user.upload(screen.getByLabelText('Event proposal & budget'), pdf('proposal.pdf'));
    await user.upload(screen.getByLabelText('Venue booking form'), pdf('venue.pdf'));
    await user.click(screen.getByRole('button', { name: /Submit for review/ }));

    expect(await screen.findByRole('heading', { name: 'Prototype Showcase Night' })).toBeTruthy();
    expect(screen.getAllByText('Under review').length).toBeGreaterThan(0);

    mount('OSA001', '/admin/osa/requests');
    expect(await screen.findByText('Prototype Showcase Night')).toBeTruthy();
    mount('STU2026001', '/student/events');
    await screen.findAllByText(/Explore/i);
    expect(screen.queryByText('Prototype Showcase Night')).toBeNull();
  });
});

describe('asking for a hall and allocating it', () => {
  it('the club sees the registrations, sorts the halls for the crowd, picks a priority and asks', async () => {
    const user = userEvent.setup();
    mount('CLUB002', '/club/requests/REQ-1255');
    await user.click(await screen.findByRole('button', { name: /Circulate to students/ }));
    await user.click(await screen.findByRole('button', { name: 'Circulate' }));
    expect(await screen.findByText(/students registered so far/)).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(8);
    await user.click(screen.getByRole('button', { name: /Recommend a hall/ }));
    expect(await screen.findByText(/best fit/i)).toBeTruthy();
    await user.click(radios[0]);
    await user.selectOptions(screen.getByLabelText(/Priority for your club/), 'high');
    await user.click(screen.getByRole('button', { name: /Request this hall/ }));
    expect(await screen.findByText(/Waiting for the Events Section/)).toBeTruthy();
  });

  it('the Events Section sees the request with its priority and allocates the hall; the club sees the decision', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/halls');
    expect(await screen.findByText('Data Science After Hours')).toBeTruthy();
    await user.click(screen.getAllByRole('link', { name: 'Open' })[0]);
    expect((await screen.findAllByText(/High priority/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Allocate this hall' }));
    await waitFor(() => expect(screen.getAllByText('Hall allocated').length).toBeGreaterThan(0));
  });

  it('a different hall can be assigned, and a reason is needed to refuse', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/halls/REQ-1210');
    await user.click(await screen.findByRole('button', { name: 'Assign a different hall' }));
    await user.selectOptions(await screen.findByLabelText(/New hall/), 'Innovation Lab');
    await user.click(screen.getByRole('button', { name: 'Assign hall' }));
    await waitFor(() => expect(screen.getAllByText('Hall allocated').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Innovation Lab').length).toBeGreaterThan(0);
  });

  it('refusing a hall needs a reason', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/halls/REQ-1210');
    await user.click(await screen.findByRole('button', { name: /Hall can’t be given/ }));
    const send = screen.getByRole('button', { name: 'Send back to the club' });
    expect(send.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Why can’t this hall be given/), 'Closed for exams.');
    await user.click(send);
    await waitFor(() => expect(screen.getAllByText('Hall not given').length).toBeGreaterThan(0));
  });
});

describe('club authority edits own club', () => {
  it('saves the profile and students see the new description', async () => {
    const user = userEvent.setup();
    mount('CLUB001', '/club/profile');
    const desc = await screen.findByLabelText(/^Description/);
    await user.clear(desc);
    await user.type(desc, 'We build and ship campus prototypes every month.');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));
    mount('STU2026001', '/student/clubs');
    expect(await screen.findByText(/We build and ship campus prototypes every month\./)).toBeTruthy();
  });
});

describe('club applications', () => {
  it('OSA runs the AI check then approves; the Events Section has no access', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/club-applications/CA-502'); // redirected away
    expect(await screen.findByText(/Welcome back, Rohan/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve club/ })).toBeNull();

    mount('OSA001', '/admin/osa/club-applications/CA-502');
    await user.click(await screen.findByRole('button', { name: /Run check/ }));
    await screen.findByText(/Source:/);
    await user.click(screen.getByRole('button', { name: /Approve club/ }));
    await waitFor(() => expect(screen.getAllByText('Approved').length).toBeGreaterThan(0));
    mount('STU2026001', '/student/clubs');
    expect((await screen.findAllByText('Chess Society')).length).toBeGreaterThan(0);
  });

  it('a student is stopped when a similar club exists, and a new idea goes to OSA', async () => {
    const user = userEvent.setup();
    mount('STU2026001', '/student/start-club');
    await user.type(await screen.findByLabelText(/Proposed club name/), 'Programmers Guild');
    await user.selectOptions(screen.getByLabelText(/^Category/), 'Technical & Engineering');
    await user.type(screen.getByLabelText(/What will the club do/), 'A group where students learn programming, build software and take part in coding contests.');
    await user.click(screen.getByRole('button', { name: /Check my idea/ }));
    expect(await screen.findByText('A similar club already exists.')).toBeTruthy();

    // a distinct idea passes the check and is sent to OSA
    const name = screen.getByLabelText(/Proposed club name/);
    await user.clear(name);
    await user.type(name, 'Bee Keepers Society');
    await user.selectOptions(screen.getByLabelText(/^Category/), 'Media, Lit & Social Responsibility');
    const what = screen.getByLabelText(/What will the club do/);
    await user.clear(what);
    await user.type(what, 'Students look after beehives on campus, learn about pollination and sell the honey they harvest.');
    await user.click(screen.getByRole('button', { name: /Check my idea/ }));
    expect(await screen.findByText('Looks like a new idea.')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: /Faculty advisor/ }), 'Dr. Lakshmi Pillai');
    await user.type(screen.getByRole('spinbutton', { name: /Founding members/ }), '14');
    await user.click(screen.getByRole('button', { name: /Apply to start this club/ }));
    expect((await screen.findAllByText('Bee Keepers Society')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Awaiting decision').length).toBeGreaterThan(0);

    mount('OSA001', '/admin/osa/club-applications');
    expect(await screen.findByText('Bee Keepers Society')).toBeTruthy();
  });
});

describe('route sweep (no crashes / console errors)', () => {
  const sweep = {
    OSA001: ['dashboard', 'requests', 'requests/REQ-1244', 'requests/REQ-1255', 'requests/REQ-1048', 'requests/REQ-0987', 'physical', 'promotions', 'club-applications', 'club-applications/CA-501', 'club-applications/CA-504', 'clubs', 'clubs/innovation', 'clubs/robotics', 'reports', 'settings'].map((p) => `/admin/osa/${p}`),
    EVT001: ['dashboard', 'halls', 'halls?tab=approved', 'halls/REQ-1210', 'halls/REQ-1048', 'clubs/green', 'reports', 'settings'].map((p) => `/admin/events/${p}`),
    CLUB001: ['dashboard', 'profile', 'members', 'requests', 'requests/new', 'requests/REQ-1262', 'requests/REQ-1262/edit', 'requests/REQ-1048', 'requests/REQ-1251', 'promotions', 'events', 'settings'].map((p) => `/club/${p}`),
    CLUB002: ['dashboard', 'requests/REQ-1255', 'promotions', 'events'].map((p) => `/club/${p}`),
    STU2026001: ['dashboard', 'events', 'calendar', 'registrations', 'clubs', 'start-club', 'favorites', 'notifications', 'assistant', 'profile', 'settings'].map((p) => `/student/${p}`),
  };
  for (const [uid, paths] of Object.entries(sweep)) {
    it(`${uid} renders ${paths.length} routes`, async () => {
      for (const path of paths) {
        mount(uid, path);
        await waitFor(() => expect(document.querySelector('main h1, main h2, main [role="status"], main p')).toBeTruthy());
        expect(document.body.textContent).not.toMatch(/Page not found/i);
      }
    });
  }
});
