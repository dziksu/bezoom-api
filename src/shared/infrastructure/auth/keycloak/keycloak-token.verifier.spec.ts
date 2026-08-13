import { isApiAccessToken } from './keycloak-token.verifier';

describe('isApiAccessToken', () => {
  it('accepts only a bearer access token containing the API audience', () => {
    expect(isApiAccessToken({ typ: 'Bearer', aud: ['account', 'bezoom-api'], azp: 'bezoom-web' }, 'bezoom-api')).toBe(
      true
    );
  });

  it('does not treat the authorized party as an audience', () => {
    expect(isApiAccessToken({ typ: 'Bearer', aud: 'account', azp: 'bezoom-api' }, 'bezoom-api')).toBe(false);
  });

  it('rejects an ID token even when its audience matches', () => {
    expect(isApiAccessToken({ typ: 'ID', aud: 'bezoom-api' }, 'bezoom-api')).toBe(false);
  });
});
