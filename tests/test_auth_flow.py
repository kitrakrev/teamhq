"""Auth flow tests against the live InsForge backend.

Real signup + signin + public-config. urllib only — no extra deps.
"""
from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request

from tests.conftest import needs_insforge


def _post(url: str, path: str, body: dict, headers: dict | None = None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url + path,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def _get(url: str, path: str):
    req = urllib.request.Request(url + path)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status, json.loads(r.read().decode())


def _rand_email() -> str:
    return f"authtest+{secrets.token_hex(6)}@teamhq.demo"


@needs_insforge
def test_public_config_email_verification_disabled(insforge_url):
    status, cfg = _get(insforge_url, "/api/auth/public-config")
    assert status == 200
    # Field name per the brief: requireEmailVerification
    assert cfg.get("requireEmailVerification") is False, cfg


@needs_insforge
def test_public_config_oauth_providers(insforge_url):
    status, cfg = _get(insforge_url, "/api/auth/public-config")
    assert status == 200
    providers = cfg.get("oAuthProviders") or cfg.get("oauthProviders") or []
    # Both shared-key providers should be enabled.
    assert "github" in providers
    assert "google" in providers


@needs_insforge
def test_signup_returns_access_token(insforge_url):
    email = _rand_email()
    status, body = _post(
        insforge_url,
        "/api/auth/users",
        {"email": email, "password": "test-password-123", "name": "Auth Test"},
    )
    assert status in (200, 201), (status, body)
    assert body.get("accessToken"), body
    assert body.get("user", {}).get("email") == email


@needs_insforge
def test_signin_after_signup_returns_access_token(insforge_url):
    email = _rand_email()
    pw = "test-password-123"
    s1, b1 = _post(
        insforge_url,
        "/api/auth/users",
        {"email": email, "password": pw, "name": "Auth Test"},
    )
    assert s1 in (200, 201), (s1, b1)

    s2, b2 = _post(
        insforge_url,
        "/api/auth/sessions",
        {"email": email, "password": pw},
    )
    assert s2 in (200, 201), (s2, b2)
    assert b2.get("accessToken"), b2
