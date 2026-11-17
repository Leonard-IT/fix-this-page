# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (a private security advisory). Do not open a public issue or pull request for it.

Include what you found, how to reproduce it, and what an attacker could do with it. We will reply in the advisory.

## Scope

In scope: the overlay (`packages/fix-this-page`), the shared code in `packages/fix-this-page/src/core`, and the validator in `spec/validator`.

The overlay treats everything it reads as untrusted: an imported feedback file, an opened share link and the page itself. It only applies text changes and changes to `href`, `src`, `alt` and `title`, and refuses `javascript:`, `vbscript:` and `data:` links. A way around those limits is a vulnerability.

The hosted service at https://fixthis.page is not part of this repository. Report problems with it the same way, through this repository's advisory form, and they will be passed on.
