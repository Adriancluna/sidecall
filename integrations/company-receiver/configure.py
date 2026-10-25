"""Private local setup; no network requests, deployments, or account changes."""
from pathlib import Path
import getpass
import json
import os
import re
import secrets
from urllib.parse import urlparse


def main():
    root = Path(__file__).resolve().parents[2]
    destination = root / ".env.receiver.local"
    if destination.exists() or destination.is_symlink():
        print("Receiver configuration already exists. Ask Pegasus to verify it locally; do not paste its contents into chat.")
        return
    print("Sidecall company receiver — private setup")
    print("This saves credentials locally with account-changing operations OFF. It does not contact Okta.")
    entered = input("Paste the URL from your Okta admin browser address bar: ").strip()
    parsed = urlparse(entered)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port or not re.fullmatch(r"[a-z0-9-]+\.(?:okta\.com|oktapreview\.com|okta-emea\.com)", host):
        raise ValueError("Use the HTTPS address of your Okta tenant.")
    label, domain = host.split(".", 1)
    if label.endswith("-admin"):
        label = label[:-6]
    org = f"https://{label}.{domain}"
    token = getpass.getpass("Paste the receiver-only Okta API token (typing stays hidden), then press Return: ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.~=-]{20,512}", token):
        raise ValueError("Token format was not accepted; nothing was saved.")
    values = {
        "OKTA_ORG_URL": org,
        "OKTA_API_TOKEN": token,
        "RECEIVER_SIGNING_SECRET": secrets.token_hex(32),
        "RECEIVER_COMPANY_ID": "cedar-ridge",
        "RECEIVER_TARGETS_JSON": "{}",
        "RECEIVER_ENABLED": "false",
        "RECEIVER_MAX_PAUSES_PER_HOUR": "3",
    }
    content = "# Private receiver configuration. Not used by Convex or the browser.\n"
    content += "\n".join(f"{key}={json.dumps(value)}" for key, value in values.items()) + "\n"
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write(content)
    print("Saved private local configuration. Provider actions remain OFF and no users are allowlisted.")
    print("Tell Pegasus 'receiver credentials saved'. Do not send the token or file contents.")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nSetup cancelled.")
    except Exception:
        print("Setup could not finish. Check the address/token format and retry; no credentials are printed.")
