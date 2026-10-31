import { MemorySaver } from '@langchain/langgraph';
import type { AgentContext } from '@petra/agent-contract';

import { resetGraph } from '../src/graph';
import { setCheckpointer } from '../src/graph/checkpointer';
import { PROFILE_UNAVAILABLE_COMPROMISE } from '../src/graph/nodes/respond';
import { clearModels, setModel } from '../src/llm/provider';
import { runChatTurn } from '../src/orchestrator';
import { retrievalService } from '../src/retrieval';
import { FakeModel, routerReply } from './helpers/fake-model';

/**
 * A turn the API could not read a profile for.
 *
 * The API proceeds rather than failing the turn, which makes this the only
 * place the reader can learn that their allergies were not applied. An empty
 * allergy list arriving with no flag is indistinguishable from a user with no
 * allergies — so the assertion is on the envelope, not on what a model chose
 * to say.
 */

const context = (profileUnavailable?: boolean): AgentContext => ({
  currentPantryItems: [],
  pantryNames: [],
  dietaryRestrictions: [],
  healthGoals: [],
  allergies: [],
  ...(profileUnavailable === undefined ? {} : { profileUnavailable }),
});

describe('a turn whose profile could not be read', () => {
  let searchSpy: jest.SpyInstance;

  beforeEach(() => {
    setCheckpointer(new MemorySaver());
    resetGraph();
    searchSpy = jest.spyOn(retrievalService, 'search').mockResolvedValue([]);
    setModel('router', new FakeModel('router', routerReply('chat', [])));
  });

  afterEach(() => {
    clearModels();
    searchSpy.mockRestore();
    setCheckpointer(null);
    resetGraph();
  });

  const ask = (ctx: AgentContext) =>
    runChatTurn({
      messages: [{ role: 'user', content: 'how long does cooked rice keep?' }],
      user: { id: 'u1', subscriptionTier: 'FREE' },
      context: ctx,
    });

  it('says that allergies were not checked', async () => {
    const respond = new FakeModel('respond', 'About three days, well covered.');
    setModel('respond', respond);

    const response = await ask(context(true));

    expect(response.compromises).toContain(PROFILE_UNAVAILABLE_COMPROMISE);
    // Told to the model too, so the prose can say it in its own words.
    expect(respond.promptText).toContain(PROFILE_UNAVAILABLE_COMPROMISE);
  });

  it('says nothing of the kind when the profile was read', async () => {
    setModel('respond', new FakeModel('respond', 'About three days.'));

    const response = await ask(context());

    expect(response.compromises ?? []).not.toContain(
      PROFILE_UNAVAILABLE_COMPROMISE
    );
  });
});
