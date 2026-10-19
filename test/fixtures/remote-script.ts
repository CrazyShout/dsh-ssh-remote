export function decodeRemoteScript(command: string | undefined): string {
  const encoded = /base64\.b64decode\("([A-Za-z0-9+/=]+)"\)/u.exec(command ?? '')?.[1];
  if (!encoded) throw new Error('expected the cross-login-shell bootstrap');
  return Buffer.from(encoded, 'base64').toString('utf8');
}
