import { Highlight, themes } from 'prism-react-renderer';
import { COLORS } from './theme';

function languageFor(file: string): string {
  const path = file.split(' ')[0]; // strip trailing "(full file)" / ":12-34" annotations
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.prisma')) return 'typescript'; // closest built-in grammar for schema blocks
  return 'typescript';
}

export function CodeBlock({ file, lines }: { file: string; lines: string[] }) {
  const code = lines.join('\n');
  const language = languageFor(file);

  return (
    <div style={{ border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, overflow: 'hidden', margin: '10px 0 20px' }}>
      <div
        style={{
          padding: '6px 12px',
          background: COLORS.card,
          borderBottom: `1px solid ${COLORS.cardBorder}`,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          color: COLORS.muted,
        }}
      >
        {file}
      </div>
      <Highlight theme={themes.vsDark} code={code} language={language}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            style={{
              ...style,
              margin: 0,
              padding: '12px 16px',
              overflowX: 'auto',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12.5,
              lineHeight: 1.65,
              background: '#1e1e1e',
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.accent, fontWeight: 650, fontSize: 13 }}>{n}</span>
        <h4 style={{ fontSize: 15, margin: 0, color: COLORS.text }}>{title}</h4>
      </div>
      {children}
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderLeft: `3px solid #f0a500`,
        background: 'rgba(240,165,0,0.08)',
        padding: '10px 14px',
        borderRadius: '0 6px 6px 0',
        fontSize: 13,
        color: COLORS.text,
        margin: '4px 0 18px',
      }}
    >
      {children}
    </div>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13.5, color: COLORS.muted, margin: '0 0 10px', maxWidth: 720 }}>{children}</p>;
}
