const AT = process.env.AIRTABLE_TOKEN;
const BASE = 'appQGNsUDfjxnDSKP';
const BAL_TABLE   = 'tblmh8pbeCrYVOrHQ';
const SALES_TABLE = 'tblPjnNSuOSknfcch';
const DEBTORS_TABLE = 'tbl1oRCKWQYjXgOA7';
const MOV_TABLE   = 'tblH7zcYRnRRCKjEL';
const SMS_TABLE   = 'tbln82wf1vlKsuAdl';

function fmt(n) { return n ? Math.round(n).toLocaleString('ru-RU') : '0'; }

async function atFetch(path, opts = {}) {
  return fetch(`https://api.airtable.com/v0/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${AT}`, 'Content-Type': 'application/json', ...opts.headers }
  });
}

async function getBalances() {
  const res = await atFetch(`${BASE}/${BAL_TABLE}`);
  const data = await res.json();
  const balances = {};
  for (const record of data.records || []) {
    const name = record.fields['Name'];
    if (!name) continue;
    const obj = { id: record.id };
    for (const line of (record.fields['Notes'] || '').split('\n')) {
      const [k, v] = line.split('=');
      if (!k || !v) continue;
      const key = k.trim();
      obj[key] = key === 'date' ? v.trim() : (parseFloat(v.trim()) || 0);
    }
    balances[name] = obj;
  }
  return balances;
}

async function updateBalance(bal, data, dateStr) {
  const notes = `nal_som=${data.balNalSom}\nnal_usd=${data.balNalUsd}\nmb_som=0\nmb_usd=0\ndate=${dateStr}`;
  await atFetch(`${BASE}/${BAL_TABLE}/${bal.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Notes: notes } })
  });
}

async function saveSales(proj, data) {
  if (!data) return;
  const filter = encodeURIComponent(`{Объект}="${proj}"`);
  const ex = await (await atFetch(`${BASE}/${SALES_TABLE}?filterByFormula=${filter}`)).json();
  const fields = {
    'Объект': proj,
    'Продано': data.totalSold || 0,
    'Всего': data.totalApts || 0,
    'Сумма USD': data.sumUsd || 0,
    'Сумма сом': data.sumSom || 0,
    'Расторжений': data.cancels || 0,
    'Дата': new Date().toISOString().slice(0, 10)
  };
  if (ex.records && ex.records.length > 0) {
    await atFetch(`${BASE}/${SALES_TABLE}/${ex.records[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields })
    });
  } else {
    await atFetch(`${BASE}/${SALES_TABLE}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] })
    });
  }
}

async function saveDebtors(proj, data) {
  if (!data || !data.debtors || data.debtors.length === 0) return;
  const dateStr = new Date().toISOString().slice(0, 10);
  const filter = encodeURIComponent(`{Объект}="${proj}"`);
  const fieldParam = encodeURIComponent('Объект');
  const ex = await (await atFetch(`${BASE}/${DEBTORS_TABLE}?filterByFormula=${filter}&fields[]=${fieldParam}`)).json();
  if (ex.records && ex.records.length > 0) {
    const ids = ex.records.map(r => r.id);
    for (let i = 0; i < ids.length; i += 10) {
      const qs = ids.slice(i, i + 10).map(id => `records[]=${id}`).join('&');
      await atFetch(`${BASE}/${DEBTORS_TABLE}?${qs}`, { method: 'DELETE' });
    }
  }
  const allDebtors = data.debtors;
  for (let i = 0; i < allDebtors.length; i += 10) {
    const batch = allDebtors.slice(i, i + 10).map(d => ({
      fields: {
        'Объект': proj,
        'Квартира': d.apt || 0,
        'Имя': d.name || '',
        'Дней просрочки': d.days || 0,
        'Остаток': d.ost || 0,
        'Валюта': d.cur || '$',
        'Телефон': d.phone || '',
        'Оплачено': d.paid || 0,
        'Сумма договора': d.total || 0,
        'День оплаты': d.payDay || 0,
        'Дата': dateStr
      }
    }));
    await atFetch(`${BASE}/${DEBTORS_TABLE}`, {
      method: 'POST',
      body: JSON.stringify({ records: batch })
    });
  }
}

// Save SMS queue (today/tomorrow/overdue3) — fast, only a few records
async function saveSmsQueue(gpData, whData, dateStr) {
  // KG time = UTC+6
  const now = new Date(Date.now() + 6 * 3600 * 1000);
  const todayDay    = now.getUTCDate();
  const tomorrowDay = new Date(now.getTime() + 86400000).getUTCDate();

  const allDebtors = [];
  if (gpData && gpData.debtors) gpData.debtors.forEach(d => allDebtors.push({ ...d, proj: 'Green Park' }));
  if (whData && whData.debtors) whData.debtors.forEach(d => allDebtors.push({ ...d, proj: 'White House' }));

  const todays   = allDebtors.filter(d => d.payDay === todayDay && d.ost > 0 && d.phone);
  const tomorrows= allDebtors.filter(d => d.payDay === tomorrowDay && d.ost > 0 && d.phone);
  const overdue3 = allDebtors.filter(d => d.days === 3 && d.ost > 0 && d.phone);

  // Delete old records for today
  const ex = await (await atFetch(`${BASE}/${SMS_TABLE}?filterByFormula=${encodeURIComponent(`{Дата}="${dateStr}"`)}`)).json();
  if (ex.records && ex.records.length > 0) {
    const ids = ex.records.map(r => r.id);
    for (let i = 0; i < ids.length; i += 10) {
      const qs = ids.slice(i, i + 10).map(id => `records[]=${id}`).join('&');
      await atFetch(`${BASE}/${SMS_TABLE}?${qs}`, { method: 'DELETE' });
    }
  }

  // Save today/tomorrow/overdue3 as 3 records
  const records = [
    { fields: { 'Тип': 'today',    'Дата': dateStr, 'Список': JSON.stringify(todays) } },
    { fields: { 'Тип': 'tomorrow', 'Дата': dateStr, 'Список': JSON.stringify(tomorrows) } },
    { fields: { 'Тип': 'overdue3', 'Дата': dateStr, 'Список': JSON.stringify(overdue3) } }
  ];
  await atFetch(`${BASE}/${SMS_TABLE}`, { method: 'POST', body: JSON.stringify({ records }) });
}

// Save daily movements to Airtable — upsert by date + project
async function saveMovements(proj, data, dateStr) {
  if (!data) return;
  const filter = encodeURIComponent(`AND({Объект}="${proj}",{Дата}="${dateStr}")`);
  const ex = await (await atFetch(`${BASE}/${MOV_TABLE}?filterByFormula=${filter}`)).json();
  const fields = {
    'Объект':          proj,
    'Дата':            dateStr,
    'Приход нал сом':  data.incNalSom || 0,
    'Расход нал сом':  data.expNalSom || 0,
    'Приход нал USD':  data.incNalUsd || 0,
    'Расход нал USD':  data.expNalUsd || 0,
    'Приход Mbank':    data.incMbSom  || 0,
    'Остаток сом':     data.balNalSom || 0,
    'Остаток USD':     data.balNalUsd || 0
  };
  if (ex.records && ex.records.length > 0) {
    await atFetch(`${BASE}/${MOV_TABLE}/${ex.records[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields })
    });
  } else {
    await atFetch(`${BASE}/${MOV_TABLE}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] })
    });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { gp, wh, yDate, rawDate, today } = req.body;
  if (!gp && !wh) return res.status(400).json({ ok: false, error: 'No data' });

  // Use rawDate for Airtable (YYYY-MM-DD), yDate for Telegram display
  const dateStr = rawDate || new Date().toISOString().slice(0, 10);

  // Read stored balances before overwriting
  let balances = {};
  if (AT) {
    try { balances = await getBalances(); } catch(e) { console.error('getBalances:', e); }
  }

  // ── Telegram message: just the balance ──
  let msg = `🏗 БИЗНЕС ХАУС КГ\n━━━━━━━━━━━━━━━━━━\n\n`;

  if (gp) {
    msg += `🟢 Green Park\n`;
    msg += `   Наличные: ${fmt(gp.balNalSom)} сом\n`;
    if (gp.balNalUsd) msg += `   Доллары:  $${fmt(gp.balNalUsd)}\n`;
    msg += `\n`;
  }
  if (wh) {
    msg += `🔵 White House\n`;
    msg += `   Наличные: ${fmt(wh.balNalSom)} сом\n`;
    if (wh.balNalUsd) msg += `   Доллары:  $${fmt(wh.balNalUsd)}\n`;
    msg += `\n`;
  }
  if (gp && wh) {
    const totSom = (gp.balNalSom || 0) + (wh.balNalSom || 0);
    const totUsd = (gp.balNalUsd || 0) + (wh.balNalUsd || 0);
    msg += `💰 Итого наличных:\n`;
    msg += `   Сом: ${fmt(totSom)}\n`;
    if (totUsd) msg += `   USD: $${fmt(totUsd)}\n`;
    msg += `\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━\n_${today}_`;

  // Send Telegram
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_IDS = [process.env.CHAT_ID_ISKENDER, process.env.CHAT_ID_YUSUF].filter(Boolean);
  const results = [];
  for (const chatId of CHAT_IDS) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
    });
    const d = await r.json();
    results.push({ chatId, ok: d.ok, error: d.description });
  }

  // Update Airtable
  if (AT) {
    try {
      if (gp && balances['Green Park'])  await updateBalance(balances['Green Park'], gp, dateStr);
      if (wh && balances['White House']) await updateBalance(balances['White House'], wh, dateStr);
      await Promise.all([
        saveSales('Green Park', gp),
        saveSales('White House', wh),
        saveDebtors('Green Park', gp),
        saveDebtors('White House', wh),
        saveMovements('Green Park', gp, dateStr),
        saveMovements('White House', wh, dateStr),
        saveSmsQueue(gp, wh, dateStr)
      ]);
    } catch(e) { console.error('Airtable update:', e); }
  }

  return res.status(200).json({ ok: results.every(r => r.ok), message: msg, results });
};
