// Sanity test: middleware HMAC verification matches signCookieValue (lib/employee-auth-cookie.ts)
import crypto from 'node:crypto';

const SECRET = 'zorin-carwash-dev-secret-change-in-production';

function signNode(payload) {
  const encoded = Buffer.from(payload, 'utf-8').toString('base64');
  const signature = crypto.createHmac('sha256', SECRET).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

function hexToBytes(hex) {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

async function verifyEdge(signedValue) {
  const dotIndex = signedValue.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const encoded = signedValue.substring(0, dotIndex);
  const signatureHex = signedValue.substring(dotIndex + 1);
  const sigBytes = hexToBytes(signatureHex);
  if (!sigBytes) return false;
  const enc = new TextEncoder();
  const key = await crypto.webcrypto.subtle.importKey(
    'raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return crypto.webcrypto.subtle.verify('HMAC', key, sigBytes, enc.encode(encoded));
}

const testPayload = JSON.stringify({ id: 'emp_test', username: 'kiosk', role: 'kiosk1' });
const signed = signNode(testPayload);
console.log('signed cookie:', signed.substring(0, 60) + '...');

const valid = await verifyEdge(signed);
console.log('valid cookie verifies:', valid);

const tampered = signed.slice(0, -2) + 'aa';
const validTampered = await verifyEdge(tampered);
console.log('tampered cookie verifies (should be false):', validTampered);

const garbage = await verifyEdge('garbage');
console.log('garbage cookie verifies (should be false):', garbage);

const wrongSecret = await (async () => {
  const enc = new TextEncoder();
  const dotIndex = signed.lastIndexOf('.');
  const encoded = signed.substring(0, dotIndex);
  const sigHex = signed.substring(dotIndex + 1);
  const sigBytes = hexToBytes(sigHex);
  const key = await crypto.webcrypto.subtle.importKey(
    'raw', enc.encode('wrong-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return crypto.webcrypto.subtle.verify('HMAC', key, sigBytes, enc.encode(encoded));
})();
console.log('wrong-secret verifies (should be false):', wrongSecret);

if (valid && !validTampered && !garbage && !wrongSecret) {
  console.log('\n✅ ALL ASSERTIONS PASSED');
  process.exit(0);
} else {
  console.log('\n❌ ASSERTION FAILED');
  process.exit(1);
}
