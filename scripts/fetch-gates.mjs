const q = `[out:json][timeout:60];(node["barrier"="gate"](30.8548,75.8572,30.8642,75.8658);node["entrance"](30.8548,75.8572,30.8642,75.8658);way["barrier"="gate"](30.8548,75.8572,30.8642,75.8658);way["highway"="footway"]["name"](30.8548,75.8572,30.8642,75.8658););out center tags;`;
const endpoints = ['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
for (const url of endpoints) {
  try {
    const r = await fetch(url, {method:'POST', headers:{'User-Agent':'GNDEC-Compass-2/2.2','Content-Type':'application/x-www-form-urlencoded'}, body:'data='+encodeURIComponent(q)});
    if (!r.ok) { console.log(url, 'HTTP', r.status); continue; }
    const j = await r.json();
    console.log(url, 'elements', j.elements.length);
    for (const e of j.elements) {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      console.log(e.type, e.id, lat + ',' + lon, '|', e.tags?.name || '', '|', e.tags?.barrier || '', '|', e.tags?.highway || '', '|', e.tags?.entrance || '');
    }
    break;
  } catch (err) { console.log(url, 'ERR', err.message); }
}
