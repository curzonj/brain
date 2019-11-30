import { orderTaskList } from './content';
import * as models from './models';

describe('content.ts', () => {
  it('works', async () => {
    const unorderedList: models.Payload[] = [
      {
        metadata: {
          id: '1',
          created_at: Date.now(),
          firstAction: true,
          nextAction: { ref: '3' },
        },
        topic: {
          actionOn: [{ ref: '0' }],
        },
      },
      {
        metadata: {
          id: '2',
          created_at: Date.now(),
        },
        topic: {
          actionOn: [{ ref: '0' }],
        },
      },
      {
        metadata: {
          id: '3',
          created_at: Date.now(),
          nextAction: { ref: '2' },
        },
        topic: {
          actionOn: [{ ref: '0' }],
        },
      },
      {
        metadata: {
          id: '4',
          created_at: Date.now(),
        },
        topic: {
          actionOn: [{ ref: '0' }],
        },
      },
    ];

    const orderedList = orderTaskList(unorderedList);
    expect(orderedList.map(p => p.metadata.id)).toEqual(['1', '3', '2', '4']);
  });
});
