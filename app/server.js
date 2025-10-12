import express from "express";
import jwt from "jsonwebtoken";
import client from "prom-client";

const app = express();
app.use(express.json());
const delay = ms => new Promise(r => setTimeout(r, ms));
const SECRET = "dev-secret";

// Prometheus metrics
const register = new client.Registry();

// Clear any existing metrics to avoid conflicts
register.clear();

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({
  register,
  timeout: 5000,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5] // GC duration buckets
});

// Custom HTTP duration histogram
const httpDuration = new client.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status_code"],
  buckets: [50, 100, 200, 400, 800, 1600, 3200]
});
register.registerMetric(httpDuration);

// Custom application metrics
const activeConnections = new client.Gauge({
  name: "nodejs_active_connections_total",
  help: "Total number of active connections"
});
register.registerMetric(activeConnections);

const heapUsageGauge = new client.Gauge({
  name: "nodejs_heap_usage_ratio",
  help: "Heap usage as a ratio of heap limit",
  collect() {
    const memUsage = process.memoryUsage();
    this.set(memUsage.heapUsed / memUsage.heapTotal);
  }
});
register.registerMetric(heapUsageGauge);

// Note: nodejs_eventloop_lag_seconds is already provided by collectDefaultMetrics

// timing middleware
app.use(async (req, res, next) => {
  const start = Date.now();

  // Track active connections
  activeConnections.inc();

  res.on("finish", () => {
    const dur = Date.now() - start;
    httpDuration.labels(req.method, req.route?.path || req.path, res.statusCode).observe(dur);
    activeConnections.dec();
  });

  res.on("close", () => {
    activeConnections.dec();
  });

  next();
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/auth", async (req, res) => {
  const { email, password } = req.body || {};
  await delay(80 + Math.random() * 120);
  if (!email || !password) return res.status(400).json({ error: "bad creds" });
  const token = jwt.sign({ sub: email }, SECRET, { expiresIn: "10m" });
  res.json({ token });
});

app.get("/products", async (_, res) => {
  await delay(50 + Math.random() * 150);
  res.json([{ id: 1, name: "Widget", price: 10.5 }, { id: 2, name: "Gizmo", price: 20 }]);
});

app.post("/cart", async (req, res) => {
  await delay(60 + Math.random() * 200);
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "no token" });
  res.json({ cartId: "c-" + Math.random().toString(36).slice(2) });
});

app.post("/checkout", async (req, res) => {
  await delay(120 + Math.random() * 300);
  res.json({ orderId: "o-" + Math.random().toString(36).slice(2), status: "OK" });
});

// Prometheus endpoint
app.get("/metrics", async (_, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("API on :" + port));