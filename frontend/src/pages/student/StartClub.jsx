import { useMemo, useState } from 'react';
import { Card } from '../../components/gov/Common';
import { ClubAppStatus } from '../../components/gov/Badges';
import FileField from '../../components/gov/FileField';
import { Field, Input, Select, Textarea } from '../../components/gov/Form';
import { EmptyState, Icon, PageHeader } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { useGov } from '../../context/GovContext';
import { CLUB_APP_DOCS } from '../../data/govData';
import { checkClubIdea } from '../../services/ai';
import { fmtDateTime } from '../../store/selectors';
import { validateClubApplication } from '../../store/workflow';

const EMPTY = { name: '', category: '', objectives: '', description: '', advisor: '', memberCount: '', documents: {} };

/** A student proposes a new club. A similar club that already exists stops the application before OSA is bothered. */
export default function StartClub() {
  const gov = useGov();
  const app = useApp();
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const categories = useMemo(() => [...new Set(gov.clubs.map((c) => c.category).filter(Boolean))], [gov.clubs]);
  const mine = gov.state.clubApplications;

  const set = (k) => (e) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    if (['name', 'category', 'objectives', 'description'].includes(k)) setCheck(null);
  };
  const idea = { name: f.name, category: f.category, objectives: f.objectives, description: f.description };

  const runCheck = async () => {
    if (f.name.trim().length < 3 || f.objectives.trim().length < 30) {
      setErrors({ name: f.name.trim().length < 3 ? 'Enter the proposed club name.' : undefined, objectives: f.objectives.trim().length < 30 ? 'Describe the club in at least 30 characters.' : undefined });
      return null;
    }
    setBusy(true);
    try {
      const result = await checkClubIdea(idea, gov.state);
      setCheck(result);
      return result;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const errs = { ...validateClubApplication({ ...f, proposerName: 'x', proposerEmail: 'x@x.co' }) };
    delete errs.proposerName;
    delete errs.proposerEmail;
    if (Number(f.memberCount) < 10 && !errs.memberCount) errs.memberCount = 'A new club needs at least 10 founding members.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      app.notify('Please fix the highlighted fields.', 'info');
      return;
    }
    setBusy(true);
    try {
      const res = gov.applyForClub(f);
      if (res.ok) {
        app.notify('Application sent to OSA.');
        setF(EMPTY);
        setCheck(null);
      } else {
        setCheck({ blocked: true, message: res.error, matches: [] });
        app.notify(res.error, 'info');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="New club" title="Start a club" subtitle="Have an idea for a community that doesn’t exist yet? We first check whether a similar club is already there; if not, OSA reviews your application." />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <Card title="Your idea">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Proposed club name" htmlFor="sc-name" required error={errors.name}><Input id="sc-name" value={f.name} onChange={set('name')} error={errors.name} /></Field>
              <Field label="Category" htmlFor="sc-cat" required error={errors.category}>
                <Select id="sc-cat" value={f.category} onChange={set('category')} error={errors.category}>
                  <option value="">Choose…</option>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field className="sm:col-span-2" label="What will the club do?" htmlFor="sc-obj" required error={errors.objectives} hint={`${f.objectives.trim().length}/30 minimum characters. Say what members will do each week.`}>
                <Textarea id="sc-obj" rows={4} value={f.objectives} onChange={set('objectives')} error={errors.objectives} />
              </Field>
              <Field className="sm:col-span-2" label="More about it (optional)" htmlFor="sc-desc"><Textarea id="sc-desc" rows={2} value={f.description} onChange={set('description')} /></Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={runCheck} disabled={busy} className="btn-ghost">
                <Icon name={busy ? 'Loader2' : 'Sparkles'} className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Check my idea
              </button>
              <span className="text-[11px] text-ink-mute">See if a similar club already exists before you fill in the rest.</span>
            </div>

            {check && (
              <div role="status" className={`mt-4 rounded-xl border px-4 py-3 text-xs ${check.blocked ? 'border-[#f1c9c4] bg-rose-soft text-rose-ink' : 'border-brand-200 bg-brand-50 text-brand-800'}`}>
                <div className="flex items-start gap-2">
                  <Icon name={check.blocked ? 'AlertTriangle' : 'CheckCircle2'} className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <b>{check.blocked ? 'A similar club already exists.' : 'Looks like a new idea.'}</b>
                    <p className="mt-1">{check.blocked ? check.message : 'No existing club covers the same focus area, so you can go ahead and apply.'}</p>
                  </div>
                </div>
                {check.matches?.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {check.matches.map((m) => (
                      <li key={m.clubId} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-[11px] text-ink">
                        <span className="font-bold">{m.name}</span>
                        <span className="text-ink-mute">{Math.round(m.score * 100)}% similar</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card title="Your team">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Faculty advisor" htmlFor="sc-adv" required error={errors.advisor}><Input id="sc-adv" value={f.advisor} onChange={set('advisor')} error={errors.advisor} /></Field>
              <Field label="Founding members" htmlFor="sc-mc" required error={errors.memberCount} hint="At least 10 students."><Input id="sc-mc" type="number" min="1" value={f.memberCount} onChange={set('memberCount')} error={errors.memberCount} /></Field>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-[11px] text-ink-soft">Documents OSA will ask for (you can add them now or hand them in at the OSA office):</p>
              {CLUB_APP_DOCS.map((d) => <FileField key={d.key} label={d.label} required={d.required} value={f.documents[d.key]} onChange={(v) => setF((p) => ({ ...p, documents: { ...p.documents, [d.key]: v } }))} />)}
            </div>
            <button type="button" onClick={submit} disabled={busy} className="btn-primary mt-5 disabled:opacity-60">
              <Icon name="Send" className="h-4 w-4" /> Apply to start this club
            </button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="How it works">
            <ol className="space-y-3 text-[11px] leading-relaxed text-ink-soft">
              <li><b className="text-brand-900">1. Idea check.</b> We compare your idea with every club and pending application, by meaning, not just by name.</li>
              <li><b className="text-brand-900">2. Same focus area?</b> Then it isn’t accepted and you’re pointed to that club. Join it or shape something different.</li>
              <li><b className="text-brand-900">3. New idea.</b> It goes to OSA, who checks the documents and decides.</li>
              <li><b className="text-brand-900">4. Approved.</b> Your club appears in the Clubs Directory.</li>
            </ol>
          </Card>
          <Card title="Your applications">
            {mine.length === 0 ? (
              <EmptyState icon="Lightbulb" title="No applications yet" body="Applications you send appear here with their status." />
            ) : (
              <ul className="space-y-3">
                {mine.map((a) => (
                  <li key={a.id} className="rounded-xl border border-line p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-extrabold text-brand-900">{a.name}</div>
                        <div className="text-[10px] text-ink-mute">{a.id} · {a.category} · sent {fmtDateTime(a.submittedAt)}</div>
                      </div>
                      <ClubAppStatus status={a.status} />
                    </div>
                    {a.status === 'approved' && <p className="mt-2 text-[11px] text-brand-800">Approved. Your club is now in the Clubs Directory.</p>}
                    {a.decisionNote && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[11px] text-ink-soft">OSA: {a.decisionNote}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
