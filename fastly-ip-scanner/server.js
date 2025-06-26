import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;

// جایگزین کنید با API Key خودتان از RIPE Atlas
const API_KEY = 'YOUR_RIPE_ATLAS_API_KEY_HERE';

// مسیر دایرکتوری public برای فایل‌های استاتیک (فرانت‌اند)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

async function createMeasurement(domain) {
  const res = await fetch('https://atlas.ripe.net/api/v2/measurements/', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      definitions: [{ target: domain, type: 'ping', af: 4 }],
      probes: [{ requested: 5, type: 'area', value: 'WW' }]
    })
  });
  const data = await res.json();
  if (!data.measurements || data.measurements.length === 0) {
    throw new Error('Failed to create measurement');
  }
  return data.measurements[0];
}

async function getMeasurementStatus(id) {
  const res = await fetch(`https://atlas.ripe.net/api/v2/measurements/${id}/status-check`, {
    headers: { 'Authorization': `Key ${API_KEY}` }
  });
  return res.json();
}

async function getMeasurementResults(id) {
  const res = await fetch(`https://atlas.ripe.net/api/v2/measurements/${id}/result/`, {
    headers: { 'Authorization': `Key ${API_KEY}` }
  });
  return res.json();
}

async function waitForResults(id) {
  let status;
  while (true) {
    status = await getMeasurementStatus(id);
    if (status.global_alert || Object.keys(status.probes).length > 0) {
      break;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
}

app.get('/ping/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const measurementId = await createMeasurement(domain);
    await waitForResults(measurementId);
    const results = await getMeasurementResults(measurementId);

    // میانگین RTT هر probe را محاسبه می‌کنیم
    const probeRtt = {};
    results.forEach(entry => {
      const prbId = entry.prb_id;
      if (!probeRtt[prbId]) probeRtt[prbId] = [];
      entry.result.forEach(r => probeRtt[prbId].push(r.rtt));
    });
    const avgRtt = Object.entries(probeRtt).map(([prb, rtts]) => ({
      probe: prb,
      avgRtt: rtts.reduce((a, b) => a + b, 0) / rtts.length
    }));

    res.json({ domain, results: avgRtt });
  } catch (e) {
    res.status(500).json({ error: e.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
