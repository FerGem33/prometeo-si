import sdk from 'amazon-cognito-identity-js';

// Deliberately memory-only: no shared/global SDK storage or token files.
export class MemoryStorage {
  #values = new Map();
  setItem(key, value) { this.#values.set(key, value); return value; }
  getItem(key) { return this.#values.get(key) ?? null; }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

export function createClient(config, library = sdk) {
  if (!/^us-east-1_[A-Za-z0-9]+$/.test(config.poolId ?? '') || !/^[a-z0-9]+$/.test(config.clientId ?? '')) {
    throw new Error('Invalid public Cognito configuration');
  }
  const storage = new MemoryStorage();
  const pool = new library.CognitoUserPool({UserPoolId: config.poolId, ClientId: config.clientId, Storage: storage});
  const user = email => new library.CognitoUser({Username: email, Pool: pool, Storage: storage});
  return {
    register(email, password) {
      return new Promise((resolve, reject) => pool.signUp(email, password,
        [new library.CognitoUserAttribute({Name: 'email', Value: email})], [],
        (error, result) => error ? reject(error) : resolve({confirmed: result.userConfirmed})));
    },
    confirm(email, code) {
      // Never steal an existing alias during confirmation.
      return new Promise((resolve, reject) => user(email).confirmRegistration(code, false,
        error => error ? reject(error) : resolve()));
    },
    login(email, password) {
      return new Promise((resolve, reject) => {
        const current = user(email);
        current.setAuthenticationFlowType('USER_SRP_AUTH');
        const details = new library.AuthenticationDetails({Username: email, Password: password});
        const challenge = name => () => reject(Object.assign(new Error('Interactive challenge required'), {code: name}));
        current.authenticateUser(details, {
          onSuccess: session => {
            if (!session.isValid()) return reject(new Error('Invalid session'));
            resolve(session.getIdToken().getJwtToken());
          },
          onFailure: reject,
          newPasswordRequired: challenge('NewPasswordRequired'),
          mfaRequired: challenge('MfaRequired'),
          totpRequired: challenge('TotpRequired'),
          mfaSetup: challenge('MfaSetupRequired'),
          selectMFAType: challenge('MfaSelectionRequired'),
          customChallenge: challenge('CustomChallengeRequired'),
        });
      });
    },
    clear() { storage.clear(); },
  };
}
