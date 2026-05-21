from __future__ import annotations

from fastapi.testclient import TestClient

from labelhub_api.main import create_app


def test_health_contract_returns_camel_case_fields() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "labelhub-api"
    assert "serverTime" in body
    assert "server_time" not in body


def test_me_requires_cookie_session_with_structured_error() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/api/auth/me", headers={"X-Request-ID": "req_test_unauthorized"})

    assert response.status_code == 401
    assert response.headers["X-Request-ID"] == "req_test_unauthorized"
    assert response.json() == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "请先登录。",
            "details": None,
            "requestId": "req_test_unauthorized",
        }
    }


def test_login_me_logout_flow_sets_and_clears_http_only_cookie() -> None:
    with TestClient(create_app()) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"email": "owner@labelhub.dev", "password": "labelhub123"},
        )
        assert login_response.status_code == 200
        assert "httponly" in login_response.headers["set-cookie"].lower()
        body = login_response.json()
        assert body["user"]["role"] == "OWNER"
        assert body["user"]["createdAt"]
        assert body["session"]["expiresAt"]

        me_response = client.get("/api/auth/me")
        assert me_response.status_code == 200
        assert me_response.json()["email"] == "owner@labelhub.dev"

        logout_response = client.post("/api/auth/logout")
        assert logout_response.status_code == 200
        assert logout_response.json() == {"success": True}


def test_invalid_login_uses_uniform_error_shape() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/auth/login",
            json={"email": "owner@labelhub.dev", "password": "wrong"},
            headers={"X-Request-ID": "req_invalid_login"},
        )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert response.json()["error"]["requestId"] == "req_invalid_login"
