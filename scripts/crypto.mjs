import crypto from 'node:crypto';

export function encryptText(text, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { version: 1, iv: iv.toString('base64'), data: ciphertext.toString('base64') };
}

export function decryptText(encrypted, key) {
  const buffer = Buffer.from(encrypted.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(buffer.subarray(-16));
  return Buffer.concat([decipher.update(buffer.subarray(0, -16)), decipher.final()]).toString('utf8');
}

export function readGate(html, code) {
  const match = html.match(/var PAYLOAD = (\{[^\n]*\});/);
  if (!match) throw Error('Existing encrypted gate not found');
  const payload = JSON.parse(match[1]);
  const key = crypto.pbkdf2Sync(code, Buffer.from(payload.salt, 'base64'), payload.iterations, 32, 'sha256');
  return { payload, key, html: decryptText(payload, key) };
}

export function replaceGate(html, code, content) {
  const { payload, key } = readGate(html, code);
  // Keep salt/iterations so existing remembered keys still work; never reuse an IV.
  const encrypted = encryptText(content, key);
  const next = { ...payload, iv: encrypted.iv, data: encrypted.data };
  return html.replace(/var PAYLOAD = (\{[^\n]*\});/, 'var PAYLOAD = ' + JSON.stringify(next) + ';');
}

export function readConfig(innerHtml) {
  const match = innerHtml.match(/<script id="trip-config" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw Error('Trip map configuration not found');
  return JSON.parse(match[1]);
}
