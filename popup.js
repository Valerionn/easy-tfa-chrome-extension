function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for(let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

(async function () {
  const { publicKey, appPublicKey } = await chrome.storage.local.get(['publicKey', 'appPublicKey']);
  if(appPublicKey != null) {
    document.getElementById('status').innerHTML = 'Linked.';
    return;
  }
  const publicKeyBase64 = btoa(publicKey);
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKeyBase64));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16)
    .padStart(2, '0'))
    .join('');
  const secretHex = Array.from(secret)
    .map(b => b.toString(16)
      .padStart(2, '0'))
    .join('');
  // The QR code will be generated after WS connection (since qrcode generation takes ~50ms and we have to wait for the server anyways)
  let qrcode;
  const ws = new WebSocket('ws://localhost:3000');
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
    } else if(responseData.event === 'link') {
      const message = atob(responseData.message);
      // TODO - refactor this decrypt thingy into a separate method incl. str2ab
      const { privateKey } = await chrome.storage.local.get('privateKey');
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
      if(decrypted.secret !== secretHex) {
        document.getElementById('status').innerHTML = `Someone tried linking with the wrong secret!`;
        return;
      }
      const appPublicKey = atob(decrypted.publicKey);
      await chrome.storage.local.set({
        appPublicKey,
      });
      qrcode.clear();
      document.getElementById('qrcode').innerHTML = '';
      document.getElementById('status').innerHTML = `Linking successful!`;
      ws.close();
    }
  };

  qrcode = new QRCode('qrcode', {
    text: `aegislink://h/?secret=${secretHex}&hash=${hashHex}`,
    correctLevel: QRCode.CorrectLevel.L,
  });
})();
