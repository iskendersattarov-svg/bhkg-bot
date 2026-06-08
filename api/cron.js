const AT = process.env.AIRTABLE_TOKEN;
const BASE = 'appQGNsUDfjxnDSKP';
const DEBTORS_TABLE = 'tbl1oRCKWQYjXgOA7';

async function fetchScheduled() {
  // KG time = UTC+6
  const now = new Date(Date.now() + 6 * 3600 * 1000);
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
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }

  const { todays, tomorrows } = await fetchScheduled();

  const fmt = n => n ? Math.round(n).toLocaleString('ru-RU') : '0';

  // Build Telegram message
  let msg = `📱 SMS рассылка — проверьте дашборд\n━━━━━━━━━━━━━━━━\n\n`;

  if (todays.length > 0) {
    msg += `🔴 Сегодня день оплаты (${todays.length} чел.):\n`;
    todays.forEach(d => {
      msg += `  • ${d.name}, кв.${d.apt} — ${fmt(d.ost)} ${d.cur}\n`;
    });
    msg += '\n';
  } else {
    msg += `✅ Сегодня нет плательщиков\n\n`;
  }

  if (tomorrows.length > 0) {
    msg += `🟡 Завтра день оплаты (${tomorrows.length} чел.):\n`;
    tomorrows.forEach(d => {
      msg += `  • ${d.name}, кв.${d.apt} — ${fmt(d.ost)} ${d.cur}\n`;
    });
    msg += '\n';
  } else {
    msg += `✅ Завтра нет плательщиков\n\n`;
  }

  msg += `Перейдите в дашборд → вкладка "Должники" → нажмите "Отправить SMS"`;

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_IDS = [
    process.env.CHAT_ID_ISKENDER,
    process.env.CHAT_ID_YUSUF
  ].filter(Boolean);

  for (const chatId of CHAT_IDS) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg })
    });
  }

  return res.status(200).json({
    ok: true,
    todayCount: todays.length,
    tomorrowCount: tomorrows.length
  });
};
