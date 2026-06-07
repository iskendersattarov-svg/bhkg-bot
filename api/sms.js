const AT = process.env.AIRTABLE_TOKEN;
const BASE = 'appQGNsUDfjxnDSKP';
const DEBTORS_TABLE = 'tbl1oRCKWQYjXgOA7';

function fmt(n) { return n ? Math.round(n).toLocaleString('ru-RU') : '0'; }

// Send SMS via Nikita.kg SOAP API
async function sendSmsNikita(phones, message) {
  const login    = process.env.NIKITA_LOGIN;
  const password = process.env.NIKITA_PASSWORD;
  const sender   = process.env.NIKITA_SENDER || 'BHKG';

  if (!login || !password) throw new Error('NIKITA_LOGIN / NIKITA_PASSWORD не заданы в Vercel env');

  const phonesXml = phones.map(p => `<phone>${p}</phone>`).join('');
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.api.giper.mobi/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:sendMessage>
      <login>${login}</login>
      <password>${password}</password>
      <sender>${sender}</sender>
      <message>${message}</message>
      <phones>${phonesXml}</phones>
    </ws:sendMessage>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch('https://smspro.nikita.kg:443/api/soap', {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    body: soapBody
  });

  const text = await res.text();
  const codeMatch = text.match(/<code>(\d+)<\/code>/);
  const descMatch = text.match(/<description>(.*?)<\/description>/);
  const code = codeMatch ? parseInt(codeMatch[1]) : -1;
  return { ok: code === 0, code, description: descMatch ? descMatch[1] : text.slice(0, 200) };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { debtors, minDays = 0 } = req.body;

  // If debtors list provided directly (from dashboard), use it
  // Otherwise, fetch from Airtable
  let list = debtors;
  if (!list || !list.length) {
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${DEBTORS_TABLE}`, {
      headers: { Authorization: `Bearer ${AT}` }
    });
    const data = await r.json();
    list = (data.records || []).map(rec => ({
      phone: rec.fields['Телефон'] || '',
      name:  rec.fields['Имя']    || '',
      apt:   rec.fields['Квартира'] || '',
      proj:  rec.fields['Объект']  || '',
      ost:   rec.fields['Остаток'] || 0,
      cur:   rec.fields['Валюта']  || '',
      days:  rec.fields['Дней просрочки'] || 0
    }));
  }

  // Filter: must have phone, must meet minDays threshold
  const targets = list.filter(d => d.phone && d.days >= minDays);
  if (!targets.length) return res.status(200).json({ ok: true, sent: 0, message: 'Нет должников с телефоном' });

  const results = [];
  for (const d of targets) {
    // Clean phone: strip non-digits, ensure starts with 996
    let phone = d.phone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '996' + phone.slice(1);
    if (!phone.startsWith('996')) phone = '996' + phone;

    // Short message — Cyrillic SMS limit is 70 chars per part
    const msg = `${d.name}, кв.${d.apt}: долг ${fmt(d.ost)} ${d.cur}, ${d.days}дн. просрочки. BHKG`;

    try {
      const r = await sendSmsNikita([phone], msg);
      results.push({ phone, name: d.name, ...r });
    } catch(e) {
      results.push({ phone, name: d.name, ok: false, description: e.message });
    }
  }

  const sent = results.filter(r => r.ok).length;
  return res.status(200).json({ ok: true, sent, total: targets.length, results });
};
