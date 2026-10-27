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
if name in ("ssh", "scp"):
    calls = [json.loads(line) for line in (root / "calls.jsonl").read_text().splitlines()]
    connection = sum(name in ("ssh", "scp") for name, _ in calls)
    def event(kind):
        with (root / "events.jsonl").open("a") as log:
            log.write(json.dumps([kind, name, connection]) + "\n")
    options = [args[i + 1] for i, arg in enumerate(args[:-1]) if arg == "-o"]
    effective = {}
    for option in options:
        key, value = option.split("=", 1)
        if key == "NoHostAuthenticationForProxyCommand" and os.environ["SSH_CLIENT"] == "portable":
            assert key in effective.get("IgnoreUnknown", "").split(","), "unsupported Apple option"
            continue
        effective.setdefault(key, value)
    ambient = os.environ["AMBIENT_TRUST"]
    bypass = (
        (ambient == "localhost" and effective.get("NoHostAuthenticationForLocalhost", "yes") == "yes") or
        (ambient == "proxy" and os.environ["SSH_CLIENT"] == "apple" and
         effective.get("NoHostAuthenticationForProxyCommand", "yes") == "yes") or
        (ambient == "dns" and effective.get("VerifyHostKeyDNS", "yes") == "yes") or
        (ambient == "multiplex" and effective.get("ControlPath", "configured-socket") != "none")
    )
    key_state = os.environ["HOST_KEY_STATE"]
    if key_state != "pinned" and connection >= int(os.environ["REJECT_AT"]):
        # Model OpenSSH rejecting identity before its password prompt or remote action.
        if effective.get("StrictHostKeyChecking") == "yes" and not bypass:
            event("host-rejected")
            sys.exit(int(os.environ["HOST_FAILURE_STATUS"]))
    event("password-prompt")
    assert os.read(3, 65536) == (password + "\n").encode(), "incorrect auth FD"
    os.close(3)
    event("password-read")
    event("remote-action")
if name == "security":
    if mode != "missing-keychain": print(password)
elif name == "sshpass":
    assert args[:2] == ["-d", "3"]
    # Defer reading the synthetic authentication FD until the peer is verified.
    sys.exit(subprocess.call(args[2:], pass_fds=(3,)))
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
    def run_fixture(self, stage="", interactive=False, cancel=False, password=FAKE_PASSWORD,
                    host_key="pinned", reject_at=1, host_failure_status=255,
                    ambient_trust="default", ssh_client="apple"):
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
                "HOST_KEY_STATE": host_key, "REJECT_AT": str(reject_at),
                "HOST_FAILURE_STATUS": str(host_failure_status),
                "AMBIENT_TRUST": ambient_trust, "SSH_CLIENT": ssh_client,
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
            events = [json.loads(line) for line in (root / "events.jsonl").read_text().splitlines()]
            transports = [args for name, args in calls if name in ("ssh", "scp")]
            rejected = host_key != "pinned"
            success = not rejected and not cancel and stage not in (
                "safety", "upload", "extract", "wipe", "permissions", "authentication")
            if rejected:
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(["host-rejected", "scp" if reject_at == 6 else "ssh", reject_at], events)
                self.assertFalse(any(kind != "host-rejected" and number >= reject_at
                                     for kind, _, number in events), events)
                if reject_at <= 6:
                    self.assertFalse((root / "uploaded.tar.gz").exists())
                if reject_at == 1:
                    self.assertFalse(any(kind != "host-rejected" for kind, _, _ in events))
                    self.assertEqual(len(transports), 1)
                    if stage != "missing-keychain":
                        self.assertNotIn("Enter your SSH password", result.stdout)
                    self.assertNotIn("Are you SURE", result.stdout)
            else:
                self.assertEqual(result.returncode, 0 if success or cancel else 1,
                                 result.stdout + result.stderr)
            for args in transports:
                self.assertEqual(args[:2], ["-o", "StrictHostKeyChecking=yes"])
                for option in ("VerifyHostKeyDNS=no", "ControlPath=none",
                               "NoHostAuthenticationForLocalhost=no",
                               "NoHostAuthenticationForProxyCommand=no"):
                    self.assertIn(option, args)
                self.assertNotIn("StrictHostKeyChecking=no", args)
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
            if stage in ("safety", "authentication") or cancel or (rejected and reject_at <= 4):
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

    def test_unverified_keys_abort_every_connection_before_authentication(self):
        for key in ("unknown", "changed"):
            # Probe, stop, path lookup, backup, wipe, upload, extract, cleanup,
            # ownership, directory modes, file modes, and restart.
            for connection in range(1, 13):
                with self.subTest(key=key, connection=connection):
                    self.run_fixture(host_key=key, reject_at=connection)

    def test_host_key_failures_do_not_prompt_for_another_password(self):
        for key, status in (("unknown", 6), ("changed", 7)):
            with self.subTest(key=key, status=status):
                self.run_fixture(host_key=key, host_failure_status=status)

    def test_key_rejected_after_password_retry(self):
        for key in ("unknown", "changed"):
            with self.subTest(key=key):
                self.run_fixture(stage="retry", host_key=key, reject_at=2)

    def test_unverified_key_with_manually_entered_password(self):
        for key in ("unknown", "changed"):
            with self.subTest(key=key):
                self.run_fixture(stage="missing-keychain", host_key=key)

    def test_ambient_trust_cannot_bypass_known_hosts(self):
        for ambient in ("localhost", "proxy", "dns", "multiplex"):
            for key in ("unknown", "changed"):
                for connection in (1, 4, 6):
                    with self.subTest(ambient=ambient, key=key, connection=connection):
                        self.run_fixture(host_key=key, reject_at=connection, ambient_trust=ambient)

    def test_portable_client_ignores_only_apple_specific_option(self):
        self.run_fixture(ssh_client="portable")
        self.run_fixture(ssh_client="portable", host_key="unknown", reject_at=6)


if __name__ == "__main__":
    unittest.main()
