#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess
import sys
import tarfile
import urllib.request
import uuid

MAX_BYTES = 100 * 1024 * 1024


def validate(directory, expected):
    manifest_file = directory / "release.json"
    if manifest_file.is_symlink() or not manifest_file.is_file() or manifest_file.stat().st_size > 1024 * 1024:
        raise ValueError("Invalid release manifest")
    manifest = json.loads(manifest_file.read_text())
    if not re.fullmatch(r"[a-f0-9]{40}", expected):
        raise ValueError("Expected a full Git commit SHA")
    if manifest.get("schema") != 1 or manifest.get("commit") != expected:
        raise ValueError("Release does not match the requested commit")
    if not re.fullmatch(r"\d{8}-" + expected[:12], manifest.get("releaseId", "")):
        raise ValueError("Invalid release identifier")
    if manifest.get("archive") != "release.tar.gz":
        raise ValueError("Invalid archive name")
    archive = directory / "release.tar.gz"
    if archive.is_symlink() or not archive.is_file() or archive.stat().st_size > MAX_BYTES:
        raise ValueError("Invalid release archive")
    if hashlib.sha256(archive.read_bytes()).hexdigest() != manifest.get("sha256"):
        raise ValueError("Archive checksum mismatch")
    files = manifest.get("files")
    if not isinstance(files, dict) or not {"game/index.html", "game/main.js"}.issubset(files):
        raise ValueError("Missing runtime files")
    found = {}
    total = 0
    with tarfile.open(archive, "r:gz") as bundle:
        for index, member in enumerate(bundle):
            name = PurePosixPath(member.name)
            if index >= 2000 or name.is_absolute() or ".." in name.parts or not name.parts or name.parts[0] != "game" or member.name.rstrip("/") != str(name):
                raise ValueError("Unsafe archive path")
            if member.isdir():
                continue
            if not member.isfile() or member.name in found or member.name not in files:
                raise ValueError("Unexpected archive member")
            total += member.size
            if total > MAX_BYTES:
                raise ValueError("Release is too large")
            digest = hashlib.sha256(bundle.extractfile(member).read()).hexdigest()
            if digest != files[member.name]:
                raise ValueError("Runtime checksum mismatch")
            found[member.name] = digest
    if found != files:
        raise ValueError("Release file list mismatch")
    return manifest


def deploy(directory, manifest):
    target = os.environ.get("FARSEEK_SSH_TARGET", "")
    installer = Path(os.environ.get("FARSEEK_DEPLOY_SCRIPT", ""))
    public_url = os.environ.get("FARSEEK_PUBLIC_URL", "")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", target):
        raise ValueError("Set FARSEEK_SSH_TARGET to a configured SSH alias")
    if not installer.is_absolute() or not installer.is_file():
        raise ValueError("Set FARSEEK_DEPLOY_SCRIPT to the private installer")
    if not public_url.startswith("https://"):
        raise ValueError("Set FARSEEK_PUBLIC_URL to the HTTPS site root")
    archive = directory / "release.tar.gz"
    remote = f"/tmp/farseek-{manifest['commit']}-{uuid.uuid4().hex}.tar.gz"
    options = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15"]
    upload = subprocess.run(["scp", *options, str(archive), f"{target}:{remote}"], capture_output=True)
    if upload.returncode:
        raise RuntimeError("Release upload failed; inspect the private SSH configuration")
    command = (
        f"trap 'rm -f {remote}' EXIT; "
        f"printf '%s  %s\\n' {manifest['sha256']} {remote} | sha256sum --check --status && "
        f"bash -s -- {shlex.quote(manifest['releaseId'])} {remote}"
    )
    result = subprocess.run(["ssh", *options, target, command], input=installer.read_bytes(), capture_output=True)
    if result.returncode:
        raise RuntimeError("Private release installation failed; check the previous release before retrying")
    for name in ["game/index.html", "game/main.js", "game/assets/hero_explorer.js"]:
        if name not in manifest["files"]:
            continue
        request = urllib.request.Request(public_url.rstrip("/") + "/" + name.removeprefix("game/"), headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=30) as response:
            digest = hashlib.sha256(response.read(MAX_BYTES + 1)).hexdigest()
        if digest != manifest["files"][name]:
            raise RuntimeError("Public release checksum mismatch; inspect the edge and use the private rollback procedure")
    print(f"Deployed {manifest['releaseId']} and verified the public runtime")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("commit")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    manifest = validate(args.directory.resolve(), args.commit)
    print(f"Verified {manifest['commit']} ({len(manifest['files'])} files)")
    if not args.verify_only:
        deploy(args.directory.resolve(), manifest)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Release failed: {error}", file=sys.stderr)
        sys.exit(1)
