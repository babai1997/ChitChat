import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. What this covers',
    body: [
      'This explains what ChitChat collects, why, and — importantly — what end-to-end encryption means for what we can and can’t see.',
    ],
  },
  {
    title: '2. What we collect',
    body: [
      'Account info: your email/name from Google Sign-In, or your phone number if you sign in via one-time code.',
      'Profile info: display name, avatar photo, and about text you choose to set — visible to people you chat with.',
      'Device & encryption keys: each device you use generates its own public encryption keys, registered so others can start an encrypted session with you. Your private keys never leave your device.',
      'Metadata: who you’re chatting with, timestamps, delivery/read status, group membership, and call metadata (participants, duration) — needed to route messages and calls, but not their content.',
      'Push notification tokens: used only to wake your device for a new message or incoming call.',
    ],
  },
  {
    title: '3. What end-to-end encryption means here',
    body: [
      'Text messages, photos, videos, audio, and files sent in direct and group chats are encrypted on your device before they ever leave it, using per-conversation keys only you and the people you’re chatting with hold. Our servers relay and store only encrypted ciphertext — we cannot read message content or attachments, and we don’t have a way to decrypt them even if legally compelled to try.',
      'What is NOT covered by encryption: who you message and when (metadata, above), your profile info, and group membership — all visible to us because the app needs them to function.',
      'A device you explicitly link or a passphrase-protected backup you create can restore your message history to a new device — protected by your own passphrase, which we never see or store.',
    ],
  },
  {
    title: '4. Third parties we use',
    body: [
      'Google — for sign-in (Google Sign-In / OAuth).',
      'Cloudinary — stores encrypted attachment files as opaque blobs; it cannot decrypt or interpret them.',
      'Firebase Cloud Messaging — delivers push notifications (a "you have a new message" ping, not the message itself).',
      'Neon (PostgreSQL hosting) — stores account, profile, and message metadata, and encrypted ciphertext.',
    ],
  },
  {
    title: '5. How long we keep data',
    body: [
      'Messages and attachments are retained until you or the other party deletes them, or your account is deleted. Deleting your account removes your profile and, where technically possible, your message content.',
    ],
  },
  {
    title: '6. Your choices',
    body: [
      'You can delete individual messages, leave or delete group chats, revoke a linked device at any time from Settings, and request account deletion by contacting us.',
    ],
  },
  {
    title: '7. Children',
    body: [
      'ChitChat isn’t directed at children under the age required by your local law to consent to this kind of service on your own, and we don’t knowingly collect data from them.',
    ],
  },
  {
    title: '8. Changes to this policy',
    body: [
      'If this policy changes in a way that matters, we’ll let you know in the app before it takes effect.',
    ],
  },
  {
    title: '9. Contact',
    body: [
      'Questions, or want to request account/data deletion? Reach out to [your-support-email@example.com].',
    ],
  },
];

export const PrivacyPolicyPage = () => {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-deepest)', color: 'var(--color-text-primary)' }}>
      <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={22} />
        </button>
        <MessageCircle size={20} color="var(--color-accent-secondary)" />
        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Privacy Policy</h1>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '32px' }}>Last updated: August 8, 2026</p>

        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: '28px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-accent-secondary)', marginBottom: '8px' }}>{section.title}</h2>
            {section.body.map((p, i) => (
              <p key={i} style={{ fontSize: '14.5px', lineHeight: '22px', color: 'var(--color-text-primary)', marginBottom: '10px' }}>
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
