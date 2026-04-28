# Contributing to Markdown Diff Visualiser

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later recommended)
- [Git](https://git-scm.com/)
- [VS Code](https://code.visualstudio.com/)

## Development Setup

1. Fork the repository on GitHub
2. Clone your fork:

   ```bash
   git clone https://github.com/<your-fork>/markdown-diff-visualiser.git
   cd markdown-diff-visualiser
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

## Running Tests

Run the full test suite with:

```bash
npm test
```

All tests must pass before submitting a pull request.

## Building

Bundle the extension for local testing:

```bash
npm run bundle
```

To package a `.vsix` file:

```bash
npm run package
```

## Code Style

This project uses [ESLint](https://eslint.org/) for linting and [Prettier](https://prettier.io/) for formatting.

- Run the linter:

  ```bash
  npm run lint
  ```

- Check formatting:

  ```bash
  npm run format:check
  ```

- Auto-fix lint issues:

  ```bash
  npm run lint:fix
  ```

- Auto-format code:

  ```bash
  npm run format
  ```

Please ensure `npm run lint` and `npm run format:check` pass before submitting your changes.

## Pull Request Process

1. **Fork** the repository and create a new branch from `main`:

   ```bash
   git checkout -b my-feature
   ```

2. **Make your changes** and commit with a clear, descriptive message.

3. **Run tests and linting** to make sure everything passes:

   ```bash
   npm test
   npm run lint
   npm run format:check
   ```

4. **Push** your branch and open a pull request against `main`.

5. Fill out the pull request template and wait for a review.

## Reporting Bugs

Found a bug? Please open an issue using the [bug report template](https://github.com/arjuntic/markdown-diff-visualiser/issues/new?template=bug_report.md). Include as much detail as possible — steps to reproduce, expected vs actual behavior, and your environment info.

## Suggesting Features

Have an idea? Open an issue using the [feature request template](https://github.com/arjuntic/markdown-diff-visualiser/issues/new?template=feature_request.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
