const Anthropic = jest.fn().mockImplementation(({ apiKey }: { apiKey: string }) => ({
  messages: {
    stream: jest.fn().mockReturnValue(
      (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello ' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } };
      })(),
    ),
  },
}));

export default Anthropic;
