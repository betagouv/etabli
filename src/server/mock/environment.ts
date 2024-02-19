export const shouldTargetMock = process.env.TRPC_SERVER_MOCK === 'true';

// Adjust the protocol so it's not blocked due to an "insecure source"
export const mockBaseUrl = `${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//mock.local`;
