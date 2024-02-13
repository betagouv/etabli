import { addDays } from 'date-fns/addDays';
import { NextApiRequest, NextApiResponse } from 'next';

import { apiHandlerWrapper } from '@etabli/src/utils/api';

export function handler(req: NextApiRequest, res: NextApiResponse) {
  const expirationDate = addDays(new Date(), 7);
  const content = `
Contact: https://github.com/betagouv/etabli/issues
Expires: ${expirationDate.toISOString()}
Preferred-Languages: fr, en
`;

  res.send(content.trim());
}

export default apiHandlerWrapper(handler);
