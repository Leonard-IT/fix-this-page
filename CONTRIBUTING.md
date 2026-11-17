# Contributing

Thanks for helping out. Small fixes are just as welcome as features; you do not need to ask first for a typo or an obvious bug. For a larger change, open an issue first so we can agree on the approach before you spend time on it.

## Set up and run

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm ci
npm test
npm run build   # writes packages/fix-this-page/dist/
```

Try your change in a browser with [the demo page](packages/fix-this-page/examples/demo.html): build, serve `packages/fix-this-page` (for example `npx serve packages/fix-this-page`) and open `/examples/demo.html?fix`.

## How we write code

Follow [docs/CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) and the project profile in [AGENTS.md](AGENTS.md).

- Keep a change focused: no unrelated refactors next to a fix or feature.
- One thing per commit, with a short imperative subject in English (for example "Keep links when a text change spans markup").
- Add or update a test when you change behaviour. Run `npm test` before you open a pull request; CI runs it too.
- The overlay must stay free of network calls and of dependencies at run time.

## Changing the Page Change Format

`spec/` is the specification, a JSON schema, a validator and a test suite. A change to the format needs an issue first. Add a valid or invalid example to `spec/test-suite` for every rule you add.

## Licence

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) of this repository.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md) for how to report it privately.
