window.config = {
  'https://dash.cloudflare.com': [{
    url: 'https://dash.cloudflare.com/two-factor',
    inputSelector: () => document.getElementById('twofactor_token'),
    submitSelector: () => document.querySelector('button[type=submit]'),
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
  'https://www.amazon.com': [{
    url: 'https://www.amazon.com/ap',
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
  'https://uptimerobot.com': [{
    url: 'https://uptimerobot.com/login',
    inputSelector: () => {
      const code = document.getElementById('code');
      // UptimeRobot always displays this input and just hides it.
      // offsetParent is set to null if the element is not visible
      if(code.offsetParent == null) return null;
      return code;
    },
    submitSelector: () => document.querySelector('#twoFactorAuthForm .uk-button-primary'),
  }],
  'https://auth.atlassian.com': [{
    url: 'https://auth.atlassian.com/mf',
    inputSelector: () => document.getElementById('two-step-verification-otp-code-input'),
    submitSelector: () => document.querySelector('#two-step-verification-submit button'),
  }],
};
