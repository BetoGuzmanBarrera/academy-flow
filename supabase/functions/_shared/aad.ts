interface CredentialAADInput {
  credential_id: string;
  order_id: string;
  service_id: string;
  key_version: number;
}

export function buildCredentialAAD(input: CredentialAADInput): Uint8Array {
  const aadString =
    '{"credential_id":"' + input.credential_id +
    '","order_id":"' + input.order_id +
    '","service_id":"' + input.service_id +
    '","key_version":' + input.key_version + '}';

  return new TextEncoder().encode(aadString);
}
