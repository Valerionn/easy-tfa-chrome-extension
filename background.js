/**
 * Convert an ArrayBuffer into a string
 * from https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
 */
function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

chrome.runtime.onInstalled.addListener(async () => {
  const { publicKey } = await chrome.storage.local.get(['publicKey']);
  console.log('Checking key storage...');
  if(publicKey == null) {
    console.log('Generating new key...');
    console.time('generate key');
    const keyPair = await crypto.subtle.generateKey({
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    }, true, ['encrypt', 'decrypt']);
    const privateKeyExported = ab2str(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    const publicKeyExported = ab2str(await crypto.subtle.exportKey('spki', keyPair.publicKey));

    await chrome.storage.local.set({
      privateKey: privateKeyExported,
      publicKey: publicKeyExported,
    });
    console.timeEnd('generate key');
  }
});
