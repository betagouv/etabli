/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { serializeJsonLd } from '@etabli/src/utils/json-ld';

describe('serializeJsonLd()', () => {
  it('should not let a value close the script tag', () => {
    const data = {
      name: 'Mon service</script><script>alert(1)</script>',
      description: `a & b${String.fromCharCode(0x2028)}c`,
    };
    const serialized = serializeJsonLd(data);

    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain(String.fromCharCode(0x2028));
    expect(JSON.parse(serialized)).toEqual(data);
  });
});
