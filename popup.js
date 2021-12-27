/**
 * Convert an ArrayBuffer into a string
 * from https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
 */
function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for(let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

async function createKeyPair() {
  console.log('Generating new key...');
  const keyPair = await crypto.subtle.generateKey({
    name: 'RSA-OAEP',
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['encrypt', 'decrypt']);
  const privateKeyExported = ab2str(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  const publicKeyExported = ab2str(await crypto.subtle.exportKey('spki', keyPair.publicKey));

  await (window['browser'] || chrome).storage.local.set({
    privateKey: privateKeyExported,
    publicKey: publicKeyExported,
  });
  return {
    privateKey: privateKeyExported,
    publicKey: publicKeyExported,
  };
}

async function hashKey(publicKeyBase64) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKeyBase64));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16)
    .padStart(2, '0'))
    .join('');
}

(async function () {
  let {
    publicKey,
    appPublicKey,
  } = await (window['browser'] || chrome).storage.local.get(['publicKey', 'appPublicKey']);
  if(publicKey == null) {
    publicKey = (await createKeyPair()).publicKey;
  }
  if(appPublicKey != null && appPublicKey.trim() !== '') {
    document.getElementById('status').innerHTML = 'Linked.';
    document.getElementById('unlink').style.display = 'block';
    document.getElementById('unlink').addEventListener('click', async () => {
      const shouldUnlink = confirm('Really unlink?');
      if(!shouldUnlink) return;
      await (window['browser'] || chrome).storage.local.set({
        publicKey: null,
        privateKey: null,
        appPublicKey: null,
      });
      location.reload();
    });
    return;
  }
  const publicKeyBase64 = btoa(publicKey);
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const hashHex = await hashKey(publicKeyBase64);
  const secretHex = Array.from(secret)
    .map(b => b.toString(16)
      .padStart(2, '0'))
    .join('');

  // The QR code will be generated after WS connection (since qrcode generation takes ~50ms and we have to wait for the server anyways)
  const ws = new WebSocket('wss://eu-relay1.easytfa.com');
  ws.onopen = () => {
    ws.send(JSON.stringify({
      event: 'start-linking',
      data: publicKeyBase64,
    }));
  };
  ws.onmessage = async (response) => {
    const responseData = JSON.parse(response.data);
    if(responseData.event === 'linking-started') {
      document.getElementById('qrcode').style.display = 'block';
      document.getElementById('status').innerHTML = '';
    } else if(responseData.event === 'message') {
      const message = atob(responseData.message);
      // TODO - refactor this decrypt thingy into a separate method incl. str2ab
      const { privateKey } = await (window['browser'] || chrome).storage.local.get('privateKey');
      const importedPrivateKey = await crypto.subtle.importKey(
        'pkcs8',
        str2ab(privateKey),
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        ['decrypt'],
      );
      const decryptedBuf = await crypto.subtle.decrypt({
          name: 'RSA-OAEP',
        }, importedPrivateKey,
        str2ab(message));
      const decrypted = JSON.parse(new TextDecoder().decode(decryptedBuf));
      // Ignore non-link-messages
      if(decrypted.type !== 'link') return;
      if(decrypted.secret !== secretHex) {
        document.getElementById('status').innerHTML = `Someone tried linking with the wrong secret!`;
        return;
      }
      const appPublicKeyBase64 = responseData.data.appPublicKey;
      const hash = await hashKey(appPublicKeyBase64);
      if(hash !== decrypted.appPublicKeyHash) {
        document.getElementById('status').innerHTML = `Manipulated public key!`;
        return;
      }
      const appPublicKey = atob(appPublicKeyBase64);
      await (window['browser'] || chrome).storage.local.set({
        appPublicKey,
      });
      document.getElementById('qrcode').innerHTML = '';
      document.getElementById('status').innerHTML = `Linking successful!`;
      ws.close();
    }
  };

  new QRious({
    element: document.getElementById('qr'),
    value: `aegislink://h/?secret=${secretHex}&hash=${hashHex}`,
    size: 256,
  });
})();
