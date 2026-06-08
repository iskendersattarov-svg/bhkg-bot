const AT = process.env.AIRTABLE_TOKEN;
const BASE = 'appQGNsUDfjxnDSKP';
const DEBTORS_TABLE = 'tbl1oRCKWQYjXgOA7';

function fmt(n) { return n ? Math.round(n).toLocaleString('ru-RU') : '0'; }

function normalizePhone(phone) {
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('0')) p = '996' + p.slice(1);
  if (!p.startsWith('996')) p = '996' + p;
  return p;
}

async function sendSmsNikita(phone, message) {
  const login    = process.env.NIKITA_LOGIN;
  const password = process.env.NIKITA_PASSWORD;
  const sender   = process.env.NIKITA_SENDER || 'BHKG';
  if (!login || !password) throw new Error('NIKITA creds not set');

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.api.giper.mobi/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:sendMessage>
      <login>${login}</login><password>${password}</password>
      <sender>${sender}</sender><message>${message}</message>
      <phones><phone>${phone}</phone></phones>
    </ws:sendMessage>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch('https://smspro.nikita.kg:443/api/soap', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    body: soapBody
  });
  const text = await res.text();
  const code = parseInt((text.match(/<code>(\d+)<\/code>/) || [])[1] ?? '-1');
  return code === 0;
}

async function fetchScheduled() {
  const now = new Date(Date.now() + 6 * 3600 * 1000); // KG = UTC+6
  const todayDay    = now.getUTCDate();
  const tomorrowDay = new Date(now.getTime() + 86400000).getUTCDate();

  let records = [], offset = '';
  do {
    const url = `https://api.airtable.com/v0/${BASE}/${DEBTORS_TABLE}?pageSize=100${offset ? '&offset=' + offset : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AT}` } });
    const data = await res.json();
    records = records.concat(data.records || []);
    offset = data.offset || '';
  } while (offset);

  const todays = [], tomorrows = [];
  for (const r of records) {
    const f = r.fields;
    if (!f['Телефон'] || !f['Остаток'] || f['Остаток'] <= 0 || !f['День оплаты']) continue;
    const d = {
      name:   f['Имя'] || '',
      apt:    f['Квартира'] || '',
      proj:   f['Объект'] || '',
      ost:    f['Остаток'] || 0,
      cur:    f['Валюта'] || '',
      phone:  f['Телефон'] || '',
      payDay: f['День оплаты']
    };
    if (f['День оплаты'] === todayDay)    todays.push(d);
    if (f['День оплаты'] === tomorrowDay) tomorrows.push(d);
  }
  return { todays, tomorrows, todayDay, tomorrowDay };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { todays, tomorrows, todayDay, tomorrowDay } = await fetchScheduled();

  // GET — just return the preview list (no SMS)
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, todays, tomorrows, todayDay, tomorrowDay });
  }

  // POST — actually send SMS
  if (req.method !== 'POST') return res.status(405).end();

  const results = [];

  for (const d of todays) {
    const phone = normalizePhone(d.phone);
    const msg = `${d.name}, segodnya den oplaty kv.${d.apt} (${d.proj}). Summa: ${fmt(d.ost)} ${d.cur}. Prosba oplatit. Business House KG`;
    try {
      const ok = await sendSmsNikita(phone, msg);
      results.push({ type: 'today', name: d.name, apt: d.apt, phone, ok });
    } catch(e) {
      results.push({ type: 'today', name: d.name, apt: d.apt, phone, ok: false, error: e.message });
    }
  }

  for (const d of tomorrows) {
    const phone = normalizePhone(d.phone);
    const msg = `${d.name}, zavtra den oplaty kv.${d.apt} (${d.proj}). Ostatok: ${fmt(d.ost)} ${d.cur}. Business House KG`;
    try {
      const ok = await sendSmsNikita(phone, msg);
      results.push({ type: 'tomorrow', name: d.name, apt: d.apt, phone, ok });
    } catch(e) {
      results.push({ type: 'tomorrow', name: d.name, apt: d.apt, phone, ok: false, error: e.message });
    }
  }

  return res.status(200).json({
    ok: true,
    sent: results.filter(r => r.ok).length,
    total: results.length,
    results
  });
};
