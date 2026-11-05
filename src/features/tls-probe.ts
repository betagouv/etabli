import { SecureVersion, connect } from 'tls';

const refusalErrorCodes = ['ECONNRESET', 'EPIPE'];
const probeTimeoutInMilliseconds = 2000;

// Same kind of connection as a browser would open, only asking for one version. It tells nothing but whether the handshake succeeds
export function acceptsTlsVersion(host: string, version: SecureVersion): Promise<boolean | null> {
  return new Promise((resolve) => {
    const socket = connect({
      host: host,
      port: 443,
      servername: host,
      minVersion: version,
      maxVersion: version,
      ciphers: 'DEFAULT@SECLEVEL=0', // Otherwise it would be our side refusing these versions and not the website
      rejectUnauthorized: false, // It is about the protocol, the certificate has its own check
      timeout: probeTimeoutInMilliseconds,
    });

    socket.once('secureConnect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(null); // Silence tells nothing, it must not be taken for a refusal
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      const code = error.code ?? '';

      socket.destroy();
      resolve(code === 'EPROTO' || code.startsWith('ERR_SSL') || refusalErrorCodes.includes(code) ? false : null);
    });
  });
}
