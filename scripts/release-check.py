import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import textwrap
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("deploy_release", Path(__file__).with_name("deploy-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
COMMIT = "a" * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="farseek-release-test-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.files = {"game/index.html": b"<title>Farseek</title>", "game/main.js": b"export {};"}
        self.package()

    def package(self, extra=None):
        archive = self.directory / "release.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            for name, content in self.files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(content)
                bundle.addfile(entry, io.BytesIO(content))
            if extra is not None:
                bundle.addfile(extra)
        self.manifest = {"schema": 1, "commit": COMMIT, "releaseId": "20261001-" + COMMIT[:12], "archive": "release.tar.gz", "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "files": {name: hashlib.sha256(content).hexdigest() for name, content in self.files.items()}}
        self.save()

    def save(self):
        (self.directory / "release.json").write_text(json.dumps(self.manifest))

    def test_exact_commit_archive(self):
        self.assertEqual(release.validate(self.directory, COMMIT), self.manifest)

    def test_other_commit_rejected(self):
        with self.assertRaisesRegex(ValueError, "requested commit"):
            release.validate(self.directory, "b" * 40)

    def test_linked_manifest_rejected(self):
        manifest = self.directory / "release.json"
        manifest.rename(self.directory / "original.json")
        manifest.symlink_to(self.directory / "original.json")
        with self.assertRaisesRegex(ValueError, "Invalid release manifest"):
            release.validate(self.directory, COMMIT)

    def test_changed_archive_rejected(self):
        with (self.directory / "release.tar.gz").open("ab") as archive:
            archive.write(b"changed")
        with self.assertRaisesRegex(ValueError, "Archive checksum"):
            release.validate(self.directory, COMMIT)

    def test_changed_runtime_checksum_rejected(self):
        self.manifest["files"]["game/main.js"] = "0" * 64
        self.save()
        with self.assertRaisesRegex(ValueError, "Runtime checksum"):
            release.validate(self.directory, COMMIT)

    def test_missing_file_rejected(self):
        self.manifest["files"]["game/absent.js"] = "0" * 64
        self.save()
        with self.assertRaisesRegex(ValueError, "file list"):
            release.validate(self.directory, COMMIT)

    def test_path_escape_rejected(self):
        self.package(tarfile.TarInfo("game/../../outside"))
        with self.assertRaisesRegex(ValueError, "Unsafe archive"):
            release.validate(self.directory, COMMIT)

    def test_aliased_path_rejected(self):
        self.package(tarfile.TarInfo("game/./main.js"))
        with self.assertRaisesRegex(ValueError, "Unsafe archive"):
            release.validate(self.directory, COMMIT)

    def test_link_rejected(self):
        link = tarfile.TarInfo("game/link")
        link.type = tarfile.SYMTYPE
        link.linkname = "/outside"
        self.package(link)
        with self.assertRaisesRegex(ValueError, "Unexpected archive"):
            release.validate(self.directory, COMMIT)

    def test_duplicate_rejected(self):
        self.package(tarfile.TarInfo("game/main.js"))
        with self.assertRaisesRegex(ValueError, "Unexpected archive"):
            release.validate(self.directory, COMMIT)

    def test_unexpected_file_rejected(self):
        self.package(tarfile.TarInfo("other-file"))
        with self.assertRaisesRegex(ValueError, "Unsafe archive"):
            release.validate(self.directory, COMMIT)

    def test_transport_uses_private_installer(self):
        installer = self.directory / "installer.sh"
        installer.write_text("exit 0\n")
        env = {"FARSEEK_SSH_TARGET": "fixture-only", "FARSEEK_DEPLOY_SCRIPT": str(installer), "FARSEEK_PUBLIC_URL": "https://example.invalid"}
        with patch.dict(release.os.environ, env), patch.object(release.subprocess, "run") as run, patch.object(release.urllib.request, "urlopen") as urlopen, patch("builtins.print"):
            run.return_value.returncode = 0
            urlopen.return_value.__enter__.return_value.read.side_effect = self.files.values()
            release.deploy(self.directory, self.manifest)
            upload, activate = run.call_args_list
            self.assertEqual(upload.args[0][0], "scp")
            self.assertEqual(activate.args[0][0], "ssh")
            self.assertEqual(activate.kwargs["input"], b"exit 0\n")
            self.assertIn("sha256sum --check --status", activate.args[0][-1])
            self.assertIn("StrictHostKeyChecking=yes", activate.args[0])
            self.assertEqual(urlopen.call_count, 2)

    def test_upload_failure_never_activates(self):
        installer = self.directory / "installer.sh"
        installer.write_text("exit 0\n")
        env = {"FARSEEK_SSH_TARGET": "fixture-only", "FARSEEK_DEPLOY_SCRIPT": str(installer), "FARSEEK_PUBLIC_URL": "https://example.invalid"}
        with patch.dict(release.os.environ, env), patch.object(release.subprocess, "run") as run:
            run.return_value.returncode = 1
            with self.assertRaisesRegex(RuntimeError, "upload failed"):
                release.deploy(self.directory, self.manifest)
            self.assertEqual(run.call_count, 1)

    def test_installer_failure_stops_before_public_check(self):
        installer = self.directory / "installer.sh"
        installer.write_text("exit 1\n")
        env = {"FARSEEK_SSH_TARGET": "fixture-only", "FARSEEK_DEPLOY_SCRIPT": str(installer), "FARSEEK_PUBLIC_URL": "https://example.invalid"}
        with patch.dict(release.os.environ, env), patch.object(release.subprocess, "run") as run, patch.object(release.urllib.request, "urlopen") as urlopen:
            run.side_effect = [release.subprocess.CompletedProcess([], 0), release.subprocess.CompletedProcess([], 1)]
            with self.assertRaisesRegex(RuntimeError, "installation failed"):
                release.deploy(self.directory, self.manifest)
            urlopen.assert_not_called()

    def test_public_mismatch_fails(self):
        installer = self.directory / "installer.sh"
        installer.write_text("exit 0\n")
        env = {"FARSEEK_SSH_TARGET": "fixture-only", "FARSEEK_DEPLOY_SCRIPT": str(installer), "FARSEEK_PUBLIC_URL": "https://example.invalid"}
        with patch.dict(release.os.environ, env), patch.object(release.subprocess, "run") as run, patch.object(release.urllib.request, "urlopen") as urlopen:
            run.return_value.returncode = 0
            urlopen.return_value.__enter__.return_value.read.return_value = b"stale release"
            with self.assertRaisesRegex(RuntimeError, "Public release checksum"):
                release.deploy(self.directory, self.manifest)


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="farseek-dispatch-test-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        workflow = Path(__file__).resolve().parent.parent / "docs/private-deploy-workflow.yml"
        source = workflow.read_text()
        anchor = "          python3 - <<'PY'\n"
        if source.count(anchor) != 1:
            raise ValueError("Expected one private dispatch validator")
        self.code = textwrap.dedent(source.split(anchor)[1].split("\n          PY\n")[0])
        self.run = {"id": 123, "repository": {"full_name": "Rapiiidooo/farseek"}, "head_repository": {"full_name": "Rapiiidooo/farseek"}, "event": "push", "head_branch": "main", "head_sha": COMMIT, "path": ".github/workflows/release.yml", "status": "in_progress"}
        self.job = {"name": "validate", "status": "completed", "conclusion": "success", "head_sha": COMMIT}

    def validate(self):
        (self.directory / "run.json").write_text(json.dumps(self.run))
        (self.directory / "jobs.json").write_text(json.dumps({"jobs": [self.job]}))
        with patch.dict(release.os.environ, {"RELEASE_DIRECTORY": str(self.directory), "RELEASE_COMMIT": COMMIT, "PUBLIC_RUN_ID": "123"}), patch("builtins.print"):
            exec(compile(self.code, "private-dispatch-validator", "exec"), {})

    def test_successful_validation_before_dispatch_completion(self):
        self.validate()

    def test_pull_request_refused(self):
        self.run["event"] = "pull_request"
        with self.assertRaisesRegex(ValueError, "Only main pushes"):
            self.validate()

    def test_other_branch_refused(self):
        self.run["head_branch"] = "feature"
        with self.assertRaisesRegex(ValueError, "Only main pushes"):
            self.validate()

    def test_fork_refused(self):
        self.run["head_repository"]["full_name"] = "other/farseek"
        with self.assertRaisesRegex(ValueError, "Fork run"):
            self.validate()

    def test_other_workflow_refused(self):
        self.run["path"] = ".github/workflows/other.yml"
        with self.assertRaisesRegex(ValueError, "Workflow mismatch"):
            self.validate()

    def test_other_commit_refused(self):
        self.run["head_sha"] = "b" * 40
        with self.assertRaisesRegex(ValueError, "Run SHA"):
            self.validate()

    def test_failed_validation_refused(self):
        self.job["conclusion"] = "failure"
        with self.assertRaisesRegex(ValueError, "Validation did not pass"):
            self.validate()

    def test_different_validation_commit_refused(self):
        self.job["head_sha"] = "b" * 40
        with self.assertRaisesRegex(ValueError, "Validation did not pass"):
            self.validate()


if __name__ == "__main__":
    unittest.main(verbosity=2)
