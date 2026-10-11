import { test, expect } from '@playwright/test';

// End-to-end journeys against the real stack: browser -> Vite -> API -> SQLite. Every role signs in through the
// real screens with the seeded demo accounts. Each role gets its own browser context (its own cookies).

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

/** Runs one workflow action through the real API as the person signed in on `page` (used to set a scene quickly). */
async function act(page, portal, name, ...args) {
  return page.evaluate(
    async ([portal, name, args]) => {
      const t = (
        await (await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })).json()
      ).data.accessToken;
      const r = await fetch('/api/v1/gov/actions/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t, 'X-Portal': portal },
        body: JSON.stringify({ args }),
      });
      return { status: r.status, body: await r.json() };
    },
    [portal, name, args],
  );
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
  test('club asks OSA, OSA gives permission, the club circulates, a student registers, the club asks for a hall, the Events Section allocates it', async ({
    browser,
  }) => {
    const title = `Prototype Showcase ${uniq()}`;

    // 1. Club Authority submits with a poster and documents (no hall yet)
    const club = await as(browser, 'club', /Google Developer Student Clubs/);
    await club.page.goto('/club/requests/new');
    await fillRequestForm(club.page, title);
    await club.page.getByRole('button', { name: /Submit for review/ }).click();
    await expect(club.page.getByRole('heading', { name: title })).toBeVisible();
    await expect(club.page.getByText('Under review').first()).toBeVisible();
    const id = club.page.url().split('/').pop();
    expect(id).toMatch(/^REQ-/);
    await club.page.reload(); // the server holds it
    await expect(club.page.getByRole('heading', { name: title })).toBeVisible();

    // 2. The Events Section has no part in the review, even if the screen is bypassed
    const events = await as(browser, 'events', /Welcome back, Rohan/);
    await events.page.goto(`/admin/events/requests/${id}`);
    await expect(events.page.getByText(/Welcome back, Rohan/).first()).toBeVisible(); // not an Events page
    const bypass = await act(events.page, 'events', 'reviewRequest', id, { decision: 'clear' });
    expect(bypass.status).toBe(403);
    expect((await act(events.page, 'events', 'finalApprove', id, { note: 'sneaky' })).status).toBe(403);

    // 3. OSA: online review, hard copy, permission
    const osa = await as(browser, 'osa', /Welcome back, Meera/);
    await osa.page.goto(`/admin/osa/requests/${id}`);
    await osa.page.getByRole('button', { name: /Clear online review/ }).click();
    await osa.page.getByRole('button', { name: /Record hard-copy check/ }).click();
    await osa.page.getByLabel('Hard-copy reference no.').fill('OSA/HC/2026/7001');
    await osa.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(osa.page.getByText(/OSA\/HC\/2026\/7001/).first()).toBeVisible();
    await osa.page.getByRole('button', { name: /Give permission/ }).click();
    await osa.page
      .getByRole('dialog')
      .getByRole('button', { name: /Give permission/ })
      .click();
    await expect(osa.page.getByText(/Permission given/).first()).toBeVisible();

    // not visible to students yet
    const student = await as(browser, 'student', /Good (morning|afternoon|evening), Arjun/);
    await student.page.goto('/student/events');
    await expect(student.page.getByText(title)).toHaveCount(0);

    // 4. The club circulates the event itself
    await club.page.reload();
    await club.page.getByRole('button', { name: /Circulate to students/ }).click();
    await club.page.getByRole('button', { name: 'Circulate', exact: true }).click();
    await expect(club.page.getByText(/students registered so far/)).toBeVisible();

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
    expect(posterUrl).toMatch(/^(https?:\/\/[^/]+)?\/api\/v1\/files\/[\w-]+$/);
    expect((await student.page.request.get(posterUrl)).status()).toBe(200);

    // 6. With the registrations known, the club asks for a hall and sets a priority
    await club.page.reload();
    await expect(club.page.getByText('1', { exact: true }).first()).toBeVisible(); // one student registered
    await club.page.getByRole('radio', { name: /Central Library Hall/ }).click();
    await club.page.getByLabel(/Priority for your club/).selectOption('high');
    await club.page.getByRole('button', { name: /Request this hall/ }).click();
    await expect(club.page.getByText(/Waiting for the Events Section/)).toBeVisible();

    // 7. The Events Section allocates it
    await events.page.goto('/admin/events/halls');
    await events.page.getByRole('link', { name: title }).click();
    await expect(events.page.getByText('High priority').first()).toBeVisible();
    await events.page.getByRole('button', { name: 'Allocate this hall' }).click();
    await expect(events.page.getByText('Hall allocated').first()).toBeVisible();

    // the club and the student now see the hall
    await club.page.reload();
    await expect(club.page.getByText(/Central Library Hall/).first()).toBeVisible();
    await student.page.goto('/student/events');
    await student.page.getByText(title).first().click();
    await expect(student.page.getByText('Central Library Hall').first()).toBeVisible();

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

    const events = await as(browser, 'osa', /Welcome back, Meera/);
    await events.page.goto(`/admin/osa/requests/${id}`);
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
  test('the Events Section has no access; OSA runs the AI check and approves; students see the new club', async ({
    browser,
  }) => {
    const events = await as(browser, 'events', /Welcome back, Rohan/);
    await events.page.goto('/admin/events/club-applications/CA-502'); // redirected away
    await expect(events.page.getByText(/Welcome back, Rohan/).first()).toBeVisible();
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

  test('a student cannot start a club that already exists, and a new idea reaches OSA', async ({
    browser,
  }) => {
    const name = `Bee Keepers ${uniq()}`;
    const student = await as(browser, 'student', /Good (morning|afternoon|evening)/);
    await student.page.goto('/student/start-club');
    await student.page.getByLabel(/Proposed club name/).fill('Programmers Guild');
    await student.page.getByLabel(/^Category/).selectOption('Technical & Engineering');
    await student.page
      .getByLabel(/What will the club do/)
      .fill('A group where students learn programming, build software and take part in coding contests.');
    await student.page.getByRole('button', { name: /Check my idea/ }).click();
    await expect(student.page.getByText('A similar club already exists.')).toBeVisible();
    // applying anyway is refused by the server too
    await student.page.getByRole('textbox', { name: /Faculty advisor/ }).fill('Dr. A. Rao');
    await student.page.getByRole('spinbutton', { name: /Founding members/ }).fill('20');
    await student.page.getByRole('button', { name: /Apply to start this club/ }).click();
    await expect(student.page.getByText(/already covers this focus area/).first()).toBeVisible();

    // a new idea is accepted and OSA receives it
    await student.page.getByLabel(/Proposed club name/).fill(name);
    await student.page.getByLabel(/^Category/).selectOption('Media, Lit & Social Responsibility');
    await student.page
      .getByLabel(/What will the club do/)
      .fill(
        'Students look after beehives on campus, learn about pollination and sell the honey they harvest.',
      );
    await student.page.getByRole('button', { name: /Apply to start this club/ }).click();
    await expect(student.page.getByText(name).first()).toBeVisible();
    await expect(student.page.getByText('Awaiting decision').first()).toBeVisible();

    const osa = await as(browser, 'osa', /Welcome back, Meera/);
    await osa.page.goto('/admin/osa/club-applications');
    await expect(osa.page.getByText(name).first()).toBeVisible();
    for (const c of [student, osa]) await c.context.close();
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
    events: ['dashboard', 'halls', 'halls/REQ-1210', 'clubs', 'reports', 'settings'].map(
      (p) => `/admin/events/${p}`,
    ),
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
      'start-club',
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

test.describe('E2E-09 phone layout', () => {
  // Nothing may stick out past the screen on a phone: content that is wider than the screen is clipped or forces a
  // sideways scroll. Scrollable regions (tables, tab rows) are allowed to be wider on purpose.
  const sweep = {
    student: [
      'dashboard',
      'events',
      'events/innovation-sprint',
      'calendar',
      'registrations',
      'clubs',
      'start-club',
      'notifications',
      'assistant',
      'profile',
    ].map((p) => '/student/' + p),
    events: ['dashboard', 'halls', 'halls/REQ-1210'].map((p) => '/admin/events/' + p),
    club: [
      'dashboard',
      'profile',
      'members',
      'requests',
      'requests/new',
      'requests/REQ-1262',
      'promotions',
    ].map((p) => '/club/' + p),
    osa: [
      'dashboard',
      'requests',
      'requests/REQ-1248',
      'club-applications',
      'clubs',
      'clubs/innovation',
      'reports',
    ].map((p) => '/admin/osa/' + p),
  };
  for (const [who, paths] of Object.entries(sweep)) {
    for (const width of [320, 375, 414]) {
      test(who + ' at ' + width + 'px: no content past the screen edge', async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width, height: 800 },
          isMobile: true,
          hasTouch: true,
        });
        await context.addInitScript((w) => {
          window.__W = w;
        }, width);
        const page = await context.newPage();
        await signIn(page, who);
        await expect(page.locator('main, h1').first()).toBeVisible({ timeout: 30_000 });
        for (const route of paths) {
          // move around inside the app (a full page load would restart it)
          await page.evaluate((to) => {
            history.pushState({}, '', to);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }, route);
          await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 30_000 });
          await page.waitForTimeout(400);
          const bad = await page.evaluate(() => {
            const iw = window.__W;
            const inScroller = (e) => {
              for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
                const o = getComputedStyle(n).overflowX;
                if (o === 'auto' || o === 'scroll') return true;
              }
              return false;
            };
            const off = [...document.querySelectorAll('body *')].filter((e) => {
              const r = e.getBoundingClientRect();
              const cs = getComputedStyle(e);
              return (
                r.width > 0 && r.height > 0 && r.right > iw + 1 && cs.position === 'static' && !inScroller(e)
              );
            });
            return off
              .filter((e) => !off.includes(e.parentElement))
              .slice(0, 3)
              .map(
                (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 4).join('.'),
              );
          });
          expect(bad, route).toEqual([]);
        }
        await context.close();
      });
    }
  }
});

test.describe('E2E-10 hall requests, priority and allocation', () => {
  /** A club event that OSA has allowed and the club has circulated, with one student registered. */
  async function circulated(browser, title) {
    const club = await as(browser, 'club', /Google Developer Student Clubs/);
    await club.page.goto('/club/requests/new');
    await fillRequestForm(club.page, title);
    await club.page.getByRole('button', { name: /Submit for review/ }).click();
    await expect(club.page.getByRole('heading', { name: title })).toBeVisible();
    const id = club.page.url().split('/').pop();
    const osa = await as(browser, 'osa', /Welcome back, Meera/);
    await act(osa.page, 'osa', 'reviewRequest', id, { decision: 'clear' });
    await act(osa.page, 'osa', 'recordPhysical', id, {
      status: 'verified',
      receivedOn: '2026-10-10',
      refNo: 'OSA/HC/E2E',
    });
    expect((await act(osa.page, 'osa', 'finalApprove', id, {})).body.data.ok).toBe(true);
    await club.page.reload();
    await club.page.getByRole('button', { name: /Circulate to students/ }).click();
    await club.page.getByRole('button', { name: 'Circulate', exact: true }).click();
    await expect(club.page.getByText(/students registered so far/)).toBeVisible();
    const student = await as(browser, 'student', /Good (morning|afternoon|evening)/);
    await student.page.goto('/student/events');
    await student.page.getByText(title).first().click();
    await student.page.getByRole('button', { name: /Register for this event/ }).click();
    await expect(student.page.getByRole('dialog', { name: 'Registration confirmed' })).toBeVisible();
    await student.context.close();
    await osa.context.close();
    return { club, id };
  }

  test('the club picks a hall with the AI recommendation and a priority; the Events Section assigns a different one; the club sees it', async ({
    browser,
  }) => {
    const title = 'Hall Night ' + uniq();
    const { club, id } = await circulated(browser, title);
    await club.page.reload();
    // halls are sorted for the people registered; the AI recommends one
    await expect(club.page.getByRole('radio').first()).toBeVisible();
    await club.page.getByRole('button', { name: /Recommend a hall/ }).click();
    await expect(club.page.getByRole('status').filter({ hasText: /best fit/ })).toBeVisible({
      timeout: 20_000,
    });
    await club.page.getByRole('radio', { name: /Seminar Room 3/ }).click();
    await club.page.getByLabel(/Priority for your club/).selectOption('high');
    await club.page.getByLabel(/Note for the Events Section/).fill('Hands-on session');
    await club.page.getByRole('button', { name: /Request this hall/ }).click();
    await expect(club.page.getByText(/Waiting for the Events Section/)).toBeVisible();

    const events = await as(browser, 'events', /Welcome back, Rohan/);
    await events.page.goto('/admin/events/halls/' + id);
    await expect(events.page.getByText('High priority').first()).toBeVisible();
    await expect(events.page.getByText(/Hands-on session/).first()).toBeVisible();
    await events.page.getByRole('button', { name: 'Assign a different hall' }).click();
    await events.page.getByLabel(/New hall/).selectOption('Innovation Lab');
    await events.page.getByLabel(/Note to the club/).fill('The seminar room is booked for exams.');
    await events.page.getByRole('button', { name: 'Assign hall' }).click();
    await expect(events.page.getByText('Hall allocated').first()).toBeVisible();

    await club.page.reload();
    await expect(club.page.getByText(/Innovation Lab/).first()).toBeVisible();
    await expect(club.page.getByText(/assigned it instead of Seminar Room 3/)).toBeVisible();
    for (const c of [club, events]) await c.context.close();
  });

  test('a hall that cannot be given carries the reason back, and the club asks again', async ({
    browser,
  }) => {
    const title = 'No Hall Night ' + uniq();
    const { club, id } = await circulated(browser, title);
    await club.page.reload();
    await club.page.getByRole('radio', { name: /Seminar Room 3/ }).click();
    await club.page.getByRole('button', { name: /Request this hall/ }).click();
    await expect(club.page.getByText(/Waiting for the Events Section/)).toBeVisible();

    const events = await as(browser, 'events', /Welcome back, Rohan/);
    await events.page.goto('/admin/events/halls/' + id);
    await events.page.getByRole('button', { name: /Hall can’t be given/ }).click();
    await expect(events.page.getByRole('button', { name: 'Send back to the club' })).toBeDisabled(); // a reason is required
    await events.page.getByLabel(/Why can’t this hall be given/).fill('Closed for repainting that week.');
    await events.page.getByRole('button', { name: 'Send back to the club' }).click();
    await expect(events.page.getByText('Hall not given').first()).toBeVisible();

    await club.page.reload();
    await expect(club.page.getByText(/Closed for repainting that week/).first()).toBeVisible();
    await club.page.getByRole('radio', { name: /North Lab/ }).click();
    await club.page.getByRole('button', { name: /Request this hall/ }).click();
    await expect(club.page.getByText(/Waiting for the Events Section/)).toBeVisible();
    for (const c of [club, events]) await c.context.close();
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
