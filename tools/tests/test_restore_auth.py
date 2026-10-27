"""Synthetic-only restore integration: never uses host credentials or remote services."""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "deploy/restore.sh"
# Explicitly test-only, including shell metacharacters and a literal backslash.
FAKE_PASSWORD = r"test-only -n ' \" $() `echo forbidden` \\ tail"

STUB = r'''#!/usr/bin/env python3
import json, os, pathlib, shutil, subprocess, sys, tarfile
name = pathlib.Path(sys.argv[0]).name
root = pathlib.Path(os.environ["FIXTURE_ROOT"])
password = os.environ["TEST_ONLY_PASSWORD"]
args = sys.argv[1:]
assert all(password not in arg for arg in sys.argv), "password in argv"
assert "PASSWORD" not in os.environ, "exported password"
with (root / "calls.jsonl").open("a") as log:
    log.write(json.dumps([name, args]) + "\n")
mode = os.environ.get("FAIL_STAGE", "")
if name == "security":
    if mode != "missing-keychain": print(password)
elif name == "sshpass":
    assert args[:2] == ["-d", "3"]
    assert os.read(3, 65536) == (password + "\n").encode(), "incorrect auth FD"
    os.close(3)
    sys.exit(subprocess.call(args[2:]))
elif name == "ssh":
    command = args[-1]
    if command == "echo 'SSH ok'":
        if mode == "authentication": sys.exit(1)
        if mode == "retry" and not (root / "retried").exists():
            (root / "retried").touch()
            sys.exit(1)
    elif "DATA_PATH=" in command and "up -d" not in command:
        print("/test-only/remote data")
    elif command.startswith("sudo "):
        sys.exit(subprocess.call(["/bin/bash", "-c", command]))
    elif command.startswith("rm -f "):
        (root / "cleaned").touch()
    else:
        assert "docker-compose" in command
        if "up -d" in command: (root / "restarted").touch()
elif name == "scp":
    if mode == "upload": sys.exit(1)
    shutil.copyfile(args[-2], root / "uploaded.tar.gz")
elif name == "sudo":
    assert args[:3] == ["-S", "-p", ""]
    assert sys.stdin.buffer.readline() == (password + "\n").encode(), "incorrect sudo stdin"
    command = args[3:]
    if command[:2] == ["tar", "-czf"]:
        if mode == "safety":
            sys.stdout.buffer.write(b"partial")
            sys.exit(1)
        sys.stdout.buffer.write((root / "original.tar.gz").read_bytes())
    elif command[:2] == ["rm", "-rf"]:
        (root / "wiped").touch()
        if mode == "wipe": sys.exit(1)
    elif command[:2] == ["tar", "-xzf"]:
        if mode == "extract": sys.exit(1)
        with tarfile.open(root / "uploaded.tar.gz") as archive:
            assert archive.extractfile("fixture.txt").read() == b"synthetic restore payload"
        (root / "extracted").touch()
    elif command[0] == "chown":
        if mode == "permissions": sys.exit(1)
    else:
        assert command[0] == "find"
else:
    raise AssertionError("unexpected command: " + name)
'''


class RestoreAuthenticationTest(unittest.TestCase):
    def run_fixture(self, stage="", interactive=False, cancel=False, password=FAKE_PASSWORD):
        with tempfile.TemporaryDirectory(prefix="travel-restore-test-") as directory:
            root = Path(directory)
            deploy = root / "deploy"
            deploy.mkdir()
            shutil.copyfile(SCRIPT, deploy / "restore.sh")
            # Never copy or source deployment configuration from the checkout.
            bin_dir = root / "bin"
            bin_dir.mkdir()
            for name in ("security", "sshpass", "ssh", "scp", "sudo", "docker-compose"):
                stub = bin_dir / name
                stub.write_text(STUB)
                stub.chmod(0o700)
            backup_dir = root / "backups"
            backup_dir.mkdir()
            archive_path = backup_dir / "data-fixture.tar.gz"
            with tarfile.open(archive_path, "w:gz") as archive:
                payload = b"synthetic restore payload"
                info = tarfile.TarInfo("fixture.txt")
                info.size = len(payload)
                archive.addfile(info, io.BytesIO(payload))
            shutil.copyfile(archive_path, root / "original.tar.gz")
            env = {
                "PATH": str(bin_dir) + os.pathsep + os.defpath,
                "HOME": str(root), "TEST_DATA_DIR": str(root / "data"),
                "FIXTURE_ROOT": str(root), "TEST_ONLY_PASSWORD": password,
                "PI_HOST": "test-only.invalid", "PI_USER": "test-only-user",
                "DEPLOY_PATH": "/test-only/deploy", "BACKUPS_DIR": str(backup_dir),
                "FAIL_STAGE": stage,
                # Ensure even an inherited exported variable is removed.
                "PASSWORD": "test-only-inherited-value",
            }
            entries = []
            if stage in ("missing-keychain", "retry", "authentication"):
                entries.append(password)
            if interactive: entries.append("1")
            entries.append("CANCEL" if cancel else "RESTORE")
            command = ["/bin/bash", "-x", str(deploy / "restore.sh")]
            if not interactive: command.append(str(archive_path))
            result = subprocess.run(command, input="\n".join(entries) + "\n", env=env,
                                    capture_output=True, text=True, timeout=20)
            logs = (root / "calls.jsonl").read_text()
            self.assertNotIn(password, result.stdout + result.stderr + logs)
            self.assertNotIn("test-only-inherited-value", result.stdout + result.stderr + logs)
            calls = [json.loads(line) for line in logs.splitlines()]
            self.assertTrue(any(name == "sshpass" for name, _ in calls))
            success = not cancel and stage not in (
                "safety", "upload", "extract", "wipe", "permissions", "authentication")
            self.assertEqual(result.returncode, 0 if success or cancel else 1,
                             result.stdout + result.stderr)
            self.assertEqual((root / "restarted").exists(), success)
            self.assertEqual("Restore Complete!" in result.stdout, success)
            safety = list(backup_dir.glob("data-safety-*.tar.gz"))
            if success:
                self.assertTrue((root / "wiped").exists())
                self.assertTrue((root / "extracted").exists())
                self.assertTrue((root / "cleaned").exists())
                self.assertEqual(len(safety), 1)
                self.assertEqual(safety[0].read_bytes(), archive_path.read_bytes())
                self.assertEqual(safety[0].stat().st_mode & 0o777, 0o600)
                self.assertEqual(backup_dir.stat().st_mode & 0o777, 0o700)
                sudo_calls = [args for name, args in calls if name == "sudo"]
                self.assertEqual(len(sudo_calls), 6)
                self.assertTrue(any("770" in args for args in sudo_calls))
                self.assertTrue(any("660" in args for args in sudo_calls))
            if stage in ("safety", "authentication") or cancel:
                self.assertFalse((root / "wiped").exists())
                self.assertFalse(safety)
            if stage == "extract": self.assertTrue((root / "cleaned").exists())
            if cancel: self.assertFalse(any(name == "sudo" for name, _ in calls))

    def test_keychain_and_binary_stream(self):
        self.run_fixture()

    def test_option_like_password(self):
        self.run_fixture(password="-n test-only-password")

    def test_interactive_selection(self):
        self.run_fixture(interactive=True)

    def test_prompt_and_retry_preserve_literal_password(self):
        for stage in ("missing-keychain", "retry"):
            with self.subTest(stage=stage): self.run_fixture(stage)

    def test_cancellation(self):
        self.run_fixture(cancel=True)

    def test_failures_stop_restore(self):
        for stage in ("safety", "upload", "extract", "wipe", "permissions", "authentication"):
            with self.subTest(stage=stage): self.run_fixture(stage)


if __name__ == "__main__":
    unittest.main()
