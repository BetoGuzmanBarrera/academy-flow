interface MfaClient {
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel: (jwt?: string) => Promise<{
        data: {
          currentLevel: string | null;
          nextLevel: string | null;
        } | null;
        error: unknown;
      }>;
    };
  };
}

export async function hasVerifiedAal2(client: MfaClient, jwt: string): Promise<boolean> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
  return !error && data?.currentLevel === 'aal2' && data.nextLevel === 'aal2';
}
