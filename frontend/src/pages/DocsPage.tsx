import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { COLORS } from './docs/theme';
import { MermaidChart } from './docs/MermaidChart';
import {
  databaseErd,
  otpSend, otpVerify, google, refresh, logout,
  wsConnect, wsDisconnectTyping,
  messaging,
  callSignaling, pushLifecycle,
} from './docs/diagrams';
import { SignupScenario } from './docs/scenarios/SignupScenario';
import { MessagingScenario } from './docs/scenarios/MessagingScenario';
import { GroupScenario } from './docs/scenarios/GroupScenario';

type Tab = 'database' | 'auth' | 'ws' | 'messaging' | 'calls' | 'scenarios';
type ScenarioKey = 'signup' | 'returning' | 'group';

const SCENARIOS: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'signup', label: 'Signup → first chat' },
  { key: 'returning', label: 'Returning user & messaging' },
  { key: 'group', label: 'Group messaging' },
];

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'database', label: 'Database' },
  { key: 'auth', label: 'Auth & session' },
  { key: 'ws', label: 'WebSocket & presence' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'calls', label: 'Calls & push' },
  { key: 'scenarios', label: 'Scenarios' },
];

const TABLES: Array<{ name: string; table: string; note: string; fields: Array<[string, string, string?]> }> = [
  { name: 'User', table: 'users', note: 'Root identity record — thin on purpose.', fields: [
    ['id', 'String', 'PK'], ['phone', 'String?', 'UQ'], ['email', 'String?', 'UQ'],
    ['isVerified', 'Boolean'], ['lastSeen', 'DateTime?'],
  ]},
  { name: 'Profile', table: 'profiles', note: '1:1 with User — display identity split from account.', fields: [
    ['id', 'String', 'PK'], ['userId', 'String', 'FK,UQ'], ['displayName', 'String?'],
    ['avatarUrl', 'String?'], ['isOnline', 'Boolean'],
  ]},
  { name: 'AuthProvider', table: 'auth_providers', note: 'One row per sign-in method (otp / google).', fields: [
    ['id', 'String', 'PK'], ['userId', 'String', 'FK'], ['provider', 'enum'], ['providerId', 'String?'],
  ]},
  { name: 'OtpCode', table: 'otp_codes', note: 'No FK to User — verified before an account exists.', fields: [
    ['id', 'String', 'PK'], ['phone', 'String'], ['code', 'String'], ['expiresAt', 'DateTime'],
  ]},
  { name: 'Chat', table: 'chats', note: 'Direct + group chats in one table via ChatType.', fields: [
    ['id', 'String', 'PK'], ['type', 'enum'], ['name', 'String?'], ['createdBy', 'String?', 'FK'],
  ]},
  { name: 'ChatMember', table: 'chat_members', note: 'User ↔ Chat join table + per-membership state.', fields: [
    ['id', 'String', 'PK'], ['chatId', 'String', 'FK'], ['userId', 'String', 'FK'],
    ['role', 'enum'], ['lastReadAt', 'DateTime?'],
  ]},
  { name: 'Message', table: 'messages', note: 'Self-references via replyToId for threaded replies.', fields: [
    ['id', 'String', 'PK'], ['chatId', 'String', 'FK'], ['senderId', 'String', 'FK'],
    ['type', 'enum'], ['status', 'enum'], ['replyToId', 'String?', 'FK'],
  ]},
  { name: 'Attachment', table: 'attachments', note: 'Media carried by a message, 1:many.', fields: [
    ['id', 'String', 'PK'], ['messageId', 'String', 'FK'], ['fileName', 'String'], ['url', 'String'],
  ]},
  { name: 'RefreshToken', table: 'refresh_tokens', note: 'Session plumbing — one row per issued refresh token.', fields: [
    ['id', 'String', 'PK'], ['userId', 'String', 'FK'], ['token', 'String', 'UQ'], ['expiresAt', 'DateTime'],
  ]},
  { name: 'PushToken', table: 'push_tokens', note: 'Wakes the app for calls when backgrounded/killed.', fields: [
    ['id', 'String', 'PK'], ['userId', 'String', 'FK'], ['deviceId', 'String'], ['tokenType', 'enum'],
  ]},
];

const RELATIONSHIPS: Array<[string, string, string]> = [
  ['User → Profile', '1 : 0..1', 'Account and display identity are split on purpose.'],
  ['User → AuthProvider', '1 : many', 'A user can sign in via OTP and Google at once.'],
  ['User ↔ Chat (via ChatMember)', 'many : many', 'Direct chats have 2 members; groups have N.'],
  ['Chat → Message', '1 : many', 'Cascade delete — deleting a chat deletes its messages.'],
  ['Message → Message (replyTo)', '1 : 0..1', 'Self-join for reply threads.'],
  ['Message → Attachment', '1 : many', 'One message can carry multiple files.'],
];

function Pill({ children, tone }: { children: React.ReactNode; tone: 'pk' | 'fk' | 'uq' }) {
  const styles = {
    pk: { bg: 'rgba(37,211,102,0.15)', fg: COLORS.accent },
    fk: { bg: 'rgba(240,165,0,0.15)', fg: '#f0a500' },
    uq: { bg: 'rgba(134,150,160,0.15)', fg: COLORS.muted },
  }[tone];
  return (
    <span style={{
      fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: 0.3,
      padding: '1px 6px', borderRadius: 10, background: styles.bg, color: styles.fg,
      marginLeft: 6,
    }}>
      {children}
    </span>
  );
}

function EntityCard({ entity }: { entity: typeof TABLES[number] }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 14px', background: 'rgba(37,211,102,0.08)', borderBottom: `1px solid ${COLORS.cardBorder}` }}>
        <div style={{ fontWeight: 650, fontSize: 14, color: COLORS.text, fontFamily: 'ui-monospace, monospace' }}>{entity.name}</div>
        <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: 'ui-monospace, monospace' }}>{entity.table}</div>
      </div>
      <div style={{ padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: COLORS.muted, margin: '0 0 10px' }}>{entity.note}</p>
        {entity.fields.map(([f, t, flag]) => (
          <div key={f} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: '3px 0',
            color: flag === 'PK' ? COLORS.text : COLORS.muted,
          }}>
            <span>
              {flag === 'PK' ? <u style={{ color: COLORS.text }}>{f}</u> : f}
              {flag?.includes('FK') && <Pill tone="fk">FK</Pill>}
              {flag?.includes('PK') && <Pill tone="pk">PK</Pill>}
              {flag?.includes('UQ') && <Pill tone="uq">UQ</Pill>}
            </span>
            <span style={{ color: COLORS.muted }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 17, marginBottom: sub ? 4 : 12 }}>{title}</h2>
      {sub && <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14, maxWidth: 680 }}>{sub}</p>}
      {children}
    </div>
  );
}

export const DocsPage = () => {
  const [tab, setTab] = useState<Tab>('database');
  const [scenario, setScenario] = useState<ScenarioKey>('signup');

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${COLORS.bgFrom} 0%, ${COLORS.bgTo} 100%)`,
      color: COLORS.text,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 24px 100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <MessageCircle size={22} color={COLORS.accent} />
          <span style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: COLORS.accent, fontFamily: 'ui-monospace, monospace' }}>
            ChitChat · Architecture Docs
          </span>
        </div>
        <h1 style={{ fontSize: 30, margin: '4px 0 8px', letterSpacing: -0.4 }}>
          How the app is put together
        </h1>
        <p style={{ color: COLORS.muted, maxWidth: 640, margin: '0 0 28px', fontSize: 15 }}>
          The schema and the flows that read and write it, traced from backend/prisma/schema.prisma and backend/src. Diagrams wider than the panel scroll horizontally — the layout is computed automatically, not hand-placed.
        </p>

        <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: `1px solid ${COLORS.cardBorder}`, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 13.5, fontWeight: 600,
                color: tab === t.key ? COLORS.accent : COLORS.muted,
                borderBottom: tab === t.key ? `2px solid ${COLORS.accent}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'database' && (
          <>
            <Section title="Entity relationship diagram" sub="PK = primary key, FK = foreign key, UK = unique. OtpCode has no relation to User — it's verified before an account necessarily exists.">
              <MermaidChart chart={databaseErd} />
            </Section>

            <Section title="Entities" sub="Nine tables. Underline marks the primary key; PK/FK/UQ pills mark constraints.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {TABLES.map((e) => <EntityCard key={e.name} entity={e} />)}
              </div>
            </Section>

            <Section title="Key relationships">
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, overflow: 'hidden' }}>
                {RELATIONSHIPS.map(([rel, card, desc], i) => (
                  <div key={rel} style={{
                    display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12, padding: '12px 16px',
                    borderTop: i === 0 ? 'none' : `1px solid ${COLORS.cardBorder}`,
                  }}>
                    <div>
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{rel}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{desc}</div>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.accent, textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}>{card}</div>
                  </div>
                ))}
              </div>
            </Section>

            <div style={{
              borderLeft: `3px solid #f0a500`, background: 'rgba(240,165,0,0.08)',
              padding: '12px 16px', borderRadius: '0 8px 8px 0', fontSize: 13, maxWidth: 640,
            }}>
              <b style={{ color: '#f0a500' }}>Worth noting:</b> call history (<code style={{ background: COLORS.code, padding: '1px 5px', borderRadius: 4 }}>missed_call</code>, <code style={{ background: COLORS.code, padding: '1px 5px', borderRadius: 4 }}>call_log</code>) lives inside the Message table's <code style={{ background: COLORS.code, padding: '1px 5px', borderRadius: 4 }}>type</code> enum, not a separate Call table.
            </div>
          </>
        )}

        {tab === 'auth' && (
          <>
            <Section title="OTP send" sub="Rate-limited per phone before a code is even generated.">
              <MermaidChart chart={otpSend} />
            </Section>
            <Section title="OTP verify → tokens" sub="Verifying a code either creates a brand-new User or reactivates an existing one, then always issues a fresh token pair.">
              <MermaidChart chart={otpVerify} />
            </Section>
            <Section title="Google sign-in" sub="Accounts are linked by email if a phone/OTP account already exists — a user isn't forced to pick one method forever.">
              <MermaidChart chart={google} />
            </Section>
            <Section title="Refresh" sub="Refresh rotates the token — old row deleted, new one inserted.">
              <MermaidChart chart={refresh} />
            </Section>
            <Section title="Logout" sub="Broader than one device: it deletes every RefreshToken row for the user.">
              <MermaidChart chart={logout} />
            </Section>
          </>
        )}

        {tab === 'ws' && (
          <>
            <Section title="Connect & presence" sub="authenticateSocket runs before anything else; presence writes happen on every connection, not just the first one.">
              <MermaidChart chart={wsConnect} />
            </Section>
            <Section title="Disconnect & typing" sub="Presence only flips offline when the user's last socket disconnects — closing one tab of several does nothing.">
              <MermaidChart chart={wsDisconnectTyping} />
            </Section>
          </>
        )}

        {tab === 'messaging' && (
          <Section title="Sending a message — two entry points, one write" sub="WebSocket is the primary path and handles its own fan-out; REST bridges through an internal event emitter into the same gateway broadcast. Offline recipients get a push instead of a socket event.">
            <MermaidChart chart={messaging} />
          </Section>
        )}

        {tab === 'calls' && (
          <>
            <Section title="Call signaling" sub="The push notification is fired in parallel with CALL_INCOMING, not as a fallback — it's how the app wakes up when backgrounded or killed.">
              <MermaidChart chart={callSignaling} />
            </Section>
            <Section title="Push token lifecycle" sub="Invalid tokens are self-pruning: a rejected FCM send for a dead token deletes it from PushToken automatically.">
              <MermaidChart chart={pushLifecycle} />
            </Section>
          </>
        )}

        {tab === 'scenarios' && (
          <>
            <p style={{ color: COLORS.muted, fontSize: 13.5, marginBottom: 20, maxWidth: 720 }}>
              End-to-end walkthroughs with real code, quoted verbatim from the current source — frontend, backend, and the socket
              events that connect them, in the order they actually fire.
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
              {SCENARIOS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setScenario(s.key)}
                  style={{
                    background: scenario === s.key ? 'rgba(37,211,102,0.12)' : COLORS.card,
                    border: `1px solid ${scenario === s.key ? COLORS.accent : COLORS.cardBorder}`,
                    borderRadius: 20,
                    padding: '7px 16px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: scenario === s.key ? COLORS.accent : COLORS.muted,
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {scenario === 'signup' && <SignupScenario />}
            {scenario === 'returning' && <MessagingScenario />}
            {scenario === 'group' && <GroupScenario />}
          </>
        )}

        <div style={{ marginTop: 60, paddingTop: 16, borderTop: `1px solid ${COLORS.cardBorder}`, fontSize: 11, color: '#5f6b74' }}>
          Generated from backend/prisma/schema.prisma and backend/src. This page is publicly reachable at /docs — no auth guard.
        </div>
      </div>
    </div>
  );
};
