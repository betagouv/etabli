import {
  MessageAuthorSchema,
  MessageSchema,
  MessageSchemaType,
  SessionAnswerChunkSchema,
  SessionAnswerChunkSchemaType,
} from '@etabli/src/models/entities/assistant';

export const messages: MessageSchemaType[] = [
  MessageSchema.parse({
    id: '13422339-278f-400d-9b25-5399e9fe6231',
    author: MessageAuthorSchema.Values.USER,
    content:
      'Ratione optio nihil aut. Ullam ipsa qui. Et ratione rerum eos. Provident numquam hic voluptate nulla ea provident officia. Dolor consectetur soluta porro quibusdam commodi cumque sit consequuntur.',
    complete: true,
  }),
  MessageSchema.parse({
    id: '13422339-278f-400d-9b25-5399e9fe6232',
    author: MessageAuthorSchema.Values.ASSISTANT,
    content: 'Hic deleniti qui in voluptatem sequi assumenda beatae eum. Mollitia beatae voluptatem.',
    complete: true,
  }),
  MessageSchema.parse({
    id: '13422339-278f-400d-9b25-5399e9fe6233',
    author: MessageAuthorSchema.Values.USER,
    content:
      'Quisquam nemo nulla voluptatem blanditiis amet porro. Nesciunt atque hic. Est iste accusantium quisquam ullam molestiae similique. Iure voluptas ea voluptatem. Quis illum dignissimos voluptas eos accusantium consequuntur eum quis.',
    complete: true,
  }),
  MessageSchema.parse({
    id: '13422339-278f-400d-9b25-5399e9fe6234',
    author: MessageAuthorSchema.Values.ASSISTANT,
    content: `Veniam non omnis eaque et omnis. Esse aspernatur eveniet voluptate minima a praesentium similique. Dolore voluptatum velit nemo. Fugiat ea quos provident. Magnam dolores nam qui ad aperiam voluptatem.

Animi est odio eos. Eaque quam ut a sint atque sit sunt fugiat. Consequatur molestiae porro voluptas id.

Enim natus sint. Rerum autem porro unde. Reprehenderit tenetur sunt sit sed. Commodi dicta officia sit ipsum. Aut voluptatibus perferendis. Est dolores nulla ratione nam omnis eum enim.`,
    complete: true,
  }),
];

export const chunks: SessionAnswerChunkSchemaType[] = [
  SessionAnswerChunkSchema.parse({
    sessionId: '13422339-278f-400d-9b25-5399e9fe6233',
    messageId: messages[0].id,
    chunk: 'Ratione ',
  }),
  SessionAnswerChunkSchema.parse({
    sessionId: '13422339-278f-400d-9b25-5399e9fe6233',
    messageId: messages[0].id,
    chunk: 'optio ',
  }),
  SessionAnswerChunkSchema.parse({
    sessionId: '13422339-278f-400d-9b25-5399e9fe6233',
    messageId: messages[0].id,
    chunk: 'nihil ',
  }),
];
