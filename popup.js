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

function getServerUrlFromForm() {
  let serverUrl = document.getElementById('server-selection').value;
  if(serverUrl === 'custom') {
    serverUrl = document.getElementById('server-custom-url').value;
  }
  return serverUrl;
}

/**
 * This page will be shown if nothing is configured yet
 */
function showPageInit() {
  document.getElementById('page-init').style.display = 'block';
}

function addPageInitEventListeners() {
  document.getElementById('server-selection').addEventListener('change', () => {
    const isCustomServer = document.getElementById('server-selection').value === 'custom';
    document.getElementById('server-custom-url-container').style.display = isCustomServer ? 'block' : 'none';
    for(const element of document.getElementsByClassName('result-test-server-field')) {
      element.innerText = '-';
    }
    document.getElementById('result-test-server-status').innerText = '';
  });

  document.getElementById('btn-test-server-connection').addEventListener('click', async () => {
    const serverUrl = getServerUrlFromForm();

    document.getElementById('result-test-server-status').innerText = `Fetching https://${serverUrl}/config ...`;
    try {
      const latencyTimeStart = new Date().getTime();
      const res = await fetch(`https://${serverUrl}/config`, { cache: 'no-cache' });
      const latencyMs = new Date().getTime() - latencyTimeStart;
      const data = await res.json();
      document.getElementById('result-test-server-url').innerText = serverUrl;
      document.getElementById('result-test-server-version').innerText = data.version;
      document.getElementById('result-test-server-push-notifications').innerText = data.push.supported ? '✔️' : '❌';
      document.getElementById('result-test-server-latency').innerText = `${latencyMs}ms`;
      document.getElementById('result-test-server-status').innerText = '';
    } catch(err) {
      console.error(err);
      document.getElementById('result-test-server-status').innerText = `Invalid EasyTFA server: https://${serverUrl}/config: ${err}`;
    }
  });

  document.getElementById('form-init').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('page-init').style.display = 'none';
    await (window['browser'] || chrome).storage.local.set({
      serverUrl: getServerUrlFromForm(),
    });
    await showPageLink();
  });
}

async function showPageLink() {
  const { publicKey, serverUrl, appPublicKey } = await (window['browser'] || chrome).storage.local.get(['publicKey', 'serverUrl', 'appPublicKey']);
  if(publicKey == null || serverUrl == null) {
    location.reload();
    return;
  }
  if(appPublicKey != null) {
    await showPageLinked();
    return;
  }
  document.getElementById('page-link').style.display = 'block';
  document.getElementById('qrcode').style.display = 'none';
  document.getElementById('server-url').innerText = `https://${serverUrl}`;
  const publicKeyBase64 = btoa(publicKey);
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const hashHex = await hashKey(publicKeyBase64);
  const secretHex = Array.from(secret)
    .map(b => b.toString(16)
      .padStart(2, '0'))
    .join('');

  // The QR code will be generated after WS connection (since qrcode generation takes ~50ms, and we have to wait for the server anyway)
  const ws = new WebSocket(`wss://${serverUrl}`);
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
      document.getElementById('page-link').style.display = 'none';
      ws.close();
      await showPageLinked();
    }
  };

  new QRious({
    element: document.getElementById('qr'),
    value: `aegislink://h/?secret=${secretHex}&hash=${hashHex}`,
    size: 256,
  });
}

function addPageLinkEventListeners() {
  document.getElementById('switch-server-link').addEventListener('click', async () => {
    await (window['browser'] || chrome).storage.local.remove('serverUrl');
    location.reload();
  });
}

/**
 * This page will be shown if the browser is linked
 */
async function showPageLinked() {
  const { serverUrl } = await (window['browser'] || chrome).storage.local.get('serverUrl');
  document.getElementById('page-linked').style.display = 'block';
  document.getElementById('page-linked-server-url').innerText = serverUrl;
}

function addPageLinkedEventListeners() {
  document.getElementById('unlink').addEventListener('click', async () => {
    const shouldUnlink = confirm('Really unlink?');
    if(!shouldUnlink) return;
    await (window['browser'] || chrome).storage.local.remove(['publicKey', 'privateKey', 'appPublicKey', 'serverUrl']);
    location.reload();
  });
  document.getElementById('page-linked-switch-server-link').addEventListener('click', async () => {
    document.getElementById('page-linked').style.display = 'none';
    showPageInit();
  });
}

(async function () {
  let {
    publicKey,
    appPublicKey,
    serverUrl,
  } = await (window['browser'] || chrome).storage.local.get(['publicKey', 'appPublicKey', 'serverUrl']);
  if(publicKey == null) {
    await createKeyPair();
  }
  addPageInitEventListeners();
  addPageLinkEventListeners();
  addPageLinkedEventListeners();
  document.getElementById('page-loading').style.display = 'none';

  if(serverUrl == null) {
    showPageInit();
  }
  else if(appPublicKey != null && appPublicKey.trim() !== '') {
    await showPageLinked();
  } else {
    await showPageLink();
  }
})();
