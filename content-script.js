/*
Todo: Twitter, Atlassian, namecheap, coinbase, slack, twitch, (autodesk), aws->amazon.com, yarrive, facebook, gitlab, uptimerobot
 */

let webSocket;
let keyPromise;
let currentConfig;
let oneTimePad;

function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for(let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

async function handle() {
  const configs = config[location.origin];
  if(configs == null) return;
  const configToLoad = configs.find(config => location.href.startsWith(config.url));
  if(configToLoad == null) return;
  currentConfig = configToLoad;
  keyPromise = (window['browser'] || chrome).storage.local.get(['publicKey', 'privateKey', 'appPublicKey']);
  await checkForInput();
}

async function checkForInput() {
  const input = currentConfig.inputSelector();
  if(input == null) {
    setTimeout(checkForInput, 100);
    return;
  }
  console.log('input found!');
  const {
    appPublicKey,
    publicKey,
  } = await keyPromise;
  if(appPublicKey == null) {
    console.log('Not linked yet.');
    return;
  }
  webSocket = new WebSocket('wss://eu-relay1.easytfa.com');
  webSocket.onopen = async () => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(btoa(publicKey)));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16)
      .padStart(2, '0'))
      .join('');
    oneTimePad = new Uint8Array(6);
    crypto.getRandomValues(oneTimePad);
    const oneTimePadString = btoa(ab2str(oneTimePad));
    const checksumBytes = new Uint8Array(3);
    crypto.getRandomValues(checksumBytes);
    const checksum = btoa(ab2str(checksumBytes));
    console.log(`Sent request with checksum ${checksum}. TODO: Show this somwhere on the page.`);
    const messageToEncrypt = JSON.stringify({
      action: 'query-code',
      url: location.origin,
      hash: hashHex,
      oneTimePad: oneTimePadString,
      checksum: checksum,
    });
    const importedAppPublicKey = await crypto.subtle.importKey(
      'spki',
      str2ab(appPublicKey),
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      false,
      ['encrypt'],
    );
    const encryptedMessage = await crypto.subtle.encrypt({
      name: 'RSA-OAEP',
    }, importedAppPublicKey, new TextEncoder().encode(messageToEncrypt));
    webSocket.send(JSON.stringify({
      event: 'query-code',
      data: {
        hash: hashHex,
        message: btoa(ab2str(encryptedMessage)),
      },
    }));
  };
  // TODO: Websocket keepalive(?)
  webSocket.onmessage = async (response) => {
    const responseData = JSON.parse(response.data);
    if(responseData.event === 'message') {
      const message = atob(responseData.message);
      const { privateKey } = await keyPromise;
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
      if(decrypted.type !== 'code' || decrypted.url !== location.origin) {
        return;
      }
      const encryptedCodeArray = new Uint8Array(str2ab(atob(decrypted.code)));
      for(let i = 0; i < oneTimePad.length; i++) {
        encryptedCodeArray[i] ^= oneTimePad[i];
      }
      oneTimePad = undefined;
      input.value = ab2str(encryptedCodeArray);
      input.dispatchEvent(
        new UIEvent('input', {
          view: window,
          bubbles: true,
          cancelable: true,
        }),
      );
      input.dispatchEvent(
        new UIEvent('change', {
          view: window,
          bubbles: true,
          cancelable: true,
        }),
      );
      // Auto submit
      const submit = currentConfig.submitSelector();
      if(submit != null) {
        // For Aurelia, we need this delay
        setTimeout(() => {
          submit.click();
        }, 0)
      }
      webSocket.close();
    }
  };

  // const response = await fetch('http://localhost:3000/');
  // const content = await response.json();
  // console.log(content);
  // input.value = content.code;
}

void handle();
