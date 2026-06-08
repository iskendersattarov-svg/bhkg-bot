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

function buildMsg(type, d) {
  const name = d.name.split(' ')[1] || d.name; // Имя (без фамилии)
  const sum = `${fmt(d.ost)} ${d.cur}`;
  const proj = d.proj === 'Green Park' ? 'Green Park' : 'White House';
  if (type === 'tomorrow') {
    return `Zdravstvuyte, ${name}! Zavtra ${d.payDay}-e — srok oplaty kv.${d.apt} (${proj}). Summa: ${sum}. Business House KG`;
  }
  if (type === 'today') {
    return `Zdravstvuyte, ${name}! Segodnya ${d.payDay}-e — srok oplaty kv.${d.apt} (${proj}). Prosim oplatit ${sum}. Business House KG`;
  }
  if (type === 'overdue3') {
    return `Zdravstvuyte, ${name}! Oplata po kv.${d.apt} (${proj}) prosrochena na 3 dnya. Zadoljennost: ${sum}. Prosim srochno pogasit. Business House KG`;
  }
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

  const todays = [], tomorrows = [], overdue3 = [];
  for (const r of records) {
    const f = r.fields;
    if (!f['Телефон'] || !f['Остаток'] || f['Остаток'] <= 0) continue;
    const d = {
      name:   f['Имя'] || '',
      apt:    f['Квартира'] || '',
      proj:   f['Объект'] || '',
      ost:    f['Остаток'] || 0,
      cur:    f['Валюта'] || '',
      phone:  f['Телефон'] || '',
      payDay: f['День оплаты'] || 0,
      days:   f['Дней просрочки'] || 0
    };
    if (d.payDay && d.payDay === todayDay)    todays.push(d);
    if (d.payDay && d.payDay === tomorrowDay) tomorrows.push(d);
    if (d.days === 3)                         overdue3.push(d);
  }
  return { todays, tomorrows, overdue3, todayDay, tomorrowDay };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { todays, tomorrows, overdue3, todayDay, tomorrowDay } = await fetchScheduled();

  // GET — preview list only, no SMS
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, todays, tomorrows, overdue3, todayDay, tomorrowDay });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const results = [];

  const sendGroup = async (list, type) => {
    for (const d of list) {
      const phone = normalizePhone(d.phone);
      const msg = buildMsg(type, d);
      try {
        const ok = await sendSmsNikita(phone, msg);
        results.push({ type, name: d.name, apt: d.apt, phone, ok, msg });
      } catch(e) {
        results.push({ type, name: d.name, apt: d.apt, phone, ok: false, error: e.message });
      }
    }
  };

  await sendGroup(tomorrows, 'tomorrow');
  await sendGroup(todays,    'today');
  await sendGroup(overdue3,  'overdue3');

  return res.status(200).json({
    ok: true,
    sent: results.filter(r => r.ok).length,
    total: results.length,
    results
  });
};
