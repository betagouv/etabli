import dns from 'dns/promises';
import { BlockList, isIP } from 'net';

// Listed domains come from official sources, but one that lapsed can be bought back and pointed to a private address (localhost,
// the internal network, the cloud metadata service). The crawler would then fetch an internal page and store it in public sheets
export const privateAddressErrorCode = 'ETABLI_PRIVATE_ADDRESS';

const nonPublicAddresses = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8], // "This" network
  ['10.0.0.0', 8], // Private
  ['100.64.0.0', 10], // Carrier-grade NAT
  ['127.0.0.0', 8], // Loopback
  ['169.254.0.0', 16], // Link-local (including the cloud metadata service)
  ['172.16.0.0', 12], // Private
  ['192.0.0.0', 24], // Protocol assignments
  ['192.168.0.0', 16], // Private
  ['198.18.0.0', 15], // Benchmarking
  ['224.0.0.0', 4], // Multicast
  ['240.0.0.0', 4], // Reserved and broadcast
] as const) {
  nonPublicAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128], // Unspecified
  ['::1', 128], // Loopback
  ['fc00::', 7], // Unique local
  ['fe80::', 10], // Link-local
  ['ff00::', 8], // Multicast
] as const) {
  nonPublicAddresses.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return !nonPublicAddresses.check(address, 'ipv4');
  } else if (family === 6) {
    // An IPv4 address can be written as IPv6 (`::ffff:127.0.0.1`), it is checked as what it really is
    const mappedIpv4 = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

    return mappedIpv4 ? isPublicAddress(mappedIpv4[1]) : !nonPublicAddresses.check(address, 'ipv6');
  }

  return false;
}

// The error looks like a network one so callers already handling unreachable domains skip it and retry it later
export async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
  const nonPublicAddress = addresses.find(({ address }) => !isPublicAddress(address));

  if (nonPublicAddress) {
    const error = new Error(`"${hostname}" resolves to the non-public address ${nonPublicAddress.address}`) as NodeJS.ErrnoException;
    error.code = privateAddressErrorCode;

    throw error;
  }
}
