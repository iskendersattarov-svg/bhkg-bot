const AT = process.env.AIRTABLE_TOKEN;
const BASE = 'appQGNsUDfjxnDSKP';

async function getTable(tableId) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${tableId}`, {
    headers: { Authorization: `Bearer ${AT}` }
  });
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const [balData, salesData, debtorsData, movData] = await Promise.all([
      getTable('tblmh8pbeCrYVOrHQ'),
      getTable('tblPjnNSuOSknfcch'),
      getTable('tbl1oRCKWQYjXgOA7'),
      getTable('tblH7zcYRnRRCKjEL')
    ]);
    res.status(200).json({
      balances: balData.records || [],
      sales: salesData.records || [],
      debtors: debtorsData.records || [],
      movements: movData.records || []
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
