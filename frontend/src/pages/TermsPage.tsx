import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Acceptance of these Terms',
    body: [
      'By creating an account or using ChitChat, you agree to these Terms of Service. If you don’t agree, please don’t use the app.',
    ],
  },
  {
    title: '2. What ChitChat is',
    body: [
      'ChitChat is a messaging app that lets you send text, photos, videos, audio, and files, and make voice/video calls, one-to-one or in groups. Direct messages, group messages, and attachments are end-to-end encrypted — see the Privacy Policy for exactly what that means and what it does not cover.',
    ],
  },
  {
    title: '3. Your account',
    body: [
      'You sign in with your Google account or a phone number (via a one-time code). You’re responsible for keeping access to your account secure and for anything that happens through it.',
      'You must be old enough to legally consent to using this kind of service in your country.',
    ],
  },
  {
    title: '4. Acceptable use',
    body: [
      'Don’t use ChitChat to: break the law; harass, threaten, or abuse anyone; send spam or unsolicited bulk messages; distribute malware; impersonate someone else; or attempt to access accounts, data, or systems that aren’t yours.',
      'Because messages are end-to-end encrypted, we generally cannot see message content and cannot proactively moderate it. If we receive a valid report or legal request about an account, we may act on account-level information we do have (see the Privacy Policy) — including suspending or removing an account.',
    ],
  },
  {
    title: '5. Calls',
    body: [
      'Voice and video calls are relayed peer-to-peer where possible; a relay server may be used to help establish the connection but does not record or store call audio/video.',
    ],
  },
  {
    title: '6. Service availability',
    body: [
      'ChitChat is provided “as is,” without warranties of any kind. We don’t guarantee the service will always be available, error-free, or uninterrupted.',
    ],
  },
  {
    title: '7. Limitation of liability',
    body: [
      'To the fullest extent permitted by law, ChitChat and its operators are not liable for any indirect, incidental, or consequential damages arising from your use of the service.',
    ],
  },
  {
    title: '8. Changes to these Terms',
    body: [
      'We may update these Terms from time to time. Continuing to use ChitChat after a change means you accept the updated Terms.',
    ],
  },
  {
    title: '9. Contact',
    body: [
      'Questions about these Terms? Reach out to [your-support-email@example.com].',
    ],
  },
];

export const TermsPage = () => {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-deepest)', color: 'var(--color-text-primary)' }}>
      <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={22} />
        </button>
        <MessageCircle size={20} color="var(--color-accent-secondary)" />
        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Terms of Service</h1>
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
