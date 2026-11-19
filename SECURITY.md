# Security policy

Heirmap runs entirely in the browser and stores cases only in the browser's local storage. The
production build blocks all network connections with a Content Security Policy. Even so, family
records are sensitive, and we take reports seriously.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/lobojoel2003/Heirmap/security/advisories/new)
with steps to reproduce. We aim to acknowledge reports within five working days.

Examples of in-scope issues: any path that sends case data off the device, script injection through
imported case files or names, or a weakened Content Security Policy.

A wrong legal result is not a security issue. Please open a regular issue using the "Rule
correction" template, with the statute citation.
