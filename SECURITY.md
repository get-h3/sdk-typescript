# Security Policy

## Reporting a Vulnerability

The H3 project takes security seriously. If you discover a security vulnerability, please do NOT open a public issue.

Email: wojonstech@gmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Any potential mitigations

We aim to respond within 72 hours and release a fix within 7 days of confirmation.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | ✅ Active development |

## Security Model

H3 TypeScript SDK provides client libraries for harness developers building against the H3 protocol. Key security boundaries:

- **API key handling**: Harness API keys should be stored in environment variables, never committed.
- **Input validation**: All H3 protocol messages are validated via Zod schemas before transmission.
- **Transport**: HTTPS for all harness communication.

## Disclosure Policy

We follow responsible disclosure:
1. Reporter submits vulnerability privately
2. We acknowledge within 72 hours
3. We develop and test a fix
4. We release the fix and publish an advisory
