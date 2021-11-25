/*
Todo: Twitter, Atlassian, namecheap, coinbase, slack, twitch
 */
const config = {
  'https://dash.cloudflare.com': [{
    url: 'https://dash.cloudflare.com/two-factor',
    inputSelector: () => document.getElementById('twofactor_token'),
    submitSelector: () => document.getElementsByTagName('button')[2],
  }],
  'https://accounts.hetzner.com': [{
    url: 'https://accounts.hetzner.com',
    inputSelector: () => document.getElementById('input-verify-code'),
    submitSelector: () => document.getElementById('btn-submit'),
  }],
  'https://github.com': [{
    url: 'https://github.com/sessions/two-factor',
    inputSelector: () => document.getElementById('otp'),
    submitSelector: () => document.querySelector('button.btn-primary'),
  }],
  'https://www.amazon.de': [{
    url: 'https://www.amazon.de/ap/mfa',
    inputSelector: () => document.getElementById('auth-mfa-otpcode'),
    submitSelector: () => document.getElementById('auth-signin-button'),
  }],
  'https://login.microsoftonline.com': [{
    url: 'https://login.microsoftonline.com',
    inputSelector: () => document.getElementsByName('otc')[0],
    submitSelector: () => document.querySelector('.button_primary'),
  }],
  'https://app.qa-yarrive.com': [{
    // TODO - SPA loads pages but we won't get injected each time, so just inject it everywhere for now
    url: 'https://app.qa-yarrive.com',
    inputSelector: () => document.getElementById('tfa'),
    submitSelector: () => document.getElementById('login'),
  }],
  'https://console.wasabisys.com': [{
    url: 'https://console.wasabisys.com/#/login',
    inputSelector: () => document.getElementsByName('MFAToken')[0],
    submitSelector: () => document.getElementsByTagName('button')[0],
  }],
  'https://www.paypal.com': [{
    url: 'https://www.paypal.com/authflow/twofactor',
    inputSelector: () => document.getElementById('otpCode'),
    submitSelector: () => document.getElementsByTagName('button')[0],
  }],
  'https://old.reddit.com': [{
    // TODO - maybe limit the rate here since this applies to the whole page?
    url: 'https://old.reddit.com',
    inputSelector: () => document.getElementById('otpfield'),
    submitSelector: () => document.getElementsByClassName('tfa-login-submit')[0],
  }],
  'https://www.npmjs.com': [{
    url: 'https://www.npmjs.com/login/otp',
    inputSelector: () => document.getElementById('login_otp'),
    submitSelector: () => document.getElementsByTagName('button')[0],
  }],
};

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
  webSocket = new WebSocket('wss://easytfa.genemon.at');
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
    if(responseData.event === 'code') {
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
      if(decrypted.url !== location.origin) {
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
