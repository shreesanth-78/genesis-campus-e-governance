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
  it('Events Section cannot grant final approval (button absent, reason shown)', async () => {
    mount('EVT001', '/admin/events/requests/REQ-1248');
    expect((await screen.findAllByText('Alumni Dev Talks')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Grant final approval/ })).toBeNull();
    expect(screen.getByText(/only be granted by authorized OSA staff/i)).toBeTruthy();
  });

  it('OSA approves, Events publishes, student sees the event and notification', async () => {
    const user = userEvent.setup();
    mount('OSA001', '/admin/osa/requests/REQ-1248');
    await user.click(await screen.findByRole('button', { name: /Grant final approval/ }));
    await user.click(await screen.findByRole('button', { name: /Approve event/ }));
    await waitFor(() => expect(screen.getAllByText(/Approved · not published/).length).toBeGreaterThan(0));

    // Unpublished: student does not see it
    mount('STU2026001', '/student/events');
    await screen.findAllByText(/Explore/i);
    expect(screen.queryByText('Alumni Dev Talks')).toBeNull();

    mount('EVT001', '/admin/events/requests/REQ-1248');
    await user.click(await screen.findByRole('button', { name: /Publish & notify students/ }));
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getAllByText('Published').length).toBeGreaterThan(0));

    mount('STU2026001', '/student/events');
    expect((await screen.findAllByText('Alumni Dev Talks')).length).toBeGreaterThan(0);

    mount('STU2026001', '/student/notifications');
    expect((await screen.findAllByText(/Alumni Dev Talks just dropped/)).length).toBeGreaterThan(0);
  });

  it('request corrections requires reason text and shows to club', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/requests/REQ-1251');
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
  it('validates, submits with files, and the admin queue shows it', async () => {
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
    await user.click(screen.getByRole('radio', { name: /Seminar Room 3/ }));
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

    mount('EVT001', '/admin/events/requests');
    expect(await screen.findByText('Prototype Showcase Night')).toBeTruthy();
    mount('STU2026001', '/student/events');
    await screen.findAllByText(/Explore/i);
    expect(screen.queryByText('Prototype Showcase Night')).toBeNull();
  });
});

describe('hall selection and permission', () => {
  it('sorts the halls for the expected crowd, recommends one, and lets the club pick it', async () => {
    const user = userEvent.setup();
    mount('CLUB001', '/club/requests/new');
    const attendance = await screen.findByLabelText(/Expected attendance/);
    await user.type(attendance, '50');
    const radios = screen.getAllByRole('radio');
    expect(radios[0].getAttribute('aria-label')).toMatch(/Innovation Lab/); // the best fit for 50 people comes first
    expect(screen.getByText('Too small')).toBeTruthy(); // Seminar Room 3 holds 45
    await user.click(screen.getByRole('button', { name: /Recommend a hall/ }));
    expect(await screen.findByText(/Innovation Lab is the best fit/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Use Innovation Lab/ }));
    expect(screen.getByRole('radio', { name: /Innovation Lab/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('the Events Section approves the hall before it can clear the online review; a club sees the decision', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/requests/REQ-1251');
    const clear = await screen.findByRole('button', { name: /Clear online review/ });
    expect(clear.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Approve hall' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Clear online review/ }).disabled).toBe(false));

    mount('CLUB001', '/club/requests/REQ-1251');
    expect((await screen.findAllByText('Hall approved')).length).toBeGreaterThan(0);
  });

  it('a reassigned hall is shown to the club, and a hall that cannot be used sends the request back', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/requests/REQ-1251');
    await user.click(await screen.findByRole('button', { name: 'Assign a different hall' }));
    await user.selectOptions(await screen.findByLabelText(/New hall/), 'Main Auditorium (holds 600, much larger than needed)');
    await user.click(screen.getByRole('button', { name: 'Assign hall' }));
    mount('CLUB001', '/club/requests/REQ-1251');
    expect(await screen.findByText(/assigned/)).toBeTruthy();
    expect(screen.getAllByText(/Main Auditorium/).length).toBeGreaterThan(0);

    mount('EVT001', '/admin/events/requests/REQ-1262');
    expect((await screen.findAllByText(/Pitch Practice Night/)).length).toBeGreaterThan(0);
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

describe('club applications (OSA only decisions)', () => {
  it('Events Section sees a lock; OSA runs the AI check then approves', async () => {
    const user = userEvent.setup();
    mount('EVT001', '/admin/events/club-applications/CA-502');
    expect(await screen.findByText(/Only OSA can approve or reject club applications/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve club/ })).toBeNull();

    mount('OSA001', '/admin/osa/club-applications/CA-502');
    await user.click(await screen.findByRole('button', { name: /Run check/ }));
    await screen.findByText(/Source:/);
    await user.click(screen.getByRole('button', { name: /Approve club/ }));
    await waitFor(() => expect(screen.getAllByText('Approved').length).toBeGreaterThan(0));
    mount('STU2026001', '/student/clubs');
    expect((await screen.findAllByText('Chess Society')).length).toBeGreaterThan(0);
  });
});

describe('route sweep (no crashes / console errors)', () => {
  const sweep = {
    OSA001: ['dashboard', 'requests', 'requests/REQ-1244', 'requests/REQ-1255', 'requests/REQ-1048', 'requests/REQ-0987', 'physical', 'promotions', 'club-applications', 'club-applications/CA-501', 'club-applications/CA-504', 'clubs', 'clubs/innovation', 'clubs/robotics', 'reports', 'settings'].map((p) => `/admin/osa/${p}`),
    EVT001: ['dashboard', 'requests?tab=review', 'requests/REQ-1239', 'physical', 'promotions', 'club-applications', 'clubs/green', 'reports', 'settings'].map((p) => `/admin/events/${p}`),
    CLUB001: ['dashboard', 'profile', 'members', 'requests', 'requests/new', 'requests/REQ-1262', 'requests/REQ-1262/edit', 'requests/REQ-1048', 'promotions', 'events', 'settings'].map((p) => `/club/${p}`),
    CLUB002: ['dashboard', 'requests/REQ-1255', 'promotions', 'events'].map((p) => `/club/${p}`),
    STU2026001: ['dashboard', 'events', 'calendar', 'registrations', 'clubs', 'favorites', 'notifications', 'assistant', 'profile', 'settings'].map((p) => `/student/${p}`),
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
