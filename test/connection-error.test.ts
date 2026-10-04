import { describe, expect, it } from 'vitest';
import { classifyConnectionError } from '../src/helper/connection-error.js';
import { DshRpcProtocolError } from '../src/helper/protocol.js';
import { RemoteHelperRpcError } from '../src/helper/rpc-client.js';

describe('connection error policy', () => {
  it.each([
    ['Permission denied (publickey).', 'SSH_AUTH'],
    ['Host key verification failed.', 'SSH_HOST_KEY'],
    ['REMOTE HOST IDENTIFICATION HAS CHANGED!', 'SSH_HOST_KEY'],
    ['python3: command not found', 'PYTHON_REQUIRED'],
    ['Python 3.8 or newer required', 'PYTHON_REQUIRED'],
    ['alias no longer present', 'SSH_CONFIG'],
    ['helper sha256 mismatch', 'HELPER_PROTOCOL'],
    ['something unexpected', 'SSH_UNKNOWN'],
  ])('does not auto-retry %s', (message, errorCode) => {
    expect(classifyConnectionError(new Error(message))).toMatchObject({ errorCode, retryable: false });
  });
  it.each(['Connection reset by peer', 'Connection refused', 'remote helper installation timed out after 5ms'])('retries transient %s', message => {
    expect(classifyConnectionError(new Error(message))).toMatchObject({ retryable: true });
  });
  it('preserves explicit server policy and stops malformed protocols', () => {
    expect(classifyConnectionError(new RemoteHelperRpcError({ code: 'E_RESOURCE_LIMIT', message: 'full', retryable: true })))
      .toMatchObject({ errorCode: 'E_RESOURCE_LIMIT', retryable: true });
    expect(classifyConnectionError(new DshRpcProtocolError('invalid frame'), '', true).retryable).toBe(false);
    expect(classifyConnectionError(new Error('system SSH helper transport exited with code 255'), '', true).retryable).toBe(true);
    expect(classifyConnectionError(new Error('system SSH helper transport exited with code 255'), 'Permission denied (publickey)', true).retryable).toBe(false);
  });
});
