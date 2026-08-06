import { registerAs } from '@nestjs/config';

export default registerAs('turn', () => {
  const secret = process.env.TURN_SECRET;

  if (!secret) {
    throw new Error(
      'TURN_SECRET environment variable is not set. Set it in your .env file or deployment environment. ' +
        'This must match the TURN provider\'s shared/static-auth secret (e.g. the "Secret Key" in the metered.ca dashboard), not the long-term username/credential pair.',
    );
  }

  const splitUrls = (value: string | undefined) =>
    (value || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);

  return {
    secret,
    ttlSeconds: parseInt(process.env.TURN_CREDENTIAL_TTL_SECONDS || '3600', 10),
    stunUrls: splitUrls(
      process.env.STUN_URLS ||
        'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun.relay.metered.ca:80',
    ),
    turnUrls: splitUrls(
      process.env.TURN_URLS ||
        'turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp',
    ),
  };
});
