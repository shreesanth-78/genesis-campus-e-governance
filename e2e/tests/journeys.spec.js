import { test, expect } from '@playwright/test';

// End-to-end journeys against the real stack: browser -> Vite -> API -> SQLite. Every role signs in through the
// real screens with the seeded demo accounts. Each role gets its own browser context (its own cookies).

const API = 'http://localhost:4100/api/v1';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const ACCOUNTS = {
  student: { path: 'student', id: 'STU2026001', pw: 'student123' },
  club: { path: 'club', id: 'CLUB001', pw: 'club123' },
  club2: { path: 'club', id: 'CLUB002', pw: 'club123' },
  osa: { path: 'admin/osa', id: 'OSA001', pw: 'osa123' },
  events: { path: 'admin/events', id: 'EVT001', pw: 'events123' },
};

async function signIn(page, who) {
  const a = ACCOUNTS[who];
  await page.goto(`/login/${a.path}`);
  await page.getByLabel('User ID', { exact: true }).fill(a.id);
  await page.getByLabel('Password', { exact: true }).fill(a.pw);
  await page.getByRole('button', { name: /^Sign in/ }).click();
}

/** A fresh browser context, signed in as `who`, landed on its home screen. */
async function as(browser, who, expectText) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  await expect(page.getByText(expectText).first()).toBeVisible();
  return { context, page };
}

const uniq = () => Date.now().toString(36).slice(-5).toUpperCase();

async function fillRequestForm(page, title) {
  await page.getByLabel(/Event title/).fill(title);
  await page.getByLabel(/Category/).selectOption('Technical');
  await page.getByLabel(/Who can attend/).selectOption('All current students');
  await page
    .getByLabel(/^Description/)
    .fill('Teams demo their prototypes to judges and the wider campus audience.');
  await page.getByLabel(/Event date/).fill('2026-10-28');
  await page.getByLabel(/Starts/).fill('17:00');
  await page.getByLabel(/Ends/).fill('20:00');
  await page.locator('#rf-venue').selectOption({ label: 'Seminar Room 3 (holds 45)' });
  await page.getByLabel(/Expected attendance/).fill('40');
  await page.getByLabel(/Registration closes/).fill('2026-10-25');
  await page
    .getByLabel('Event poster')
    .setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: PNG });
  const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.getByLabel('Faculty coordinator permission letter').setInputFiles(pdf('letter.pdf'));
  await page.getByLabel('Event proposal & budget').setInputFiles(pdf('proposal.pdf'));
  await page.getByLabel('Venue booking form').setInputFiles(pdf('venue.pdf'));
}

test.describe('E2E-01 entry screens and sign-in', () => {
  test('three roles, two administrator desks, and the wrong door is refused', async ({ page }) => {
    await page.goto('/');
    for (const t of ['Student', 'Club Authority', 'Administrator']) {
      await expect(
        page
          .getByRole('heading', { name: t })
          .or(page.getByText(t, { exact: true }))
          .first(),
      ).toBeVisible();
    }
    await page.getByText('Administrator', { exact: true }).first().click();
    await expect(page).toHaveURL(/admin-type/);
    await expect(page.getByText('Office of Student Affairs').first()).toBeVisible();
    await expect(page.getByText('Events Section').first()).toBeVisible();

    // a student's correct password on the Administrator screen is refused with the role message
    await page.goto('/login/admin/osa');
    await page.getByLabel('User ID', { exact: true }).fill('STU2026001');
    await page.getByLabel('Password', { exact: true }).fill('student123');
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid User ID or password for the selected role.');

    // the Fill button writes the demo credentials; signing in lands on the right home
    await page.goto('/login/club');
    await page.getByRole('button', { name: 'Fill' }).click();
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page).toHaveURL(/\/club\/dashboard/);
  });

  test('a reload keeps the session; signing out ends it; protected pages send you back', async ({
    browser,
  }) => {
    const { context, page } = await as(browser, 'student', /Good (morning|afternoon|evening), Arjun/);
    await page.reload();
    await expect(page.getByText(/Good (morning|afternoon|evening), Arjun/)).toBeVisible();
    await page.goto('/student/settings');
    await page
      .getByRole('button', { name: /Sign out/ })
      .first()
      .click();
    await page.goto('/student/dashboard');
    await expect(page).toHaveURL(/\/$/);
    await context.close();
  });

  test('every role is kept out of the other portals', async ({ browser }) => {
    const { context, page } = await as(browser, 'student', /Good (morning|afternoon|evening)/);
    await page.goto('/admin/osa/requests');
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await page.goto('/club/requests');
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await context.close();
  });
});

test.describe('E2E-01b sign out from the top-right profile menu', () => {
  for (const [who, home] of [
    ['student', /Good (morning|afternoon|evening), Arjun/],
    ['club', /Google Developer Student Clubs/],
    ['osa', /Welcome back, Meera/],
    ['events', /Welcome back, Rohan/],
  ]) {
    test(`${who}: the user menu Sign out ends the session`, async ({ browser }) => {
      const { context, page } = await as(browser, who, home);
      await page.locator('button[aria-haspopup="menu"]').click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.goto('/student/dashboard');
      await expect(page).toHaveURL(/\/$/); // the session is really gone
      await context.close();
    });
  }
});

test.describe('E2E-02 student registration', () => {
  test('registers, the seat is saved on the server, survives a reload, and can be cancelled', async ({
    browser,
  }) => {
    const { context, page } = await as(browser, 'student', /Good (morning|afternoon|evening), Arjun/);
    await page.goto('/student/events');
    await page.getByText('Data Science After Hours').first().click();
    await page.getByRole('button', { name: /Register for this event/ }).click();
    await expect(page.getByRole('dialog', { name: 'Registration confirmed' })).toBeVisible();
    await page.getByRole('button', { name: 'View registrations' }).click();
    await expect(page.getByText('Data Science After Hours').first()).toBeVisible();

    await page.reload();
    await expect(page.getByText('Data Science After Hours').first()).toBeVisible();

    await page.goto('/student/events');
    await page.getByText('Data Science After Hours').first().click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.goto('/student/registrations');
    await page.reload();
    await expect(page.getByText('Data Science After Hours')).toHaveCount(0);
    await context.close();
  });

  test('a fully booked event cannot be registered, and favourites persist', async ({ browser }) => {
    const { context, page } = await as(browser, 'student', /Good (morning|afternoon|evening)/);
    await page.goto('/student/events');
    await page.getByText('Interfaculty Futsal Cup').first().click();
    await expect(page.getByRole('button', { name: /Fully booked/ })).toBeDisabled();

    await page.goto('/student/clubs');
    const card = page.locator('article', { hasText: 'Amrita CodeChef Chapter' });
    await card.getByRole('button', { name: /favourites/ }).click();
    await page.reload();
    await expect(
      page
        .locator('article', { hasText: 'Amrita CodeChef Chapter' })
        .getByRole('button', { name: /Remove .* from favourites/ }),
    ).toBeVisible();
    await page
      .locator('article', { hasText: 'Amrita CodeChef Chapter' })
      .getByRole('button', { name: /Remove .* from favourites/ })
      .click(); // put it back
    await context.close();
  });

  test('the campus assistant answers from portal data', async ({ browser }) => {
    const { context, page } = await as(browser, 'student', /Good (morning|afternoon|evening)/);
    await page.goto('/student/assistant');
    await page.getByRole('button', { name: 'What events are happening this week?' }).click();
    await expect(page.getByText(/Innovation Sprint/).last()).toBeVisible({ timeout: 20_000 });
    await context.close();
  });
});

test.describe('E2E-03 the approval path, role by role', () => {
  test('club submits, Events Section reviews, OSA approves, Events publishes, a student registers', async ({
    browser,
  }) => {
    const title = `Prototype Showcase ${uniq()}`;

    // 1. Club Authority submits with a poster and documents
    const club = await as(browser, 'club', /Google Developer Student Clubs/);
    await club.page.goto('/club/requests/new');
    await fillRequestForm(club.page, title);
    await club.page.getByRole('button', { name: /Submit for review/ }).click();
    await expect(club.page.getByRole('heading', { name: title })).toBeVisible();
    await expect(club.page.getByText('Under review').first()).toBeVisible();
    const url = club.page.url();
    const id = url.split('/').pop();
    expect(id).toMatch(/^REQ-/);

    // the server holds it: a reload still shows it
    await club.page.reload();
    await expect(club.page.getByRole('heading', { name: title })).toBeVisible();

    // 2. Events Section: online review, hard copy, and no approval button
    const events = await as(browser, 'events', /Welcome back, Rohan/);
    await events.page.goto(`/admin/events/requests/${id}`);
    await events.page.getByRole('button', { name: /Clear online review/ }).click();
    await events.page.getByRole('button', { name: /Record hard-copy check/ }).click();
    await events.page.getByLabel('Hard-copy reference no.').fill('EVT/HC/2026/7001');
    await events.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(events.page.getByText(/EVT\/HC\/2026\/7001/).first()).toBeVisible();
    await expect(events.page.getByRole('button', { name: /Grant final approval/ })).toHaveCount(0);
    await expect(events.page.getByText(/only be granted by authorized OSA staff/i)).toBeVisible();

    // the server refuses the same thing even when the screen is bypassed
    const token = await events.page.evaluate(async () => {
      const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
      return (await r.json()).data.accessToken;
    });
    const bypass = await events.page.request.post(`${API}/gov/actions/finalApprove`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Portal': 'events' },
      data: { args: [id, { note: 'sneaky' }] },
    });
    expect(bypass.status()).toBe(403);

    // 3. OSA gives the final approval
    const osa = await as(browser, 'osa', /Welcome back, Meera/);
    await osa.page.goto(`/admin/osa/requests/${id}`);
    await osa.page.getByRole('button', { name: /Grant final approval/ }).click();
    await osa.page.getByRole('button', { name: /Approve event/ }).click();
    await expect(osa.page.getByText(/Approved · not published/).first()).toBeVisible();

    // not visible to students yet
    const student = await as(browser, 'student', /Good (morning|afternoon|evening), Arjun/);
    await student.page.goto('/student/events');
    await expect(student.page.getByText(title)).toHaveCount(0);

    // 4. Events Section publishes
    await events.page.goto(`/admin/events/requests/${id}`);
    await events.page.getByRole('button', { name: /Publish & notify students/ }).click();
    await events.page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(events.page.getByText(/Live on the Student Dashboard/)).toBeVisible();

    // 5. The student sees the event and the notification, and registers
    await student.page.goto('/student/events');
    await student.page.reload();
    await expect(student.page.getByText(title).first()).toBeVisible();
    await student.page.goto('/student/notifications');
    await expect(student.page.getByText(`${title} just dropped`, { exact: false }).first()).toBeVisible();
    await student.page.goto('/student/events');
    await student.page.getByText(title).first().click();
    await student.page.getByRole('button', { name: /Register for this event/ }).click();
    await expect(student.page.getByRole('dialog', { name: 'Registration confirmed' })).toBeVisible();

    // the uploaded poster is a real file served by the API, not a blob kept in the page
    const posterUrl = await student.page.evaluate(async (reqId) => {
      const t = (
        await (await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })).json()
      ).data.accessToken;
      const st = (
        await (
          await fetch('/api/v1/gov/state', {
            headers: { Authorization: `Bearer ${t}`, 'X-Portal': 'student' },
          })
        ).json()
      ).data;
      return st.requests.find((r) => r.id === reqId)?.poster?.dataUrl;
    }, id);
    expect(posterUrl).toMatch(/^https?:\/\/[^/]+\/api\/v1\/files\/[\w-]+$/);
    expect((await student.page.request.get(posterUrl)).status()).toBe(200);

    for (const c of [club, events, osa, student]) await c.context.close();
  });

  test('corrections are sent back, the club resubmits, and a rejection needs a reason', async ({
    browser,
  }) => {
    const title = `Correction Night ${uniq()}`;
    const club = await as(browser, 'club', /Google Developer Student Clubs/);
    await club.page.goto('/club/requests/new');
    await fillRequestForm(club.page, title);
    await club.page.getByRole('button', { name: /Submit for review/ }).click();
    await expect(club.page.getByRole('heading', { name: title })).toBeVisible();
    const id = club.page.url().split('/').pop();

    const events = await as(browser, 'events', /Welcome back, Rohan/);
    await events.page.goto(`/admin/events/requests/${id}`);
    await events.page.getByRole('button', { name: 'Request corrections' }).click();
    const dialog = events.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Send corrections' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible(); // a reason is required
    await dialog.getByRole('button', { name: 'Missing document' }).click();
    await dialog.getByLabel(/Message to the club/).fill('Attach the safety note.');
    await dialog.getByRole('button', { name: 'Send corrections' }).click();
    await expect(events.page.getByText(/Corrections requested/).first()).toBeVisible();

    await club.page.reload();
    await expect(club.page.getByText('Attach the safety note.')).toBeVisible();
    await club.page.getByRole('link', { name: /Correct & resubmit/ }).click();
    await club.page.getByRole('button', { name: /Resubmit/ }).click();
    await expect(club.page.getByText(/v2|Version 2/).first()).toBeVisible();

    await events.page.reload();
    await events.page.getByRole('button', { name: 'Reject', exact: true }).click();
    const rej = events.page.getByRole('dialog');
    await rej
      .getByRole('button', { name: /^Reject/ })
      .last()
      .click();
    await expect(rej.getByRole('alert')).toBeVisible();
    for (const c of [club, events]) await c.context.close();
  });

  test('a club cannot open another club’s request', async ({ browser }) => {
    const other = await as(browser, 'club2', /Hut Labs/);
    await other.page.goto('/club/requests/REQ-1251');
    await expect(other.page.getByText('Request not available')).toBeVisible();
    await other.context.close();
  });
});

test.describe('E2E-04 club applications and club profile', () => {
  test('the Events Section sees a lock; OSA runs the AI check and approves; students see the new club', async ({
    browser,
  }) => {
    const events = await as(browser, 'events', /Welcome back, Rohan/);
    await events.page.goto('/admin/events/club-applications/CA-502');
    await expect(events.page.getByText(/Only OSA can approve or reject club applications/)).toBeVisible();
    await expect(events.page.getByRole('button', { name: /Approve club/ })).toHaveCount(0);

    const osa = await as(browser, 'osa', /Welcome back, Meera/);
    await osa.page.goto('/admin/osa/club-applications/CA-502');
    await osa.page.getByRole('button', { name: /Run check/ }).click();
    await expect(osa.page.getByText(/Source:/)).toBeVisible();
    await osa.page.getByRole('button', { name: /Approve club/ }).click();
    await expect(osa.page.getByText('Approved').first()).toBeVisible();

    const student = await as(browser, 'student', /Good (morning|afternoon|evening)/);
    await student.page.goto('/student/clubs');
    await expect(student.page.getByText('Chess Society').first()).toBeVisible();
    for (const c of [events, osa, student]) await c.context.close();
  });

  test('a club edits its own profile and students see the new description', async ({ browser }) => {
    const text = `We build and ship campus prototypes ${uniq()}.`;
    const club = await as(browser, 'club', /Google Developer Student Clubs/);
    await club.page.goto('/club/profile');
    const desc = club.page.getByLabel(/^Description/);
    await desc.fill(text);
    await club.page.getByRole('button', { name: /Save changes/ }).click();
    await club.page.reload();
    await expect(club.page.getByLabel(/^Description/)).toHaveValue(text);

    const student = await as(browser, 'student', /Good (morning|afternoon|evening)/);
    await student.page.goto('/student/clubs');
    await expect(student.page.getByText(text).first()).toBeVisible();
    for (const c of [club, student]) await c.context.close();
  });
});

test.describe('E2E-05 every screen opens', () => {
  const sweep = {
    osa: [
      'dashboard',
      'requests',
      'requests/REQ-1244',
      'physical',
      'promotions',
      'club-applications',
      'clubs',
      'clubs/innovation',
      'reports',
      'settings',
    ].map((p) => `/admin/osa/${p}`),
    events: [
      'dashboard',
      'requests',
      'physical',
      'promotions',
      'club-applications',
      'clubs',
      'reports',
      'settings',
    ].map((p) => `/admin/events/${p}`),
    club: [
      'dashboard',
      'profile',
      'members',
      'requests',
      'requests/new',
      'promotions',
      'events',
      'settings',
    ].map((p) => `/club/${p}`),
    student: [
      'dashboard',
      'events',
      'calendar',
      'registrations',
      'clubs',
      'favorites',
      'notifications',
      'assistant',
      'profile',
      'settings',
    ].map((p) => `/student/${p}`),
  };
  for (const [who, paths] of Object.entries(sweep)) {
    test(`${who}: ${paths.length} screens render without errors`, async ({ browser }) => {
      const { context, page } = await as(browser, who, /./);
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const p of paths) {
        await page.goto(p);
        await expect(page.locator('main h1, main h2').first()).toBeVisible();
        await expect(page.getByText(/Page not found/i)).toHaveCount(0);
      }
      expect(errors).toEqual([]);
      await context.close();
    });
  }
});

test.describe('E2E-07 chat and sign-out for every role', () => {
  for (const [who, home] of [
    ['club', /Google Developer Student Clubs/],
    ['osa', /Welcome back, Meera/],
  ]) {
    test(`${who}: the chat answers and Sign out ends the session`, async ({ browser }) => {
      const { context, page } = await as(browser, who, home);
      await page.getByRole('button', { name: 'Open chat assistant' }).click();
      const box = page.getByLabel('Message', { exact: true });
      await box.fill('hello');
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.getByText(/I am the GENESIS assistant/)).toBeVisible();
      await box.fill('What events are happening this week?');
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect(page.getByText(/Innovation Sprint/).last()).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Close chat' }).first().click();

      await page
        .getByRole('button', { name: /^Sign out$/ })
        .first()
        .click();
      await expect(page).toHaveURL(/\/$/);
      await page.goto(
        who === 'student'
          ? '/student/dashboard'
          : who === 'club'
            ? '/club/dashboard'
            : '/admin/osa/dashboard',
      );
      await expect(page).toHaveURL(/\/$/);
      await context.close();
    });
  }
});

test.describe('E2E-08 chat scope', () => {
  test('explains clubs by interest and refuses anything else', async ({ browser }) => {
    const { context, page } = await as(browser, 'student', /Good (morning|afternoon|evening), Arjun/);
    await page.goto('/student/assistant');
    await expect(page.getByRole('button', { name: 'Open chat assistant' })).toHaveCount(0); // students use this page, not the popup
    const box = page.getByLabel('Message Campus AI');
    const send = page.getByRole('button', { name: 'Send', exact: true });
    await box.fill('I like music, which clubs suit me?');
    await send.click();
    await expect(page.getByText(/Raagasudha/).last()).toBeVisible();
    await box.fill('What is GDSC for?');
    await send.click();
    await expect(page.getByText(/developer communities/).last()).toBeVisible();
    await box.fill('solve 12*13+7');
    await send.click();
    await expect(page.getByText(/I can only help with GENESIS Campus Connect/).last()).toBeVisible();
    await context.close();
  });
});

test.describe('E2E-06 demo reset (kept last: it restores the sample data)', () => {
  test('OSA resets the shared demo data', async ({ browser }) => {
    const osa = await as(browser, 'osa', /Welcome back, Meera/);
    await osa.page.goto('/admin/osa/settings');
    await osa.page.getByRole('button', { name: /Reset demo data/ }).click();
    await osa.page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
    await osa.page.goto('/admin/osa/requests');
    await expect(osa.page.getByText(/Prototype Showcase/)).toHaveCount(0);
    await osa.context.close();
  });
});
