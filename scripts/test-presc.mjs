const fs = await import('fs');
const img = fs.readFileSync('/home/z/my-project/public/images/products/panadol-extra.webp');
const dataUrl = `data:image/webp;base64,${img.toString('base64')}`;
const r = await fetch('http://localhost:3000/api/prescriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: dataUrl, notes: 'test', lang: 'ar' }),
});
console.log('LOCAL status:', r.status);
const body = await r.text();
console.log('LOCAL body:', body.slice(0, 500));
