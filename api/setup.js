export default async function handler(req, res) {
  const TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE = 'appQGNsUDfjxnDSKP';
  
  const results = {};
  
  // Create Продажи table
  const r1 = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Продажи',
      fields: [
        {name: 'Объект', type: 'singleLineText'},
        {name: 'Продано', type: 'number', options: {precision: 0}},
        {name: 'Всего', type: 'number', options: {precision: 0}},
        {name: 'Сумма USD', type: 'number', options: {precision: 0}},
        {name: 'Сумма сом', type: 'number', options: {precision: 0}},
        {name: 'Расторжений', type: 'number', options: {precision: 0}},
        {name: 'Дата', type: 'singleLineText'}
      ]
    })
  });
  results.sales = await r1.json();

  // Create Должники table  
  const r2 = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Должники',
      fields: [
        {name: 'Объект', type: 'singleLineText'},
        {name: 'Квартира', type: 'number', options: {precision: 0}},
        {name: 'Имя', type: 'singleLineText'},
        {name: 'Дней просрочки', type: 'number', options: {precision: 0}},
        {name: 'Остаток', type: 'number', options: {precision: 2}},
        {name: 'Валюта', type: 'singleLineText'},
        {name: 'Телефон', type: 'singleLineText'},
        {name: 'Дата', type: 'singleLineText'}
      ]
    })
  });
  results.debtors = await r2.json();

  return res.status(200).json(results);
}
