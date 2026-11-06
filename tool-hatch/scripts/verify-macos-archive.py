#!/usr/bin/env python3
"""Verify the actual distribution, not just the executable used to build it."""
import plistlib
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


def verify(archive):
    archive = Path(archive).resolve()
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None, 'Corrupt ZIP'
        for entry in bundle.infolist():
            path = PurePosixPath(entry.filename)
            assert not path.is_absolute() and '..' not in path.parts, 'Unsafe archive path'
            assert path.parts[0] in {'ToolHatch.app', '__MACOSX'}, 'Unexpected archive root'
            assert not stat.S_ISLNK(entry.external_attr >> 16), 'Unexpected symlink'
            assert not any(part.lower() in {'workspace', 'history', 'report', 'reports', '.git', 'node_modules'} for part in path.parts), 'Development data in release'
            assert path.suffix.lower() != '.md', 'Documentation in release'
        info = plistlib.loads(bundle.read('ToolHatch.app/Contents/Info.plist'))
        assert info['CFBundleName'] == 'ToolHatch'
        assert info['CFBundleExecutable'] == 'ToolHatch'
        assert info['CFBundleIdentifier'] == 'io.github.shadowonder.toolhatch'
        assert info['CFBundlePackageType'] == 'APPL'
        executable = bundle.getinfo('ToolHatch.app/Contents/MacOS/ToolHatch')
        assert executable.external_attr >> 16 & stat.S_IXUSR, 'Executable bit missing'
        assert 'ToolHatch.app/Contents/_CodeSignature/CodeResources' in bundle.namelist(), 'Bundle signature missing'
    with tempfile.TemporaryDirectory(prefix='toolhatch-verify-') as folder:
        subprocess.run(['ditto', '-x', '-k', str(archive), folder], check=True)
        app = Path(folder) / 'ToolHatch.app'
        subprocess.run(['lipo', str(app / 'Contents/MacOS/ToolHatch'), '-verify_arch', 'arm64', 'x86_64'], check=True)
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    print(f'Verified Universal, ad-hoc signed ToolHatch.app in {archive.name}')


if __name__ == '__main__':
    verify(sys.argv[1])
