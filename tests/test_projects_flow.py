"""Projects + connectors flow — verifies the new tables exist and that we can
round-trip a project + project_repos record. Hits real InsForge; gated on env.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
import uuid

import pytest

from tests.conftest import needs_insforge, needs_org_id


def _req(method: str, url: str, key: str, path: str, payload=None):
    data = None
    headers = {"x-api-key": key}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
        # InsForge POST follows PostgREST: without this header inserts return [].
        headers["Prefer"] = "return=representation"
    req = urllib.request.Request(url + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as r:
        body = r.read().decode()
        return r.status, (json.loads(body) if body else None)


def _get(url, key, path):
    return _req("GET", url, key, path)


def _post(url, key, path, payload):
    return _req("POST", url, key, path, payload)


def _delete(url, key, path):
    return _req("DELETE", url, key, path)


@needs_insforge
def test_new_tables_present(insforge_url, insforge_key):
    """projects, project_repos, oauth_tokens must exist on the tenant."""
    status, tables = _get(insforge_url, insforge_key, "/api/database/tables")
    assert status == 200
    must_have = {"projects", "project_repos", "oauth_tokens"}
    missing = must_have - set(tables)
    assert not missing, f"missing tables: {missing}"


@needs_insforge
@needs_org_id
def test_project_with_repos_roundtrip(insforge_url, insforge_key, org_id):
    """Insert a project, attach a repo via project_repos, read it back, clean up."""
    # Ensure we have at least one org_repo to attach. Reuse if present, else seed.
    status, repos = _get(
        insforge_url,
        insforge_key,
        f"/api/database/records/org_repos?org_id=eq.{org_id}&limit=1",
    )
    assert status == 200
    cleanup_repo_id = None
    if repos:
        repo_id = repos[0]["id"]
    else:
        status, created = _post(
            insforge_url,
            insforge_key,
            "/api/database/records/org_repos",
            {
                "org_id": org_id,
                "github_full_name": f"kitrakrev/test-{uuid.uuid4().hex[:8]}",
                "default_branch": "main",
            },
        )
        assert status in (200, 201)
        row = created[0] if isinstance(created, list) else created
        repo_id = row["id"]
        cleanup_repo_id = repo_id

    # Insert project.
    project_name = f"pytest project {uuid.uuid4().hex[:8]}"
    status, created = _post(
        insforge_url,
        insforge_key,
        "/api/database/records/projects",
        {
            "org_id": org_id,
            "name": project_name,
            "description": "smoke test project",
        },
    )
    assert status in (200, 201)
    project = created[0] if isinstance(created, list) else created
    project_id = project["id"]

    try:
        # Attach repo.
        status, attached = _post(
            insforge_url,
            insforge_key,
            "/api/database/records/project_repos",
            {"project_id": project_id, "org_repo_id": repo_id},
        )
        assert status in (200, 201)
        link = attached[0] if isinstance(attached, list) else attached
        link_id = link["id"]

        # Read back: by project_id.
        status, links = _get(
            insforge_url,
            insforge_key,
            f"/api/database/records/project_repos?project_id=eq.{project_id}",
        )
        assert status == 200
        assert any(l["org_repo_id"] == repo_id for l in links)

        # Read project back, scoped by org_id.
        status, projects = _get(
            insforge_url,
            insforge_key,
            f"/api/database/records/projects?id=eq.{project_id}&org_id=eq.{org_id}",
        )
        assert status == 200
        assert len(projects) == 1
        assert projects[0]["name"] == project_name
        assert projects[0]["org_id"] == org_id

        # Cleanup link.
        _delete(
            insforge_url,
            insforge_key,
            f"/api/database/records/project_repos?id=eq.{link_id}",
        )
    finally:
        # Cleanup project.
        _delete(
            insforge_url,
            insforge_key,
            f"/api/database/records/projects?id=eq.{project_id}",
        )
        if cleanup_repo_id:
            _delete(
                insforge_url,
                insforge_key,
                f"/api/database/records/org_repos?id=eq.{cleanup_repo_id}",
            )


@needs_insforge
def test_oauth_tokens_table_writable(insforge_url, insforge_key):
    """oauth_tokens accepts inserts (even if no rows exist yet)."""
    fake_user = str(uuid.uuid4())
    status, created = _post(
        insforge_url,
        insforge_key,
        "/api/database/records/oauth_tokens",
        {
            "user_id": fake_user,
            "provider": "github",
            "access_token": "ghs_TEST_DELETE_ME",
            "github_login": "test-user",
            "scopes": "read:user repo",
        },
    )
    assert status in (200, 201)
    row = created[0] if isinstance(created, list) else created
    try:
        status, rows = _get(
            insforge_url,
            insforge_key,
            f"/api/database/records/oauth_tokens?user_id=eq.{fake_user}",
        )
        assert status == 200
        assert len(rows) >= 1
        assert rows[0]["provider"] == "github"
    finally:
        _delete(
            insforge_url,
            insforge_key,
            f"/api/database/records/oauth_tokens?id=eq.{row['id']}",
        )
