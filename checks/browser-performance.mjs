import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { setTimeout as wait } from 'node:timers/promises';

const options = new Map(process.argv.slice(2).map(value => {
  const separator = value.indexOf('=');
  assert.ok(value.startsWith('--') && separator > 2, 'Options must use --name=value.');
  return [value.slice(2, separator), value.slice(separator + 1)];
}));

function option(name, fallback) {
  return options.get(name) ?? fallback;
}

function integerOption(name, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(option(name, fallback));
  assert.ok(Number.isSafeInteger(value) && value >= minimum && value <= maximum, `--${name} must be an integer between ${minimum} and ${maximum}.`);
  return value;
}

const quality = option('quality', 'medium');
assert.ok(['low', 'medium', 'high'].includes(quality), '--quality must be low, medium, or high.');
const routeOption = option('route', 'all');
const minutes = integerOption('minutes', 5, 1, 60);
const runs = integerOption('runs', 3, 1, 20);
const width = integerOption('width', 1920, 640, 7680);
const height = integerOption('height', 1080, 480, 4320);
const expectedRenderer = option('expect-renderer', '');
const outputPath = resolve(option('output', '.cache/browser-performance/report.json'));
const routeDefinitions = [
  { id: 'beachfront', name: 'Beachfront Circuit', origin: null },
  { id: 'crosstown', name: 'Crosstown Freeway', origin: 'Crosstown Freeway' },
  { id: 'silver-lake', name: 'Silver Lake Circuit', origin: 'Silver Lake Circuit' }
];
const selectedRoutes = routeOption === 'all'
  ? routeDefinitions
  : routeDefinitions.filter(route => route.id === routeOption);
assert.ok(selectedRoutes.length, '--route must be all, beachfront, crosstown, or silver-lake.');

const suppliedBaseUrl = option('base-url', '');
const server = suppliedBaseUrl ? undefined : spawn(
  process.execPath,
  ['scripts/serve.mjs', '--no-open'],
  { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] }
);
let baseUrl = suppliedBaseUrl ? suppliedBaseUrl.replace(/\/$/, '') + '/' : '';
let serverReader;
const profile = await mkdtemp(join(tmpdir(), 'sunspoke-performance-'));
const chrome = join(process.env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe');
const browser = spawn(chrome, [
  '--headless=new',
  '--remote-debugging-port=0',
  '--user-data-dir=' + profile,
  '--no-first-run',
  '--no-default-browser-check',
  `--window-size=${width},${height}`,
  'about:blank'
], { windowsHide: true, stdio: 'ignore' });

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  quality,
  viewport: [width, height],
  runsPerRoute: runs,
  minutesPerRun: minutes,
  targets: { averageFps: 30, p95Ms: 33.5, p99Ms: 50, stallsOver100Ms: 0 },
  hardware: null,
  measurements: [],
  checkpoints: [],
  consoleErrors: [],
  failedRequests: []
};
const pending = new Map();
let ws;
let sequence = 0;
const interruption = new AbortController();
const interrupt = () => interruption.abort(new Error('Performance run interrupted.'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

async function until(test, message, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    interruption.signal.throwIfAborted();
    const result = await test();
    if (result) return result;
    await wait(160, undefined, { signal: interruption.signal });
  }
  throw Error(message);
}

async function localUrl() {
  if (baseUrl) return baseUrl;
  assert.ok(server, 'Could not start the local production server.');
  serverReader = createInterface({ input: server.stdout });
  return new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(Error('The production server did not become ready. Run npm run build first.')), 30_000);
    serverReader.on('line', line => {
      const match = line.match(/Sunspoke Coast is ready at (https?:\/\/\S+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolveUrl(match[1].replace(/\/+$/, '') + '/');
    });
    server.once('error', reject);
    server.once('exit', code => reject(Error(`The production server exited with status ${code}.`)));
  });
}

function call(method, params = {}) {
  return new Promise((resolveResult, rejectResult) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveResult, reject: rejectResult });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });
  if (exceptionDetails) throw Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function click(id) {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
}

async function key(code, down) {
  const numbers = { KeyW: 87, KeyA: 65, KeyD: 68, ShiftLeft: 16 };
  const base = { code, windowsVirtualKeyCode: numbers[code], key: code.startsWith('Key') ? code.slice(3).toLowerCase() : 'Shift' };
  await call('Input.dispatchKeyEvent', { ...base, type: down ? 'rawKeyDown' : 'keyUp' });
}

async function saveReport() {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
}

function roadDrivingProgram(roadName, centerOrigin) {
  return `(() => {
    const game = window.__SUNSPOKE__;
    const road = ${centerOrigin ? 'game.world.roads[0]' : `game.world.roads.find(candidate => candidate.name === ${JSON.stringify(roadName)})`};
    if (!road || road.points.length < 4) throw Error('Could not find a drivable route for ${roadName}.');
    const points = road.points, first = points[0], next = points[1];
    game.drive.teleport(first.clone(), Math.atan2(first.x - next.x, first.z - next.z), true);
    const down = new Set(), pilot = { waypoint: 1, laps: 0, distance: 0, recoveries: 0, backgroundFrames: 0 };
    let last = first.clone(), tickAt = performance.now(), stalledFor = 0;
    function pressed(code, value) {
      if (down.has(code) === value) return;
      if (value) down.add(code); else down.delete(code);
      window.dispatchEvent(new KeyboardEvent(value ? 'keydown' : 'keyup', { code, bubbles: true }));
    }
    const tick = () => {
      const state = game.drive.state, now = performance.now(), dt = Math.min(.125, (now - tickAt) / 1000);
      tickAt = now;
      if (document.hidden || !document.hasFocus()) pilot.backgroundFrames++;
      pilot.distance += Math.hypot(state.position.x - last.x, state.position.z - last.z);
      last.copy(state.position);
      const lookAhead = 6 + Math.max(state.speed, 0) * .33, period = points.length - 1;
      for (let i = 0; i < 8; i++) {
        if (Math.hypot(state.position.x - points[pilot.waypoint].x, state.position.z - points[pilot.waypoint].z) >= lookAhead) break;
        pilot.waypoint++;
        if (pilot.waypoint >= period) { pilot.waypoint = 0; pilot.laps++; }
      }
      const point = points[pilot.waypoint], dx = point.x - state.position.x, dz = point.z - state.position.z;
      const error = Math.atan2(-dx, -dz) - state.heading, distance = Math.hypot(dx, dz);
      const steering = Math.atan2(2 * 2.895 * Math.sin(error), Math.max(1, distance));
      const reversing = Math.abs(Math.atan2(Math.sin(error), Math.cos(error))) > 1.55;
      pressed('KeyA', steering > .009 && state.steering < steering - .008);
      pressed('KeyD', steering < -.009 && state.steering > steering + .008);
      const target = reversing ? 3 : Math.abs(steering) > .28 ? 6 : 10;
      pressed('KeyW', state.speed < target);
      pressed('ShiftLeft', state.speed > target + 3);
      if (state.speed < .15) stalledFor += dt; else stalledFor = 0;
      if (distance > 35 || stalledFor > 2) {
        pilot.recoveries++;
        let nearest = pilot.waypoint;
        if (distance > 35) {
          nearest = 0;
          for (let i = 1; i < period; i++) if (points[i].distanceToSquared(state.position) < points[nearest].distanceToSquared(state.position)) nearest = i;
        } else nearest = (pilot.waypoint + 5) % period;
        const from = points[nearest], to = points[(nearest + 1) % period];
        game.drive.teleport(from.clone(), Math.atan2(from.x - to.x, from.z - to.z), true);
        pilot.waypoint = (nearest + 1) % period;
        last.copy(from);
        stalledFor = 0;
      }
    };
    const timer = setInterval(tick, 18);
    window.__browserPerformancePilot = {
      pilot,
      stop() { clearInterval(timer); for (const code of down) pressed(code, false); }
    };
    return { route: road.name, points: points.length, quality: game.stats().quality };
  })()`;
}

async function runRoute(route, runIndex, runCount) {
  const setup = await evaluate(roadDrivingProgram(route.name, route.origin === null));
  assert.equal(setup.quality, quality, `${route.name} must render at ${quality} quality.`);
  await wait(runIndex === 0 ? 8_000 : 4_000, undefined, { signal: interruption.signal });
  await evaluate('window.__SUNSPOKE__.clearStats(); Object.assign(window.__browserPerformancePilot.pilot, { laps: 0, distance: 0, recoveries: 0, backgroundFrames: 0 }); true');
  const started = performance.now();
  for (let minute = 1; minute <= minutes; minute++) {
    await wait(Math.max(0, started + minute * 60_000 - performance.now()), undefined, { signal: interruption.signal });
    const snapshot = await evaluate('({ game: window.__SUNSPOKE__.stats(), route: window.__browserPerformancePilot.pilot })');
    const data = {
      route: route.id,
      run: runIndex + 1,
      checkpointMinute: minute,
      fps: snapshot.game.fps,
      p95Ms: snapshot.game.p95Ms,
      p99Ms: snapshot.game.p99Ms,
      maxFrameMs: snapshot.game.maxFrameMs,
      overBudgetFrames: snapshot.game.overBudgetFrames,
      stallsOver100Ms: snapshot.game.stallsOver100Ms,
      stallSamples: snapshot.game.stallSamples,
      phases: snapshot.game.phases,
      meanLogicMs: snapshot.game.meanLogicMs,
      meanRenderSubmitMs: snapshot.game.meanRenderSubmitMs,
      p95LogicMs: snapshot.game.p95LogicMs,
      p95RenderSubmitMs: snapshot.game.p95RenderSubmitMs,
      drawCalls: snapshot.game.drawCalls,
      triangles: snapshot.game.triangles,
      visibleStaticTiles: snapshot.game.visibleStaticTiles,
      heapUsed: snapshot.game.heapUsed,
      position: snapshot.game.position,
      warmup: snapshot.game.warmup,
      programs: snapshot.game.programs,
      scenery: snapshot.game.scenery,
      distanceMeters: Math.round(snapshot.route.distance),
      recoveries: snapshot.route.recoveries,
      backgroundFrames: snapshot.route.backgroundFrames
    };
    console.log(JSON.stringify(data));
    report.checkpoints.push(data);
    await saveReport();
  }
  const result = await evaluate('window.__browserPerformancePilot.stop(); ({ ...window.__SUNSPOKE__.stats(), pilot: window.__browserPerformancePilot.pilot })');
  const measurement = {
    route: route.id,
    routeName: setup.route,
    run: runIndex + 1,
    runs: runCount,
    points: setup.points,
    stats: result,
    acceptance: {
      averageFps: result.fps >= report.targets.averageFps,
      p95FrameTime: result.p95Ms <= report.targets.p95Ms,
      p99FrameTime: result.p99Ms <= report.targets.p99Ms,
      noLongStalls: result.stallsOver100Ms === 0,
      foreground: result.pilot.backgroundFrames === 0,
      routeCoverage: result.pilot.distance >= Math.min(1_500, minutes * 300),
      noRouteRecoveries: result.pilot.recoveries === 0,
      nativeResolution: quality === 'low' || (result.renderWidth === width && result.renderHeight === height),
      noAssetErrors: (result.assets?.length ?? 0) === 0,
      noBrowserErrors: report.consoleErrors.length === 0,
      noFailedRequests: report.failedRequests.length === 0
    }
  };
  report.measurements.push(measurement);
  console.log(JSON.stringify({ route: measurement.route, run: measurement.run, acceptance: measurement.acceptance }));
  await saveReport();
}

try {
  baseUrl = await localUrl();
  const browserPort = await until(async () => {
    try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
    catch { return undefined; }
  }, 'Chrome did not open its DevTools port.');
  const tabs = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json();
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', rejectOpen, { once: true });
  });
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const promise = pending.get(message.id);
    if (promise) {
      pending.delete(message.id);
      if (message.error) promise.reject(Error(message.error.message));
      else promise.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') report.consoleErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') report.consoleErrors.push(message.params.args.map(argument => argument.value ?? argument.description).join(' '));
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) report.failedRequests.push(`${message.params.response.status} ${message.params.response.url}`);
  });
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.bringToFront');
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  baseUrl = baseUrl.replace(/\/+$/, '') + '/';
  report.baseUrl = baseUrl;
  await call('Page.navigate', { url: baseUrl + '?qa=1&quality=' + encodeURIComponent(quality) });
  await until(() => evaluate('Boolean(window.__SUNSPOKE__ && !document.querySelector("#drive").disabled)'), 'The game did not finish loading.', 120_000);
  await click('drive');
  await until(() => evaluate('!document.getElementById("hud").hidden'), 'The driving screen did not open.');
  const hardware = await evaluate('({ ...window.__SUNSPOKE__.stats(), visible: document.visibilityState, focused: document.hasFocus() })');
  assert.equal(hardware.visible, 'visible', 'The performance run must remain in the foreground.');
  assert.equal(hardware.focused, true, 'Chrome must remain focused during performance runs.');
  assert.deepEqual([hardware.width, hardware.height], [width, height]);
  if (expectedRenderer) assert.match(hardware.renderer, new RegExp(expectedRenderer, 'i'));
  report.hardware = {
    browser: await evaluate('navigator.userAgent'),
    renderer: hardware.renderer,
    viewport: [width, height],
    renderSize: [hardware.renderWidth, hardware.renderHeight],
    devicePixelRatio: hardware.devicePixelRatio,
    build: hardware.build ?? null,
    warmup: hardware.warmup,
    programs: hardware.programs,
    rendering: hardware.rendering,
    visibility: hardware.visible,
    focused: hardware.focused
  };
  console.log('Using', JSON.stringify(report.hardware));
  for (const route of selectedRoutes) for (let runIndex = 0; runIndex < runs; runIndex++) await runRoute(route, runIndex, runs);
  const failed = report.measurements.flatMap(measurement => Object.entries(measurement.acceptance).filter(([, passed]) => !passed).map(([criterion]) => `${measurement.route} run ${measurement.run} failed ${criterion}`));
  report.completedAt = new Date().toISOString();
  report.passed = failed.length === 0;
  report.failures = failed;
  await saveReport();
  assert.equal(report.passed, true, `Performance acceptance failed. See ${outputPath}.`);
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.passed = false;
  report.error = String(error);
  await saveReport();
  throw error;
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  ws?.close();
  browser.kill();
  serverReader?.close();
  server?.kill();
  await wait(750);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
