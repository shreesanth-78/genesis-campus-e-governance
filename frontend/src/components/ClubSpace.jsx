import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Toggle } from './ui';
import { Field, Select, Textarea } from './gov/Form';
import { Card } from './gov/Common';
import { deleteClubPost, fetchClubMembers, fetchClubSpace, postToClub, removeClubMember, saveClubSettings } from '../utils/api';
import { cn } from '../utils/helpers';

const POLL_MS = 10000;
const MAX = 1000;
const FILTERS = [
  ['all', 'Everything'],
  ['announcement', 'Announcements'],
  ['discussion', 'Discussion'],
];

const when = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

/**
 * The private board of one club: announcements from its authority and discussion between members, tagged to an event
 * if they are about one. `authority` shows the announcement option and the member list.
 */
export default function ClubSpace({ clubId, authority = false, onError }) {
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [text, setText] = useState('');
  const [kind, setKind] = useState('discussion');
  const [eventId, setEventId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    try {
      setData(await fetchClubSpace(clubId));
      if (authority) setMembers(await fetchClubMembers(clubId));
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load the space.');
      onError?.(e);
    }
  }, [clubId, authority, onError]);

  useEffect(() => {
    setData(null);
    first.current = true;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Scroll to the newest post when the board first opens and when the person has just posted.
  useEffect(() => {
    if (data && first.current) {
      first.current = false;
      end.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [data]);

  const send = async () => {
    const body = text.trim();
    if (!body) return setError('Write something first.');
    setBusy(true);
    try {
      await postToClub(clubId, { kind: authority ? kind : 'discussion', body, eventId: eventId || null });
      setText('');
      setEventId('');
      await load();
      end.current?.scrollIntoView?.({ block: 'nearest' });
    } catch (e) {
      setError(e.message || 'Could not post that.');
    } finally {
      setBusy(false);
    }
  };

  const changeSetting = async (patch) => {
    try {
      const settings = await saveClubSettings(clubId, patch);
      setData((d) => ({ ...d, settings }));
      setError('');
    } catch (e) {
      setError(e.message || 'Could not save that setting.');
    }
  };

  const remove = async (id) => {
    try {
      await deleteClubPost(clubId, id);
      await load();
    } catch (e) {
      setError(e.message || 'Could not delete that post.');
    }
  };

  const kick = async (userId) => {
    try {
      await removeClubMember(clubId, userId);
      await load();
    } catch (e) {
      setError(e.message || 'Could not remove that member.');
    }
  };

  if (!data) {
    return error ? (
      <p role="alert" className="rounded-xl bg-rose-soft px-4 py-3 text-xs text-rose-ink">
        {error}
      </p>
    ) : (
      <p className="text-xs text-ink-soft">Loading the space…</p>
    );
  }

  const titleOf = (id) => data.events.find((e) => e.id === id)?.title;
  const readOnly = !authority && !data.settings.membersCanPost;
  const posts = data.posts.filter((p) => filter === 'all' || p.kind === filter);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <Card
        pad={false}
        title={`${data.club.name} space`}
        subtitle={`${data.memberCount} ${data.memberCount === 1 ? 'member' : 'members'} · only members and the club authority can see this`}
      >
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3" role="tablist" aria-label="Show">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn('rounded-full px-3 py-1 text-[11px] font-bold', filter === key ? 'bg-brand-800 text-white' : 'bg-[#f1eeee] text-ink-soft hover:bg-brand-50')}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="max-h-[520px] min-h-[200px] space-y-3 overflow-y-auto px-5 py-4 scroll-thin" aria-live="polite">
          {posts.length === 0 && <li className="py-8 text-center text-xs text-ink-soft">Nothing here yet. Be the first to post.</li>}
          {posts.map((p) => (
            <li
              key={p.id}
              className={cn(
                'rounded-2xl border px-4 py-3',
                p.kind === 'announcement' ? 'border-brand-200 bg-brand-50' : p.mine ? 'border-line bg-canvas' : 'border-line bg-white',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {p.kind === 'announcement' && (
                  <span className="pill bg-brand-800 text-white">
                    <Icon name="Megaphone" className="h-3 w-3" /> Announcement
                  </span>
                )}
                <span className="text-xs font-extrabold text-brand-900">{p.mine ? 'You' : p.authorName}</span>
                {p.authorRole === 'authority' && p.kind !== 'announcement' && <span className="pill bg-brand-50 text-brand-700">Authority</span>}
                <span className="text-[10px] text-ink-mute">{when(p.createdAt)}</span>
                {p.canDelete && (
                  <button onClick={() => remove(p.id)} className="ml-auto grid h-6 w-6 place-items-center rounded-full text-ink-mute hover:bg-rose-soft hover:text-rose-ink" aria-label="Delete this post">
                    <Icon name="Trash2" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {p.eventId && titleOf(p.eventId) && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-brand-700">
                  <Icon name="CalendarDays" className="h-3 w-3" /> About: {titleOf(p.eventId)}
                </div>
              )}
              <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">{p.body}</p>
            </li>
          ))}
          <li ref={end} aria-hidden="true" />
        </ul>

        {readOnly ? (
          <div className="border-t border-line px-5 py-4">
            {error && <p role="alert" className="mb-3 rounded-xl bg-rose-soft px-3 py-2 text-[11px] text-rose-ink">{error}</p>}
            <p className="flex items-start gap-2 rounded-xl bg-canvas px-4 py-3 text-[11px] text-ink-soft">
              <Icon name="Lock" className="mt-0.5 h-4 w-4 shrink-0" /> Only the club authority can post in this space right now. You can read everything here.
            </p>
          </div>
        ) : (
        <div className="space-y-3 border-t border-line px-5 py-4">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-soft px-3 py-2 text-[11px] text-rose-ink">
              {error}
            </p>
          )}
          <Field label={authority ? 'Write a post' : 'Write a message'} htmlFor="cs-text" hint={`${text.length}/${MAX}`}>
            <Textarea id="cs-text" rows={3} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder={authority ? 'An announcement for your members, or a message to the discussion' : 'Ask something, share an update, plan with your club'} />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            {authority && (
              <Field label="Post as" htmlFor="cs-kind">
                <Select id="cs-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="announcement">Announcement</option>
                  <option value="discussion">Discussion message</option>
                </Select>
              </Field>
            )}
            <Field label="About an event (optional)" htmlFor="cs-event">
              <Select id="cs-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">General</option>
                {data.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </Select>
            </Field>
            <button type="button" onClick={send} disabled={busy || !text.trim()} className="btn-primary ml-auto disabled:opacity-50">
              <Icon name="Send" className="h-4 w-4" /> Post
            </button>
          </div>
        </div>
        )}
      </Card>

      <div className="space-y-6">
        <Card title="How this space works">
          <ul className="space-y-2 text-[11px] leading-relaxed text-ink-soft">
            <li><b className="text-brand-900">Announcements</b> come from the club authority and are highlighted.</li>
            <li><b className="text-brand-900">Discussion</b> is for members: plan an event, ask questions, share updates. Tag a post to an event to keep it findable.</li>
            <li>Keep it about the club. The authority can delete any post, and you can delete your own.</li>
          </ul>
        </Card>
        {authority && (
          <Card title="Space settings" subtitle="Only you can change these">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="min-w-0 flex-1 text-[11px] leading-snug text-ink-soft">
                  <b className="block text-xs text-brand-900">Only I can post</b>
                  Members can read, but only you post. Turn it off to let members write too.
                </div>
                <Toggle checked={!data.settings.membersCanPost} onChange={(on) => changeSetting({ membersCanPost: !on })} label="Only the club authority can post" />
              </li>
              <li className="flex items-start gap-3">
                <div className="min-w-0 flex-1 text-[11px] leading-snug text-ink-soft">
                  <b className="block text-xs text-brand-900">Close to new members</b>
                  Students can no longer join. Current members stay.
                </div>
                <Toggle checked={!data.settings.joinOpen} onChange={(on) => changeSetting({ joinOpen: !on })} label="Close the club to new members" />
              </li>
            </ul>
          </Card>
        )}
        {authority && (
          <Card title="Members who joined" subtitle={`${members.length} in the portal`}>
            {members.length === 0 ? (
              <p className="text-[11px] text-ink-soft">No student has joined yet. Students join from the Clubs Directory.</p>
            ) : (
              <ul className="divide-y divide-line">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 text-xs">
                      <b className="text-brand-900">{m.name}</b>
                      <div className="text-[10px] text-ink-mute">{m.userId}</div>
                    </div>
                    <button onClick={() => kick(m.id)} className="btn-ghost px-2.5 py-1 text-[10px] text-rose-ink" aria-label={`Remove ${m.name}`}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
