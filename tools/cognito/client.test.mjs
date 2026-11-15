import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient, MemoryStorage} from './client.mjs';

const config = {poolId: 'us-east-1_Test', clientId: 'client1'};
function fake(options = {}) {
  const calls = [];
  class CognitoUserPool {
    constructor(data) { this.data = data; calls.push(['pool', data]); }
    signUp(email, password, attrs, validation, cb) {
      calls.push(['register', email, attrs]);
      cb(options.error, {userConfirmed: false});
    }
  }
  class CognitoUser {
    constructor(data) { this.data = data; }
    setAuthenticationFlowType(flow) { calls.push(['flow', flow]); }
    confirmRegistration(code, force, cb) { calls.push(['confirm', code, force]); cb(options.error); }
    authenticateUser(details, callbacks) {
      if (options.error) return callbacks.onFailure(options.error);
      if (options.challenge) return callbacks[options.challenge]();
      this.data.Storage.setItem('sdk.session', 'private');
      callbacks.onSuccess({isValid: () => options.valid !== false,
        getIdToken: () => ({getJwtToken: () => 'test-id-token'})});
    }
  }
  class CognitoUserAttribute { constructor(data) { Object.assign(this, data); } }
  class AuthenticationDetails { constructor(data) { Object.assign(this, data); } }
  return {calls, library: {CognitoUserPool, CognitoUser, CognitoUserAttribute, AuthenticationDetails}};
}

test('real SDK accepts public config without session persistence', () => {
  const client = createClient(config);
  client.clear();
});
test('separate memory stores do not share tokens', () => {
  const a = new MemoryStorage(), b = new MemoryStorage();
  a.setItem('token', 'private');
  assert.equal(b.getItem('token'), null);
  a.clear();
  assert.equal(a.getItem('token'), null);
});
test('register email attribute and confirm without alias takeover', async () => {
  const {calls, library} = fake();
  const client = createClient(config, library);
  assert.deepEqual(await client.register('example@invalid.test', 'local-password'), {confirmed: false});
  await client.confirm('example@invalid.test', '123456');
  assert.equal(calls.find(c => c[0] === 'register')[2][0].Name, 'email');
  assert.equal(calls.find(c => c[0] === 'confirm')[2], false);
});
test('login explicitly uses SRP and clear removes SDK cache', async () => {
  const {calls, library} = fake();
  const client = createClient(config, library);
  assert.equal(await client.login('example@invalid.test', 'local-password'), 'test-id-token');
  assert.deepEqual(calls.find(c => c[0] === 'flow'), ['flow', 'USER_SRP_AUTH']);
  const storage = calls.find(c => c[0] === 'pool')[1].Storage;
  assert.equal(storage.getItem('sdk.session'), 'private');
  client.clear();
  assert.equal(storage.getItem('sdk.session'), null);
});
test('invalid sessions, challenges and SDK errors are rejected', async () => {
  for (const options of [{valid: false}, {challenge: 'mfaRequired'}, {error: new Error('rejected')}]) {
    const {library} = fake(options);
    await assert.rejects(createClient(config, library).login('example@invalid.test', 'local-password'));
  }
});
test('invalid public configuration fails before SDK invocation', () => {
  assert.throws(() => createClient({poolId: 'bad', clientId: 'bad'}));
});
