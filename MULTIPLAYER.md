# Two-player rooms and races

## Play together

1. Open the same current game build on both computers and click **Drive**.
2. Press **Esc**. Above Visual quality, choose **Create room** under **Play with a friend**.
3. Copy the three-digit code. Your friend pastes it into their code box and chooses **Join**.
4. Close the menu and drive. The host has the midnight-teal Cayenne; the guest has the coral Cayenne. A label and atlas marker identify the friend.

Rooms hold exactly two players. Cars pass through each other, while ordinary scenery collisions remain unchanged. The host selects shared lighting; quality, audio and camera settings remain local. Pausing, viewing the map or taking a photo stops only your car. Either car activates gallery doors.

The room code is a short invitation code, not a password or an account system. Session tokens identify established players and are never sent to the other player. Codes preserve leading zeros. Expired codes and full rooms produce explicit messages.

## Race together

The host chooses **Beachfront Circuit**, **Silver Lake Circuit**, **Airport Sprint**, or **Downtown Switchbacks**. Both players choose **Ready to race**. The game places both cars on the starting grid and begins a shared three-second countdown after both acknowledge their positions.

Downtown Switchbacks runs for approximately 2.26 km through the existing downtown streets, with 12 rounded right/left turns. Glowing roadside chevrons mark the next two corners. The turn card shows direction, distance and corner number; braking guidance appears earlier at higher speeds. The 45 km/h indication is cornering advice, not a speed limiter.

Follow the highlighted route and pass checkpoint gates in order. The server records progress, finishing time, penalties and results. **R** returns to the last checkpoint with a five-second penalty. Outside a race, normal road recovery remains available. Your race clock continues while you pause. A finished player waits for the other player for up to 120 seconds; an unfinished player then receives DNF. The host can choose **Rematch** or **Free roam**.

The cars keep local driving physics. This is casual racing between friends, not a server-simulated competitive anti-cheat system. Ghost cars avoid network-dependent impact physics.

## Server ownership and deployment

The frontend remains on its existing Sites address. Room coordination runs in a separate Cloudflare Worker, with one SQLite-backed Durable Object per room. The URL is public configuration in `public/multiplayer-config.json`. A `VITE_MULTIPLAYER_URL` build/development variable can override it. No Cloudflare deployment credentials belong in this file, browser code, Git or ZIPs.

The permanent server is deployed in the owner's verified Cloudflare account at `https://sunspoke-multiplayer.sunspoke-coast.workers.dev`. No temporary-account claim is required. Solo driving continues when the server is unavailable. Deployments use the owner's existing account settings; this project does not enable a paid plan.

For later deployments, sign in to the claimed Cloudflare account and run:

```sh
npx wrangler login
npm run build
npm run multiplayer:check
npm run multiplayer:deploy
```

The build regenerates the race catalog from the actual roads. Deploy the matching backend before publishing the frontend. The Worker can also serve explicitly verified published builds that use the same race catalog. Both players in a room must use the same map ID. Backend allowed origins are configured in `backend/wrangler.jsonc`; the current Site and explicit localhost development ports are supported.

After publishing, verify room creation and joining with the published build's map ID. Find the ID in the game bundle or append `:rooms-v1` to the fingerprint from the published site's `/world/metadata.json`. Pass it to the network check after the Worker URL, Site origin, and race ID:

```sh
node checks/multiplayer-network.mjs <worker-url> <site-origin> airport <published-map-id>
```

## Local development and checks

After `npm ci`, run the backend and frontend in separate terminals:

```sh
npm run multiplayer:dev
```

PowerShell frontend terminal:

```powershell
$env:VITE_MULTIPLAYER_URL = 'http://127.0.0.1:8787'
npm run dev
```

Run server/domain checks and actual client-session checks:

```sh
npm run multiplayer:check
node checks/multiplayer-network.mjs
node checks/session-checks.mjs
```

The last two commands expect a running backend on port 8787. An explicit backend URL can be supplied as their final argument. They connect actual WebSocket clients and exercise the production RoomSession implementation without a rendering loop. They are not browser visual or FPS tests.

Clients send up to 20 snapshots per second, interpolate remote motion 100 ms behind and extrapolate at most 200 ms. Sequence numbers discard stale updates; pose epochs make resets snap directly. Socket reconnection reserves a player slot for 30 seconds. A host leaving or expiring closes the room; a guest leaving frees their slot. The frontend remains playable solo after network errors.
