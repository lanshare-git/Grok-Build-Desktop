# Security Policy

## Supported versions

Security fixes are applied on the latest `main` branch and tagged releases when practical. Older builds are not backported unless the issue is severe.

## Reporting a vulnerability

Please **do not** open a public GitHub Issue for security problems.

Report privately via GitHub Security Advisories on this repository, or email the maintainer listed in `package.json` / GitHub profile.

Include:

- Affected version / commit
- Steps to reproduce
- Impact (e.g. credential leak, sandbox bypass, RCE via malicious session)

## Scope notes

This desktop app spawns the local `grok` agent (ACP over stdio). The agent can read/write files and run commands according to the active **permission mode**. Treat it like giving an automated assistant access to your machine:

- Prefer restrictive modes when exploring untrusted repos
- Do not commit `~/.grok/auth.json`, API keys, or proxy credentials
- Review tool-permission prompts before approving
