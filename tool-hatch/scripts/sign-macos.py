#!/usr/bin/env python3
"""Use an available local identity, otherwise retain offline ad-hoc signing."""
import os
import re
import subprocess
import sys


def sign(app):
    configured = os.environ.get('TOOLHATCH_SIGNING_IDENTITY', '')
    identity = '-'
    if configured:
        available = subprocess.run(
            ['security', 'find-identity', '-v', '-p', 'codesigning'],
            capture_output=True, text=True, check=False,
        )
        matches = []
        if available.returncode == 0:
            for line in available.stdout.splitlines():
                match = re.fullmatch(r'\s*\d+\) ([0-9A-Fa-f]{40}) "(.*)"\s*', line)
                if match and (configured == match[2] or configured.upper() == match[1].upper()):
                    matches.append(match[1])
        if len(matches) > 1:
            raise RuntimeError('Multiple signing identities match; configure a SHA-1 fingerprint instead')
        if matches:
            identity = matches[0]
        else:
            print('Configured signing identity unavailable; using ad-hoc signing.', file=sys.stderr)
    print('Signing with local identity.' if identity != '-' else 'Signing ad-hoc.')
    # Local/private builds do not need an online Apple timestamp service.
    # A selected identity failure is an error, never silently downgraded.
    subprocess.run(['codesign', '--force', '--timestamp=none', '--sign', identity, app], check=True)
    subprocess.run(['codesign', '--verify', '--strict', app], check=True)


if __name__ == '__main__':
    sign(sys.argv[1])
