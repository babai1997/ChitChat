# NAT, STUN, and TURN in Chitchat's Calling Feature

Chitchat's voice/video calls (`frontend/src/contexts/CallContext.tsx`, `mobile/src/contexts/CallContext.tsx`) are peer-to-peer WebRTC connections. This doc explains why NAT traversal is needed, what STUN and TURN actually do, and how this project is currently configured.

## 1. The problem: NAT

Almost every device on the internet sits behind a **NAT (Network Address Translator)** — your home router, mobile carrier gateway, office firewall, etc. NAT lets many private devices (192.168.x.x, 10.x.x.x) share one public IP address.

This is great for security and IPv4 scarcity, but it breaks direct peer-to-peer connections:

- Device A doesn't know its own *public* IP/port — only its private one.
- Device A can't accept an inbound connection from Device B unless A's NAT has already mapped a port for that traffic (usually only happens *after* A sends something out first).

Two people on two different networks calling each other therefore can't just "connect" to each other's IP — neither side has a reachable address for the other.

## 2. STUN: "what is my public address?"

**STUN (Session Traversal Utilities for NAT)** is a lightweight server that a client asks *"what public IP/port do you see me as?"* The client sends a UDP packet to the STUN server, and the server replies with the address/port it observed. That's it — STUN does no relaying, no media forwarding, it just reflects back your own address.

WebRTC uses this during **ICE (Interactive Connectivity Establishment)** candidate gathering: each peer collects a list of candidate addresses (local, and STUN-reflected public) and exchanges them with the other peer via the signaling server. If both peers' NATs allow it (most home/consumer NATs do, for "full cone" / "restricted cone" NAT types), the two peers can then talk directly, peer-to-peer, using those reflected addresses — no ongoing server involvement, low latency, no media-relay cost.

In this codebase, both `frontend/src/contexts/CallContext.tsx` and `mobile/src/contexts/CallContext.tsx` list several STUN servers:

```js
{ urls: 'stun:stun.l.google.com:19302' },
{ urls: 'stun:stun1.l.google.com:19302' },
{ urls: 'stun:stun.relay.metered.ca:80' },
```

Google's public STUN servers are free, widely used, and sufficient for the majority of calls where at least one side is on an easy NAT type.

## 3. TURN: "just relay it for me"

STUN fails when both peers are behind **symmetric NAT** (common on strict corporate networks, some carrier-grade NAT/CGNAT mobile setups, and some VPNs) — a NAT type where the mapped external port changes per destination, so the address a STUN server sees is *not* usable by the other peer. In that case no direct P2P path exists at all.

**TURN (Traversal Using Relays around NAT)** is the fallback: it's a real media relay server. Both peers open a connection *to* the TURN server (which almost always works, since it's just an outbound connection like any other), and the TURN server forwards packets between them. From each peer's perspective it's talking to one server; the TURN server is the middleman for the actual audio/video/data.

Tradeoffs vs. STUN/P2P:
- Requires authentication (username/credential) since it's consuming real bandwidth/CPU on someone's infrastructure.
- Adds latency (extra hop) and cost (the relay operator pays for bandwidth for every relayed call).
- It's the only thing that works when both sides are symmetric-NAT'd.

This project uses a third-party TURN provider, **metered.ca**, configured identically in both `frontend/src/contexts/CallContext.tsx:222-252` and `mobile/src/contexts/CallContext.tsx:44-69`:

```js
{ urls: 'turn:global.relay.metered.ca:80', username: '...', credential: '...' },
{ urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '...', credential: '...' },
{ urls: 'turn:global.relay.metered.ca:443', username: '...', credential: '...' },
{ urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '...', credential: '...' },
```

The four entries are the same relay offered over different transports/ports so ICE can pick whichever gets through a given firewall:
- Port 80 UDP/TCP — looks like ordinary HTTP traffic, gets through most firewalls that block arbitrary UDP.
- Port 443 TCP with `turns:` (TURN-over-TLS) — looks like ordinary HTTPS, gets through the strictest corporate/hotel/airport firewalls that only allow 443.

## 4. How ICE picks between them

WebRTC's ICE agent doesn't choose STUN vs. TURN manually — it gathers **all** candidates (host/local, STUN-reflected "srflx", and TURN "relay"), exchanges the full list with the remote peer via the signaling server, then tries every candidate pair and picks whichever pair actually connects, preferring lower-latency direct paths (host > srflx > relay) when multiple pairs succeed. TURN relay candidates are the fallback of last resort, used only when nothing more direct connects.

## 5. Where this fits in Chitchat's call flow

1. Just before starting/answering/joining a call, the client fetches short-lived ICE server credentials from the backend (see §6) and creates a peer connection (`SimplePeer` on web, `RTCPeerConnection` on mobile) with them.
2. ICE gathers local + STUN + TURN candidates in the background.
3. The offer/answer/candidates are exchanged **not** peer-to-peer but through the backend signaling relay: `backend/src/modules/gateway/handlers/call.handler.ts`, over Socket.IO events (`SOCKET_EVENTS.CALL_SIGNAL`, `CALL_RINGING`, `CALL_ONGOING`, etc.). The backend only ever relays signaling metadata (SDP offers/answers, ICE candidates) — it never touches actual audio/video/screen-share media.
4. Once ICE finds a working candidate pair, actual audio/video/screen-share flows either directly between the two clients (STUN case) or through the metered.ca TURN relay (symmetric-NAT case) — the backend is not involved in media at that point either way.

## 6. TURN credentials: short-lived, minted server-side

Previously, a single static metered.ca `username`/`credential` pair was hardcoded in plaintext in both `frontend/src/contexts/CallContext.tsx` and `mobile/src/contexts/CallContext.tsx` — a permanent, real credential shipped in the client bundle. That's been replaced with per-session, short-lived credentials minted by the backend:

- **`GET /calls/turn-credentials`** (`backend/src/modules/gateway/call-http.controller.ts`) — authenticated via the global `JwtAuthGuard`. Returns:
  ```json
  { "iceServers": [{ "urls": [...stun] }, { "urls": [...turn], "username": "...", "credential": "..." }], "ttlSeconds": 3600 }
  ```
- **`TurnCredentialsService`** (`backend/src/modules/gateway/services/turn-credentials.service.ts`) mints the TURN credential per request using the standard coturn/TURN-REST-API static-auth-secret scheme:
  - `username = "<unix-expiry-timestamp>:<userId>"`
  - `credential = base64(HMAC-SHA1(TURN_SECRET, username))`
  - The TURN relay validates the HMAC and expiry itself against the same shared secret — nothing is stored server-side, and a leaked credential is only ever usable until it expires (default 1 hour, `TURN_CREDENTIAL_TTL_SECONDS`).
  - `TURN_SECRET` must be the TURN provider's shared/static-auth secret (metered.ca calls this the project's "Secret Key" in their dashboard, used for their TURN REST API) — **not** the old static long-term username/credential pair, which is being retired.
- **Config**: `backend/src/config/turn.config.ts` reads `TURN_SECRET`, `TURN_CREDENTIAL_TTL_SECONDS`, `STUN_URLS`, `TURN_URLS` — see `backend/.env.example`. Throws at startup if `TURN_SECRET` is unset, same pattern as `jwt.config.ts`.
- **Clients**: `frontend/src/api/turn.ts` and `mobile/src/api/turn.ts` call the endpoint and cache the result in memory, refetching once within 60s of expiry. `CallContext.tsx` on both platforms calls this (`refreshIceServers()`) at the start of `startCall`/`answerCall`/`joinOngoingCall`, storing the result in an `iceServersRef` that the peer-connection factory reads from. If the fetch fails, clients fall back to a STUN-only ICE list (`FALLBACK_ICE_SERVERS`) — calls between two NAT-friendly peers still work, only the TURN relay fallback for symmetric-NAT peers is unavailable until the next successful fetch.

### Setup required to activate this

`TURN_SECRET` has no default — the backend refuses to start without it. Whoever owns the metered.ca account needs to:
1. Get the project's static-auth-secret ("Secret Key") from the metered.ca dashboard's TURN REST API settings (this is a different value from the `username`/`credential` pair that was previously hardcoded).
2. Set `TURN_SECRET` to that value in the backend's environment (`.env` / deployment secrets).
3. If metered.ca's REST API secret doesn't validate against these exact HMAC semantics, self-hosting coturn with `--use-auth-secret --static-auth-secret=<same value>` is the reference implementation this scheme is built for, and is a safe fallback that doesn't depend on a specific third-party provider's API quirks.
