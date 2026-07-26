const oidcModule = import('openid-client');

async function createOidcProvider(config, clientPromise = oidcModule) {
  const client = await clientPromise;
  const discovered = await client.discovery(
    new URL(config.issuer), config.clientId, config.clientSecret
  );
  return {
    async authorizationRequest() {
      const verifier = client.randomPKCECodeVerifier();
      const challenge = await client.calculatePKCECodeChallenge(verifier);
      const state = client.randomState();
      const nonce = client.randomNonce();
      const url = client.buildAuthorizationUrl(discovered, {
        redirect_uri: config.redirectUri,
        scope: 'openid profile email groups',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        nonce
      });
      return { url, state, nonce, verifier };
    },
    async exchange(currentUrl, checks) {
      const tokens = await client.authorizationCodeGrant(discovered, currentUrl, {
        pkceCodeVerifier: checks.verifier,
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        idTokenExpected: true
      });
      return tokens.claims();
    }
  };
}

function isOidcAuthorized(claims, config) {
  if (!claims || typeof claims !== 'object') return false;
  if (typeof claims.sub === 'string' && config.allowedSubjects.includes(claims.sub)) return true;
  const groups = claims[config.groupsClaim];
  return Boolean(config.requiredGroup && Array.isArray(groups) && groups.includes(config.requiredGroup));
}

module.exports = { createOidcProvider, isOidcAuthorized };
